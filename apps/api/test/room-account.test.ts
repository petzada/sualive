import {
  ACCOUNT_SESSION_TTL_SECONDS,
  PLUS_VIDEOS_PER_PERSON,
  ROOM_EMPTY_TTL_MS,
  ROOM_MAX_PEOPLE,
  VIDEOS_PER_PERSON,
} from "@sualive/config";
import { apiErrorSchema, joinRoomResponseSchema, roomInfoResponseSchema, WS_CLOSE } from "@sualive/protocol";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_COOKIE_HEADER_NAME, sessionIdFor } from "../src/auth/session";
import { getPlanStatus, NO_PLAN, type PlanStatus } from "../src/billing/plan";
import type * as PlanModule from "../src/billing/plan";
import { randomToken } from "../src/crypto";
import { sessions, users } from "../src/db/schema";
import { createTestUser, testDb, type TestUser } from "./account";
import { useD1 } from "./d1";
import {
  api,
  connect,
  createRoom,
  GOOD_TURNSTILE,
  join,
  mockOutboundFetch,
  openSocket,
  postJson,
  randomIp,
  roomStub,
  type Guest,
  type TestClient,
} from "./helpers";

// O plano vem da cobrança (outra tarefa): aqui ele é injetado por conta.
vi.mock("../src/billing/plan", async (importOriginal) => {
  const original = await importOriginal<typeof PlanModule>();
  return { ...original, getPlanStatus: vi.fn(async () => original.NO_PLAN) };
});

useD1();

const PLUS: PlanStatus = {
  plan: { status: "active", plus: true, cycle: "monthly", periodEnd: Date.now() + 86_400_000, renews: true },
  badges: ["plus", "early_supporter"],
};

/** Contas com Plus ativo neste teste. */
const plusUsers = new Set<string>();

