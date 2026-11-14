import {
  CHAT_HISTORY_SIZE,
  CHAT_RATE_MAX,
  CHAT_RATE_WINDOW_MS,
  ROOM_EMPTY_TTL_MS,
  ROOM_MAX_PEOPLE,
  VIDEOS_PER_PERSON,
} from "@sualive/config";
import { apiErrorSchema, roomInfoResponseSchema, WS_CLOSE } from "@sualive/protocol";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  connect,
  createRoom,
  GOOD_TURNSTILE,
  join,
  mockOutboundFetch,
  openSocket,
  postJson,
  roomStub,
  type Guest,
  type TestClient,
} from "./helpers";

beforeEach(() => {
  mockOutboundFetch();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function roomInfo(code: string) {
  return roomInfoResponseSchema.parse(await (await api(`/api/rooms/${code}`)).json());
}

async function waitForParticipants(code: string, count: number) {
  await vi.waitFor(async () => expect((await roomInfo(code)).participants).toBe(count));
}

/** Cria a sala e coloca `count` pessoas conectadas; a primeira é a dona. */
async function roomWith(count: number) {
  const { code, ownerToken } = await createRoom();
  const people: { guest: Guest; client: TestClient }[] = [];
  for (let i = 0; i < count; i++) {
    const guest = await join(code, `Pessoa ${i + 1}`);
    const { client } = await connect(code, guest, i === 0 ? ownerToken : undefined);
    people.push({ guest, client });
  }
  return { code, ownerToken, people };
}

describe("limite de pessoas", () => {
  it(`${ROOM_MAX_PEOPLE} entram e a próxima é recusada no join`, async () => {
    const { code } = await roomWith(ROOM_MAX_PEOPLE);
    expect((await roomInfo(code)).participants).toBe(ROOM_MAX_PEOPLE);

    const response = await postJson(`/api/rooms/${code}/join`, {
      nickname: "Excedente",
      turnstileToken: GOOD_TURNSTILE,
    });
    expect(response.status).toBe(409);
    expect(apiErrorSchema.parse(await response.json()).error).toBe("room_full");
  });

  it("a lotação vale também no WebSocket (corrida entre joins)", async () => {
    const { code, people } = await roomWith(ROOM_MAX_PEOPLE - 1);
    const last = await join(code, "Última");
    const extra = await join(code, "Excedente");
    await connect(code, last);

    const refused = await openSocket(code, extra);
    expect(await refused.closed()).toBe(WS_CLOSE.roomFull);
    expect(people).toHaveLength(ROOM_MAX_PEOPLE - 1);
  });

  it("todo mundo entra mudo e os demais são avisados", async () => {
    const { code, people } = await roomWith(1);
    const guest = await join(code, "Bia");
    const { welcome } = await connect(code, guest);

    expect(welcome.self).toBe(guest.participantId);
    expect(welcome.participants).toHaveLength(2);
    expect(welcome.participants.every((p) => p.micMuted)).toBe(true);
    const joined = await people[0]!.client.next("participant.joined");
    expect(joined.participant).toMatchObject({ id: guest.participantId, nickname: "Bia" });
  });

  it("a mesma sessão em outra conexão fecha a antiga com WS_CLOSE.replaced", async () => {
    const { code, people } = await roomWith(2);
    const second = people[1]!;
    const { client: again } = await connect(code, second.guest);

    expect(await second.client.closed()).toBe(WS_CLOSE.replaced);
    expect((await roomInfo(code)).participants).toBe(2);
    again.close();
  });
});

describe("limite de vídeos", () => {
  it(`${VIDEOS_PER_PERSON} por pessoa, sem teto na sala direta; parar libera a vaga da pessoa`, async () => {
    const { people } = await roomWith(4);
    const clients = people.map((p) => p.client);
    const [a, b] = clients as [TestClient, TestClient];

    a.send({ type: "video.request", requestId: "r1", kind: "camera" });
    const granted = await a.next("video.granted");
    expect(granted.video.kind).toBe("camera");
    const updated = await b.next("participant.updated");
    expect(updated.participant.videos).toEqual([granted.video]);

    // Até o limite por pessoa; o seguinte é recusado.
    for (let i = 1; i < VIDEOS_PER_PERSON; i++) {
      a.send({ type: "video.request", requestId: `a${i}`, kind: "screen" });
      await a.next("video.granted");
    }
    a.send({ type: "video.request", requestId: "r2", kind: "screen" });
    expect(await a.next("video.denied")).toMatchObject({ requestId: "r2", reason: "person_limit" });

    // Todos transmitem o máximo deles: a sala direta não tem teto (era 4 antes da entrega 4).
    let total = VIDEOS_PER_PERSON;
    for (const client of clients.slice(1)) {
      for (let i = 0; i < VIDEOS_PER_PERSON; i++, total++) {
        client.send({ type: "video.request", requestId: `r${total}`, kind: "screen" });
        await client.next("video.granted");
      }
    }
    expect(total).toBe(4 * VIDEOS_PER_PERSON);

    // Parar libera uma vaga da própria pessoa.
    a.send({ type: "video.stop", videoId: granted.video.id });
    a.send({ type: "video.request", requestId: "r-free", kind: "camera" });
    await a.next("video.granted");
  });

  it("parar vídeo que não é seu responde not_found", async () => {
    const { people } = await roomWith(1);
    people[0]!.client.send({ type: "video.stop", videoId: "nao-existe" });
    expect(await people[0]!.client.next("error")).toEqual({ type: "error", code: "not_found" });
  });
});

describe("papéis", () => {
  it("o dono é reconhecido pelo token; token errado não dá papel", async () => {
    const { code, people } = await roomWith(1);
    const intruder = await join(code, "Intrusa");
    const { welcome } = await connect(code, intruder, "x".repeat(43));

    expect(welcome.participants.find((p) => p.id === people[0]!.guest.participantId)?.isOwner).toBe(true);
    expect(welcome.participants.find((p) => p.id === intruder.participantId)?.isOwner).toBe(false);
  });

  it("o dono sai, a sala continua sem dono e ele reassume com o mesmo token", async () => {
    const { code, ownerToken, people } = await roomWith(2);
    const [owner, other] = people as [(typeof people)[0], (typeof people)[0]];

    owner.client.close();
    await other.client.next("participant.left");
    expect((await roomInfo(code)).status).toBe("open");

    const { welcome } = await connect(code, owner.guest, ownerToken);
    expect(welcome.participants.filter((p) => p.isOwner).map((p) => p.id)).toEqual([
      owner.guest.participantId,
    ]);
    const joined = await other.client.next("participant.joined");
    expect(joined.participant.isOwner).toBe(true);
  });

  it("no máximo um dono por vez: quem chega com o token assume", async () => {
    const { code, ownerToken, people } = await roomWith(2);
    const otherDevice = await join(code, "Dono no celular");
    const { welcome } = await connect(code, otherDevice, ownerToken);

    expect(welcome.participants.filter((p) => p.isOwner).map((p) => p.id)).toEqual([
      otherDevice.participantId,
    ]);
    const demoted = await people[1]!.client.next("participant.updated");
    expect(demoted.participant).toMatchObject({ id: people[0]!.guest.participantId, isOwner: false });
  });

  it("quem não é dono não modera, e o dono não modera a si mesmo", async () => {
    const { people } = await roomWith(2);
    const [owner, other] = people as [(typeof people)[0], (typeof people)[0]];

    other.client.send({ type: "moderate", action: "kick", target: owner.guest.participantId });
    expect(await other.client.next("error")).toEqual({ type: "error", code: "not_allowed" });
    owner.client.send({ type: "moderate", action: "ban", target: owner.guest.participantId });
    expect(await owner.client.next("error")).toEqual({ type: "error", code: "not_allowed" });
  });

  it("silenciar marca micMuted e avisa o alvo com force.muted", async () => {
    const { people } = await roomWith(2);
    const [owner, other] = people as [(typeof people)[0], (typeof people)[0]];
    other.client.send({ type: "mic.set", muted: false });
    expect((await owner.client.next("participant.updated")).participant.micMuted).toBe(false);

    owner.client.send({ type: "moderate", action: "mute", target: other.guest.participantId });
    await other.client.next("force.muted");
    expect((await owner.client.next("participant.updated")).participant.micMuted).toBe(true);
  });
});

describe("banimento e remoção", () => {
  it("banido não volta pela mesma sessão nem pelo mesmo IP", async () => {
    const { code, people } = await roomWith(3);
    const [owner, banned, witness] = people as [(typeof people)[0], (typeof people)[0], (typeof people)[0]];

    owner.client.send({ type: "moderate", action: "ban", target: banned.guest.participantId });
    expect(await banned.client.next("removed")).toEqual({ type: "removed", reason: "banned" });
    expect(await banned.client.closed()).toBe(WS_CLOSE.banned);
    expect(await witness.client.next("participant.left")).toEqual({
      type: "participant.left",
      id: banned.guest.participantId,
      reason: "banned",
    });

    const body = { nickname: "De novo", turnstileToken: GOOD_TURNSTILE };
    // Mesma sessão, outro IP.
    const sameSession = await postJson(`/api/rooms/${code}/join`, body, {
      cookie: banned.guest.cookie,
    });
    expect(sameSession.status).toBe(403);
    expect(apiErrorSchema.parse(await sameSession.json()).error).toBe("banned");
    // Sessão nova, mesmo IP.
    const sameIp = await postJson(`/api/rooms/${code}/join`, body, { ip: banned.guest.ip });
    expect(apiErrorSchema.parse(await sameIp.json()).error).toBe("banned");
    // O WebSocket também recusa.
    const socket = await openSocket(code, banned.guest);
    expect(await socket.closed()).toBe(WS_CLOSE.banned);
    // Outra pessoa, de outro IP, entra.
    await join(code, "Outra");
  });

  it("removido sai e pode entrar de novo", async () => {
    const { code, people } = await roomWith(2);
    const [owner, kicked] = people as [(typeof people)[0], (typeof people)[0]];

    owner.client.send({ type: "moderate", action: "kick", target: kicked.guest.participantId });
    expect(await kicked.client.next("removed")).toEqual({ type: "removed", reason: "kicked" });
    expect(await kicked.client.closed()).toBe(WS_CLOSE.kicked);
    expect((await owner.client.next("participant.left")).reason).toBe("kicked");

    // Perdeu a admissão: precisa passar pelo join de novo.
    const withoutJoin = await openSocket(code, kicked.guest);
    expect(await withoutJoin.closed()).toBe(WS_CLOSE.unauthorized);
    const back = await join(code, "Voltei", { cookie: kicked.guest.cookie, ip: kicked.guest.ip });
    const { welcome } = await connect(code, back);
    expect(welcome.self).toBe(kicked.guest.participantId);
  });
});

describe("chat", () => {
  it(`${CHAT_RATE_MAX} mensagens passam e a seguinte, na mesma janela, é recusada`, async () => {
    const { people } = await roomWith(2);
    const [a, b] = people.map((p) => p.client) as [TestClient, TestClient];

    for (let i = 1; i <= CHAT_RATE_MAX; i++) {
      a.send({ type: "chat.send", text: `mensagem ${i}` });
      expect((await b.next("chat.message")).message.text).toBe(`mensagem ${i}`);
    }
    a.send({ type: "chat.send", text: "uma a mais" });
    expect(await a.next("error")).toEqual({ type: "error", code: "rate_limited" });
    await b.expectNone("chat.message");
  });

  it(`quem entra recebe as últimas ${CHAT_HISTORY_SIZE} mensagens`, async () => {
    const { code, people } = await roomWith(1);
    const sender = people[0]!;
    const extra = 5;
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);

    for (let i = 1; i <= CHAT_HISTORY_SIZE + extra; i++) {
      sender.client.send({ type: "chat.send", text: `m${i}` });
      await sender.client.next("chat.message");
      // Cada mensagem numa janela nova do limite.
      now += CHAT_RATE_WINDOW_MS;
    }

    const late = await join(code, "Atrasada");
    const { welcome } = await connect(code, late);
    expect(welcome.chat).toHaveLength(CHAT_HISTORY_SIZE);
    expect(welcome.chat[0]!.text).toBe(`m${extra + 1}`);
    expect(welcome.chat.at(-1)!.text).toBe(`m${CHAT_HISTORY_SIZE + extra}`);
    expect(welcome.chat[0]!.nickname).toBe("Pessoa 1");

    const stored = await runInDurableObject(
      roomStub(code),
      async (_, state) => (await state.storage.list({ prefix: "chat:" })).size,
    );
    expect(stored).toBe(CHAT_HISTORY_SIZE);
    // 205 mensagens com storage: leva mais que o prazo padrão com a suíte inteira rodando.
  }, 20_000);

  it("mensagem inválida responde invalid_message sem derrubar a conexão", async () => {
    const { people } = await roomWith(1);
    const client = people[0]!.client;

    client.send("não é json");
    expect(await client.next("error")).toEqual({ type: "error", code: "invalid_message" });
    client.send({ type: "chat.send", text: "x".repeat(5000) });
    expect(await client.next("error")).toEqual({ type: "error", code: "invalid_message" });
    client.send({ type: "chat.send", text: "ainda aqui" });
    expect((await client.next("chat.message")).message.text).toBe("ainda aqui");
  });

  it("antes do hello nada é aceito", async () => {
    const { code } = await createRoom();
    const guest = await join(code, "Ana");
    const client = await openSocket(code, guest);
    client.send({ type: "chat.send", text: "cedo demais" });
    expect(await client.next("error")).toEqual({ type: "error", code: "invalid_message" });
  });
});

describe("reações, mãos e ping", () => {
  it("reação vai para todos e a mão levantada sai em participant.updated", async () => {
    const { people } = await roomWith(2);
    const [a, b] = people.map((p) => p.client) as [TestClient, TestClient];

    a.send({ type: "reaction.send", reaction: "🎉" });
    expect(await b.next("reaction")).toMatchObject({
      from: people[0]!.guest.participantId,
      reaction: "🎉",
    });
    b.send({ type: "hand.set", raised: true });
    expect((await a.next("participant.updated")).participant.handRaised).toBe(true);
  });

  it("ping recebe pong", async () => {
    const { people } = await roomWith(1);
    people[0]!.client.send({ type: "ping" });
    await people[0]!.client.next("pong");
  });
});

describe("sinalização", () => {
  it("repassa só ao destinatário, com o remetente em `from`", async () => {
    const { people } = await roomWith(3);
    const [a, b, c] = people as [(typeof people)[0], (typeof people)[0], (typeof people)[0]];
    const data = { kind: "description", description: { type: "offer", sdp: "v=0" } } as const;

    a.client.send({ type: "signal", to: b.guest.participantId, data });
    expect(await b.client.next("signal")).toEqual({
      type: "signal",
      from: a.guest.participantId,
      data,
    });
    await c.client.expectNone("signal");
  });

  it("destinatário ausente responde not_found", async () => {
    const { people } = await roomWith(1);
    people[0]!.client.send({
      type: "signal",
      to: "ninguem",
      data: { kind: "candidate", candidate: null },
    });
    expect(await people[0]!.client.next("error")).toEqual({ type: "error", code: "not_found" });
  });
});

describe("hibernação", () => {
  it("o estado das conexões e da sala sobrevive à hibernação", async () => {
    const { code, people } = await roomWith(2);
    const [owner, other] = people as [(typeof people)[0], (typeof people)[0]];
    other.client.send({ type: "hand.set", raised: true });
    await owner.client.next("participant.updated");

    await evictDurableObject(roomStub(code));

    owner.client.send({ type: "chat.send", text: "depois de acordar" });
    expect((await other.client.next("chat.message")).message.text).toBe("depois de acordar");
    const late = await join(code, "Depois");
    const { welcome } = await connect(code, late);
    const byId = new Map(welcome.participants.map((p) => [p.id, p]));
    expect(byId.get(owner.guest.participantId)?.isOwner).toBe(true);
    expect(byId.get(other.guest.participantId)?.handRaised).toBe(true);
    expect(welcome.chat.map((m) => m.text)).toEqual(["depois de acordar"]);
  });
});

describe("encerramento", () => {
  async function alarmAt(code: string) {
    return runInDurableObject(roomStub(code), (_, state) => state.storage.getAlarm());
  }

  it("sala criada e nunca usada expira e apaga tudo", async () => {
    const before = Date.now();
    const { code } = await createRoom();

    const alarm = await alarmAt(code);
    expect(alarm).not.toBeNull();
    expect(alarm! - before).toBeGreaterThanOrEqual(ROOM_EMPTY_TTL_MS);
    expect(alarm! - before).toBeLessThan(ROOM_EMPTY_TTL_MS + 60_000);

    expect(await runDurableObjectAlarm(roomStub(code))).toBe(true);
    expect((await roomInfo(code)).status).toBe("ended");
  });

  it("a última pessoa sai, o alarme encerra a sala e apaga o storage", async () => {
    const { code, people } = await roomWith(2);
    expect(await alarmAt(code)).toBeNull();
    people[0]!.client.send({ type: "chat.send", text: "algo para apagar" });
    await people[1]!.client.next("chat.message");

    for (const person of people) person.client.close();
    await waitForParticipants(code, 0);
    await vi.waitFor(async () => expect(await alarmAt(code)).not.toBeNull());

    expect(await runDurableObjectAlarm(roomStub(code))).toBe(true);
    expect((await roomInfo(code)).status).toBe("ended");
    const keys = await runInDurableObject(
      roomStub(code),
      async (_, state) => (await state.storage.list()).size,
    );
    expect(keys).toBe(0);
    expect(await alarmAt(code)).toBeNull();

    const response = await postJson(`/api/rooms/${code}/join`, {
      nickname: "Tarde",
      turnstileToken: GOOD_TURNSTILE,
    });
    expect(response.status).toBe(410);
    expect(apiErrorSchema.parse(await response.json()).error).toBe("room_ended");
  });

  it("quem volta antes do prazo cancela o encerramento", async () => {
    const { code, people } = await roomWith(1);
    const person = people[0]!;
    person.client.close();
    await waitForParticipants(code, 0);
    await vi.waitFor(async () => expect(await alarmAt(code)).not.toBeNull());

    await connect(code, person.guest);
    expect(await alarmAt(code)).toBeNull();
    expect(await runDurableObjectAlarm(roomStub(code))).toBe(false);
    expect((await roomInfo(code)).status).toBe("open");
  });
});