beforeEach(() => {
  mockOutboundFetch();
  plusUsers.clear();
  vi.mocked(getPlanStatus).mockImplementation(async (_env, userId) =>
    plusUsers.has(userId) ? PLUS : NO_PLAN,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function errorOf(response: Response) {
  return apiErrorSchema.parse(await response.json()).error;
}

async function roomInfo(key: string) {
  return roomInfoResponseSchema.parse(await (await api(`/api/rooms/${key}`)).json());
}

/** Entra logado (o cookie é o da conta). */
async function joinAs(
  key: string,
  user: Pick<TestUser, "cookie">,
  options: { ip?: string; nickname?: string } = {},
): Promise<Guest> {
  const ip = options.ip ?? randomIp();
  const response = await postJson(
    `/api/rooms/${key}/join`,
    { nickname: options.nickname, turnstileToken: GOOD_TURNSTILE },
    { ip, cookie: user.cookie },
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const body = joinRoomResponseSchema.parse(await response.json());
  return { ...body, cookie: user.cookie, ip };
}

async function plusUser(options: Parameters<typeof createTestUser>[0] = {}) {
  const user = await createTestUser(options);
  plusUsers.add(user.userId);
  return user;
}

/** Outra sessão (outro navegador) da mesma conta. */
async function secondSession(user: TestUser): Promise<string> {
  const token = randomToken(32);
  const now = Date.now();
  await testDb()
    .insert(sessions)
    .values({
      id: await sessionIdFor(token),
      userId: user.userId,
      createdAt: now,
      expiresAt: now + ACCOUNT_SESSION_TTL_SECONDS * 1000,
    });
  return `${ACCOUNT_COOKIE_HEADER_NAME}=${token}`;
}

function alarmAt(key: string) {
  return runInDurableObject(roomStub(key), (_, state) => state.storage.getAlarm());
}

describe("entrar logado", () => {
  it("usa apelido, avatar, @nome e selos do perfil e ignora o apelido do corpo", async () => {
    const { code } = await createRoom();
    const user = await plusUser({ nickname: "Ana do Perfil", avatarUrl: "https://cdn.exemplo.com/a.png" });
    const guest = await join(code, "Convidada");
    const { client: guestClient } = await connect(code, guest);

    const member = await joinAs(code, user, { nickname: "Outro Nome" });
    expect(member.nickname).toBe("Ana do Perfil");
    const { welcome } = await connect(code, member);
    const self = welcome.participants.find((p) => p.id === member.participantId);
    expect(self).toMatchObject({
      nickname: "Ana do Perfil",
      handle: user.handle,
      avatarUrl: "https://cdn.exemplo.com/a.png",
      badges: ["plus", "early_supporter"],
      micMuted: true,
    });
    // Quem não tem conta continua igual.
    expect(welcome.participants.find((p) => p.id === guest.participantId)).toMatchObject({
      nickname: "Convidada",
      handle: null,
      avatarUrl: null,
      badges: [],
    });
    expect((await guestClient.next("participant.joined")).participant.handle).toBe(user.handle);
  });

  it("entra sem apelido no corpo; sem conta, o apelido continua obrigatório", async () => {
    const { code } = await createRoom();
    const user = await createTestUser({ nickname: "Bia" });
    const member = await joinAs(code, user);
    expect(member.nickname).toBe("Bia");

    const anonymous = await postJson(`/api/rooms/${code}/join`, { turnstileToken: GOOD_TURNSTILE });
    expect(anonymous.status).toBe(400);
    expect(await errorOf(anonymous)).toBe("invalid_request");
  });

  it("conta sem primeiro acesso concluído é recusada", async () => {
    const { code } = await createRoom();
    const user = await createTestUser({ onboarded: false });
    const response = await postJson(
      `/api/rooms/${code}/join`,
      { nickname: "Nome", turnstileToken: GOOD_TURNSTILE },
      { cookie: user.cookie },
    );
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe("onboarding_required");
  });

  it("o Turnstile vale também para quem tem conta", async () => {
    const { code } = await createRoom();
    const user = await createTestUser();
    const response = await postJson(
      `/api/rooms/${code}/join`,
      { turnstileToken: "recusado" },
      { cookie: user.cookie },
    );
    expect(await errorOf(response)).toBe("turnstile_failed");
  });

  it("a mesma conta em dois navegadores é a mesma pessoa: a conexão antiga é substituída", async () => {
    const { code } = await createRoom();
    const user = await createTestUser();
    const first = await joinAs(code, user);
    const { client: firstClient } = await connect(code, first);

    const otherBrowser = await joinAs(code, { cookie: await secondSession(user) });
    expect(otherBrowser.participantId).toBe(first.participantId);
    const { welcome } = await connect(code, otherBrowser);

    expect(await firstClient.closed()).toBe(WS_CLOSE.replaced);
    expect(welcome.participants.filter((p) => p.id === first.participantId)).toHaveLength(1);
    expect((await roomInfo(code)).participants).toBe(1);
  });

  it("o banimento de quem tem conta vale pela conta e pelo IP", async () => {
    const { code, ownerToken } = await createRoom();
    const owner = await join(code, "Dona");
    const { client: ownerClient } = await connect(code, owner, ownerToken);
    const user = await createTestUser();
    const member = await joinAs(code, user);
    const { client } = await connect(code, member);

    ownerClient.send({ type: "moderate", action: "ban", target: member.participantId });
    expect(await client.closed()).toBe(WS_CLOSE.banned);

    // A mesma conta em outro navegador e outro IP.
    const again = await postJson(
      `/api/rooms/${code}/join`,
      { turnstileToken: GOOD_TURNSTILE },
      { cookie: await secondSession(user) },
    );
    expect(await errorOf(again)).toBe("banned");
    // Sem conta, do mesmo IP.
    const sameIp = await postJson(
      `/api/rooms/${code}/join`,
      { nickname: "Disfarce", turnstileToken: GOOD_TURNSTILE },
      { ip: member.ip },
    );
    expect(await errorOf(sameIp)).toBe("banned");
  });
});

describe("vídeos pelo plano de cada pessoa", () => {
  it(`assinante transmite ${PLUS_VIDEOS_PER_PERSON} numa sala criada por alguém sem conta; quem não tem Plus segue com ${VIDEOS_PER_PERSON}`, async () => {
    const { code, ownerToken } = await createRoom();
    const owner = await join(code, "Dono sem conta");
    const { client: ownerClient, welcome: ownerWelcome } = await connect(code, owner, ownerToken);
    expect(ownerWelcome.limits.videosPerPerson).toBe(VIDEOS_PER_PERSON);

    const subscriber = await joinAs(code, await plusUser());
    const { client: plus, welcome } = await connect(code, subscriber);
    expect(welcome.limits.videosPerPerson).toBe(PLUS_VIDEOS_PER_PERSON);
    const free = await joinAs(code, await createTestUser());
    const { client: freeClient, welcome: freeWelcome } = await connect(code, free);
    expect(freeWelcome.limits.videosPerPerson).toBe(VIDEOS_PER_PERSON);

    for (let i = 0; i < PLUS_VIDEOS_PER_PERSON; i++) {
      plus.send({ type: "video.request", requestId: `p${i}`, kind: i % 2 ? "camera" : "screen" });
      await plus.next("video.granted");
    }
    plus.send({ type: "video.request", requestId: "p-extra", kind: "camera" });
    expect(await plus.next("video.denied")).toMatchObject({ requestId: "p-extra", reason: "person_limit" });

    for (const client of [ownerClient, freeClient]) {
      for (let i = 0; i < VIDEOS_PER_PERSON; i++) {
        client.send({ type: "video.request", requestId: `f${i}`, kind: i % 2 ? "screen" : "camera" });
        await client.next("video.granted");
      }
      client.send({ type: "video.request", requestId: "f-extra", kind: "screen" });
      expect(await client.next("video.denied")).toMatchObject({ reason: "person_limit" });
    }
  });

  it("sem teto de vídeos na sala direta, também com assinantes", async () => {
    const { code } = await createRoom();
    const clients: TestClient[] = [];
    for (let i = 0; i < 3; i++) {
      const member = await joinAs(code, await plusUser());
      clients.push((await connect(code, member)).client);
    }
    const [a, b, c] = clients as [TestClient, TestClient, TestClient];
    for (const client of [a, a, b, b]) {
      client.send({ type: "video.request", requestId: "r", kind: "camera" });
      await client.next("video.granted");
    }
    c.send({ type: "video.request", requestId: "r5", kind: "camera" });
    expect(await c.next("video.granted")).toMatchObject({ requestId: "r5" });
  });

  it("o plano vale na próxima conexão (consultado no servidor ao conectar)", async () => {
    const { code } = await createRoom();
    const user = await createTestUser();
    const member = await joinAs(code, user);
    expect((await connect(code, member)).welcome.limits.videosPerPerson).toBe(VIDEOS_PER_PERSON);

    plusUsers.add(user.userId);
    const { welcome } = await connect(code, member);
    expect(welcome.limits.videosPerPerson).toBe(PLUS_VIDEOS_PER_PERSON);
    expect(welcome.participants.find((p) => p.id === member.participantId)?.badges).toContain("plus");
  });
});

describe("sala de link fixo", () => {
  it("abre só com o Plus do dono; GET informa `fixed`", async () => {
    const user = await createTestUser();
    const key = `@${user.handle}`;
    expect(await roomInfo(key)).toEqual({
      status: "ended",
      participants: 0,
      capacity: ROOM_MAX_PEOPLE,
      fixed: false,
      protected: false,
    });
    const refused = await postJson(`/api/rooms/${key}/join`, {
      nickname: "Ana",
      turnstileToken: GOOD_TURNSTILE,
    });
    expect(refused.status).toBe(410);
    expect(await errorOf(refused)).toBe("room_ended");

    plusUsers.add(user.userId);
    expect(await roomInfo(key)).toEqual({
      status: "open",
      participants: 0,
      capacity: ROOM_MAX_PEOPLE,
      fixed: true,
      protected: false,
    });
    // @nome inexistente, sem primeiro acesso ou malformado: `ended`.
    expect((await roomInfo("@ninguem_aqui_x")).status).toBe("ended");
    expect((await roomInfo("@AB")).status).toBe("ended");
  });

  it("qualquer pessoa entra pelo link; o dono é reconhecido pela conta e o tema vem do perfil", async () => {
    const owner = await plusUser({ nickname: "Dona" });
    await testDb().update(users).set({ roomTheme: "ocean" }).where(eq(users.id, owner.userId));
    const key = `@${owner.handle}`;

    const guest = await join(key, "Convidado");
    // O token de dono de outra sala não dá papel aqui.
    const { ownerToken } = await createRoom();
    const { client: guestClient, welcome } = await connect(key, guest, ownerToken);
    expect(welcome.room).toEqual({
      theme: "ocean",
      fixed: true,
      ownerHandle: owner.handle,
      protected: false,
      capacity: ROOM_MAX_PEOPLE,
      maxVideos: null,
    });
    expect(welcome.participants[0]?.isOwner).toBe(false);

    const ownerJoin = await joinAs(key, owner);
    const { client: ownerClient, welcome: ownerWelcome } = await connect(key, ownerJoin);
    expect(ownerWelcome.participants.find((p) => p.id === ownerJoin.participantId)?.isOwner).toBe(true);
    expect((await guestClient.next("participant.joined")).participant.isOwner).toBe(true);

    // O dono modera.
    ownerClient.send({ type: "moderate", action: "kick", target: guest.participantId });
    expect(await guestClient.closed()).toBe(WS_CLOSE.kicked);
  });

  it("tema: só o dono Plus, grava no perfil e vale na hora para todos", async () => {
    const owner = await plusUser();
    const key = `@${owner.handle}`;
    const guest = await join(key, "Convidada");
    const { client: guestClient } = await connect(key, guest);
    const { client: ownerClient } = await connect(key, await joinAs(key, owner));

    guestClient.send({ type: "room.setTheme", theme: "forest" });
    expect(await guestClient.next("error")).toEqual({ type: "error", code: "not_allowed" });

    ownerClient.send({ type: "room.setTheme", theme: "sunset" });
    const expected = {
      type: "room.updated",
      room: {
        theme: "sunset",
        fixed: true,
        ownerHandle: owner.handle,
        protected: false,
        capacity: ROOM_MAX_PEOPLE,
        maxVideos: null,
      },
    };
    expect(await guestClient.next("room.updated")).toEqual(expected);
    expect(await ownerClient.next("room.updated")).toEqual(expected);
    const [row] = await testDb().select().from(users).where(eq(users.id, owner.userId));
    expect(row?.roomTheme).toBe("sunset");

    const late = await join(key, "Depois");
    expect((await connect(key, late)).welcome.room.theme).toBe("sunset");
  });

  it("tema trocado pelo perfil chega a quem está na sala na próxima consulta", async () => {
    const owner = await plusUser();
    const key = `@${owner.handle}`;
    const { client } = await connect(key, await join(key, "Ana"));
    await testDb().update(users).set({ roomTheme: "graphite" }).where(eq(users.id, owner.userId));
    await roomInfo(key);
    expect((await client.next("room.updated")).room.theme).toBe("graphite");
  });

  it("na sala comum ninguém define tema, nem o dono", async () => {
    const { code, ownerToken } = await createRoom();
    const owner = await joinAs(code, await plusUser());
    const { client, welcome } = await connect(code, owner, ownerToken);
    expect(welcome.room).toEqual({
      theme: "default",
      fixed: false,
      ownerHandle: null,
      protected: false,
      capacity: ROOM_MAX_PEOPLE,
      maxVideos: null,
    });
    client.send({ type: "room.setTheme", theme: "ocean" });
    expect(await client.next("error")).toEqual({ type: "error", code: "not_allowed" });
  });

  it("o link fixo sobrevive à sala vazia (o chat é apagado); a sala comum continua expirando", async () => {
    const owner = await plusUser();
    const key = `@${owner.handle}`;
    const guest = await join(key, "Ana");
    const { client } = await connect(key, guest);
    // Ocupada: o alarme confere o plano do dono de tempos em tempos.
    expect(await alarmAt(key)).not.toBeNull();
    client.send({ type: "chat.send", text: "nada fica guardado" });
    await client.next("chat.message");
    client.close();
    await vi.waitFor(async () => expect((await roomInfo(key)).participants).toBe(0));

    const before = Date.now();
    await vi.waitFor(async () => expect(await alarmAt(key)).not.toBeNull());
    expect((await alarmAt(key))! - before).toBeLessThanOrEqual(ROOM_EMPTY_TTL_MS);
    expect(await runDurableObjectAlarm(roomStub(key))).toBe(true);

    expect(await roomInfo(key)).toMatchObject({ status: "open", fixed: true });
    const leftovers = await runInDurableObject(roomStub(key), async (_, state) => [
      ...(await state.storage.list()).keys(),
    ]);
    expect(leftovers).toContain("meta");
    expect(leftovers.filter((k) => /^(chat|admission|ban):/.test(k))).toEqual([]);
    // Volta a entrar normalmente, sem o chat antigo.
    const back = await join(key, "Ana de novo", { cookie: guest.cookie, ip: guest.ip });
    expect((await connect(key, back)).welcome.chat).toEqual([]);

    // A sala comum de quem não é Plus continua acabando.
    const { code } = await createRoom();
    const person = await join(code, "Bia");
    const { client: regular } = await connect(code, person);
    regular.close();
    await vi.waitFor(async () => expect(await alarmAt(code)).not.toBeNull());
    expect(await runDurableObjectAlarm(roomStub(code))).toBe(true);
    expect((await roomInfo(code)).status).toBe("ended");
  });

  it("não é criada por POST /api/rooms: só existe pelo @nome do assinante", async () => {
    const { code } = await createRoom();
    expect((await roomInfo(code)).fixed).toBe(false);
  });

  it("quando o Plus do dono acaba: novas entradas recusadas e quem está dentro é desconectado", async () => {
    const owner = await plusUser();
    const key = `@${owner.handle}`;
    const { client } = await connect(key, await join(key, "Ana"));

    plusUsers.delete(owner.userId);
    const refused = await postJson(`/api/rooms/${key}/join`, {
      nickname: "Bia",
      turnstileToken: GOOD_TURNSTILE,
    });
    expect(await errorOf(refused)).toBe("room_ended");
    await client.next("room.ended");
    expect(await client.closed()).toBe(WS_CLOSE.roomEnded);
    expect((await roomInfo(key)).status).toBe("ended");
    // O @nome continua do dono: com o Plus de volta, a sala reabre vazia.
    plusUsers.add(owner.userId);
    expect(await roomInfo(key)).toMatchObject({ status: "open", participants: 0 });
  });

  it("a verificação periódica encerra a sala com gente dentro quando o Plus acaba", async () => {
    const owner = await plusUser();
    const key = `@${owner.handle}`;
    const { client } = await connect(key, await join(key, "Ana"));

    // Com Plus, o alarme só agenda a próxima verificação.
    expect(await runDurableObjectAlarm(roomStub(key))).toBe(true);
    expect(await alarmAt(key)).not.toBeNull();

    plusUsers.delete(owner.userId);
    expect(await runDurableObjectAlarm(roomStub(key))).toBe(true);
    await client.next("room.ended");
    expect(await client.closed()).toBe(WS_CLOSE.roomEnded);
    const keys = await runInDurableObject(
      roomStub(key),
      async (_, state) => (await state.storage.list()).size,
    );
    expect(keys).toBe(0);
  });

  it("se o dono troca de @nome, a sala passa a responder no @nome novo", async () => {
    const owner = await plusUser();
    const oldKey = `@${owner.handle}`;
    expect((await roomInfo(oldKey)).status).toBe("open");
    const newHandle = `${owner.handle!.slice(0, 15)}_novo`;
    await testDb().update(users).set({ handle: newHandle }).where(eq(users.id, owner.userId));

    expect((await roomInfo(oldKey)).status).toBe("ended");
    expect(await roomInfo(`@${newHandle}`)).toMatchObject({ status: "open", fixed: true });
    const guest = await join(`@${newHandle}`, "Ana");
    expect((await connect(`@${newHandle}`, guest)).welcome.room.ownerHandle).toBe(newHandle);
  });

  it("o @nome que passa a outra conta não herda a sala antiga", async () => {
    const first = await plusUser();
    const key = `@${first.handle}`;
    const banner = await joinAs(key, first);
    const { client: ownerClient } = await connect(key, banner);
    const guest = await join(key, "Banida");
    const { client } = await connect(key, guest);
    ownerClient.send({ type: "moderate", action: "ban", target: guest.participantId });
    expect(await client.closed()).toBe(WS_CLOSE.banned);

    // A primeira conta troca de @nome e outra assinante pega o antigo.
    await testDb()
      .update(users)
      .set({ handle: `${first.handle!.slice(0, 15)}_x` })
      .where(eq(users.id, first.userId));
    await plusUser({ handle: first.handle });
    const again = await join(key, "Banida", { cookie: guest.cookie, ip: guest.ip });
    const { welcome } = await connect(key, again);
    expect(welcome.participants.map((p) => p.id)).toEqual([guest.participantId]);
    expect(await openSocket(key, banner).then((s) => s.closed())).toBe(WS_CLOSE.unauthorized);
  });
});
