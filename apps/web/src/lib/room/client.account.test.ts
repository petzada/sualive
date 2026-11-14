/** Cliente da sala com conta, sala de link fixo, tema e limites por pessoa (entrega 2). */
import {
  FREE_VIDEO_QUALITY,
  PLUS_VIDEO_QUALITY,
  PLUS_VIDEOS_PER_PERSON,
  RELAY_VIDEO_QUALITY,
  ROOM_MAX_PEOPLE,
  VIDEOS_PER_PERSON,
} from "@sualive/config";
import type { Participant, RoomSettings, ServerMessage } from "@sualive/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomClient } from "./client";
import {
  CODE,
  createHarness,
  meUser,
  ORIGIN,
  participant,
  PLUS_PLAN,
  welcomeDefaults,
  type Harness,
} from "./testing/fakes";

const flush = () => vi.advanceTimersByTimeAsync(0);
const FIXED_KEY = "@ana";

let h: Harness;
let client: RoomClient;

const state = () => client.getSnapshot();

function start(key = CODE): RoomClient {
  client = new RoomClient(key, h.deps);
  client.retain();
  return client;
}

/** Rotas da sala fixa `@ana` no servidor falso. */
function fixedRoutes(fixed = true) {
  h.server.on("GET", `/api/rooms/${FIXED_KEY}`, () => ({
    status: 200,
    body: { status: "open", participants: 2, capacity: ROOM_MAX_PEOPLE, fixed, protected: false },
  }));
  h.server.on("POST", `/api/rooms/${FIXED_KEY}/join`, () => ({
    status: 200,
    body: { participantId: "me", nickname: "Ana Perfil" },
  }));
  h.server.on("GET", `/api/rooms/${FIXED_KEY}/ice`, () => ({
    status: 200,
    body: { iceServers: [{ urls: "stun:stun.test" }], ttlSeconds: 60, relayOnly: false },
  }));
}

interface ConnectOptions {
  key?: string;
  self?: Participant;
  others?: Participant[];
  room?: RoomSettings;
  videosPerPerson?: number;
}

async function connect({
  key = CODE,
  self = participant("me"),
  others = [participant("bob")],
  room = welcomeDefaults.room,
  videosPerPerson = VIDEOS_PER_PERSON,
}: ConnectOptions = {}) {
  start(key);
  await flush();
  await client.actions.join({ nickname: "Ana", turnstileToken: "tok" });
  h.socket.accept();
  h.socket.receive({
    type: "welcome",
    self: self.id,
    participants: [self, ...others],
    chat: [],
    room,
    limits: { ...welcomeDefaults.limits, videosPerPerson },
  });
  await flush();
}

/** Pede um vídeo e o servidor autoriza (atualizando a lista do próprio participante). */
async function grant(videoId: string, kind: "camera" | "screen", videos: Participant["videos"]) {
  const starting = client.actions.startVideo(kind);
  const request = h.socket.sentOfType("video.request").at(-1);
  h.socket.receive({
    type: "video.granted",
    requestId: request?.requestId ?? "",
    video: { id: videoId, kind },
  });
  h.socket.receive({ type: "participant.updated", participant: participant("me", { videos }) });
  await starting;
}

beforeEach(() => {
  vi.useFakeTimers();
  h = createHarness();
});

afterEach(() => {
  client?.dispose();
  vi.useRealTimers();
});

describe("sala de link fixo (@nome)", () => {
  it("usa a chave nas rotas, no WebSocket e no link, e sabe de quem é a sala antes de entrar", async () => {
    fixedRoutes();
    start(FIXED_KEY);
    expect(state().link).toBe(`${ORIGIN}/@ana`);
    await flush();
    expect(h.server.callsTo("GET", "/api/rooms/@ana")).toHaveLength(1);
    expect(state()).toMatchObject({ phase: "lobby", fixed: true, ownerHandle: "ana" });

    await client.actions.join({ nickname: "Ana", turnstileToken: "tok" });
    expect(h.server.callsTo("POST", "/api/rooms/@ana/join")).toHaveLength(1);
    expect(h.socket.url).toBe("wss://sualive.test/api/rooms/@ana/ws");

    h.socket.accept();
    // Sem token de dono na sala fixa: o servidor reconhece o dono pela conta.
    expect(h.socket.sent).toEqual([{ type: "hello" }]);
    h.socket.receive({
      type: "welcome",
      self: "me",
      participants: [participant("me", { isOwner: true })],
      chat: [],
      room: { ...welcomeDefaults.room, theme: "ocean", fixed: true, ownerHandle: "ana" },
      limits: welcomeDefaults.limits,
    });
    await flush();
    expect(state()).toMatchObject({ phase: "connected", fixed: true, ownerHandle: "ana", theme: "ocean" });
    expect(await h.media.options.getIceServers()).toEqual([{ urls: "stun:stun.test" }]);
    expect(h.server.callsTo("GET", "/api/rooms/@ana/ice")).toHaveLength(1);
  });

  it("chave @ que a sala comum não aceita fica sem ownerHandle", async () => {
    fixedRoutes(false);
    start(FIXED_KEY);
    await flush();
    expect(state()).toMatchObject({ phase: "lobby", fixed: false, ownerHandle: null });
  });

  it.each(["@A", "@ana!", "@", "@" + "a".repeat(21)])(
    "chave malformada %s vai para ended sem consultar a API",
    async (key) => {
      start(key);
      await flush();
      expect(state().phase).toBe("ended");
      expect(h.server.calls).toHaveLength(0);
    },
  );

  it("sala comum continua com /s/<código> e sem dono fixo", async () => {
    start();
    await flush();
    expect(state()).toMatchObject({ link: `${ORIGIN}/s/${CODE}`, fixed: false, ownerHandle: null });
  });
});

describe("conta", () => {
  it("sem conta: apelido do formulário, accountNickname nulo e qualidade gratuita", async () => {
    await connect();
    expect(state().accountNickname).toBeNull();
    expect(h.server.callsTo("POST", `/api/rooms/${CODE}/join`)[0]?.body).toEqual({
      nickname: "Ana",
      turnstileToken: "tok",
    });
    expect(h.media.options.quality).toEqual(FREE_VIDEO_QUALITY);
  });

  it("logado: o lobby mostra o apelido do perfil e a entrada não envia apelido", async () => {
    h.account.user = meUser();
    start();
    await flush();
    expect(state().accountNickname).toBe("Ana Perfil");
    await client.actions.join({ nickname: "ignorado", turnstileToken: "tok" });
    expect(h.server.callsTo("POST", `/api/rooms/${CODE}/join`)[0]?.body).toEqual({ turnstileToken: "tok" });
  });

  it.each([
    ["sem Plus", meUser(), FREE_VIDEO_QUALITY],
    ["com Plus", meUser({ plan: PLUS_PLAN, badges: ["plus"] }), PLUS_VIDEO_QUALITY],
  ])(
    "logado %s transmite na qualidade do próprio plano; retransmissão limitada para todos",
    async (_label, user, quality) => {
      h.account.user = user;
      await connect();
      expect(h.media.options.quality).toEqual(quality);
      expect(h.media.options.relayQuality).toEqual(RELAY_VIDEO_QUALITY);
    },
  );

  it("login e logout mudam o apelido mostrado no lobby", async () => {
    start();
    await flush();
    expect(state().accountNickname).toBeNull();
    h.account.set(meUser({ nickname: "Novo" }));
    await flush();
    expect(state().accountNickname).toBe("Novo");
    h.account.set(null);
    await flush();
    expect(state().accountNickname).toBeNull();
  });

  it("onboarding_required na entrada volta ao lobby e atualiza a conta", async () => {
    h.account.user = meUser({ onboarded: false, handle: null });
    h.server.joinError(403, "onboarding_required");
    start();
    await flush();
    await client.actions.join({ nickname: "Ana", turnstileToken: "tok" });
    await flush();
    expect(state().phase).toBe("lobby");
    expect(state().notice).toBeNull();
    expect(h.account.refresh).toHaveBeenCalledOnce();
    expect(h.sockets).toHaveLength(0);
    expect(h.reports).toEqual([]);
  });

  it("unauthorized na entrada atualiza a conta (sessão perdida) e volta ao lobby", async () => {
    h.account.user = meUser();
    h.server.joinError(401, "unauthorized");
    h.account.refresh.mockImplementationOnce(async () => {
      h.account.user = null;
    });
    start();
    await flush();
    await client.actions.join({ nickname: "Ana", turnstileToken: "tok" });
    await flush();
    expect(state().phase).toBe("lobby");
    expect(state().accountNickname).toBeNull();
  });

  it("dispose para de ouvir a conta", async () => {
    start();
    await flush();
    expect(h.account.listeners.size).toBe(1);
    client.dispose();
    expect(h.account.listeners.size).toBe(0);
  });
});

describe("vídeos por pessoa", () => {
  it("antes do welcome vale o padrão; depois, o que o servidor manda", async () => {
    start();
    expect(state().maxOwnVideos).toBe(VIDEOS_PER_PERSON);
    client.dispose();
    await connect({ videosPerPerson: PLUS_VIDEOS_PER_PERSON });
    expect(state().maxOwnVideos).toBe(PLUS_VIDEOS_PER_PERSON);
  });

  it("com 2, o segundo vídeo é pedido depois que o primeiro foi publicado", async () => {
    await connect({ videosPerPerson: 2 });
    await grant("v1", "camera", [{ id: "v1", kind: "camera" }]);
    await grant("v2", "screen", [
      { id: "v1", kind: "camera" },
      { id: "v2", kind: "screen" },
    ]);
    expect(h.socket.sentOfType("video.request")).toHaveLength(2);
    expect(state().localVideoIds).toEqual(["v1", "v2"]);
    expect(h.media.published.size).toBe(2);
  });

  it("com 1, o segundo vídeo não é pedido e vira aviso", async () => {
    await connect({ videosPerPerson: 1 });
    await grant("v1", "camera", [{ id: "v1", kind: "camera" }]);
    await client.actions.startVideo("screen");
    expect(h.socket.sentOfType("video.request")).toHaveLength(1);
    expect(state().notice).toEqual({ kind: "videoPersonLimit" });
  });

  it("um pedido por vez, mesmo com 2", async () => {
    await connect({ videosPerPerson: 2 });
    const first = client.actions.startVideo("camera");
    await client.actions.startVideo("screen");
    expect(h.socket.sentOfType("video.request")).toHaveLength(1);
    const request = h.socket.sentOfType("video.request")[0];
    h.socket.receive({ type: "video.denied", requestId: request?.requestId ?? "", reason: "room_limit" });
    await first;
  });
});

describe("tema da sala", () => {
  const fixedRoom = { ...welcomeDefaults.room, fixed: true, ownerHandle: "ana" };

  it("room.updated muda o tema para todos", async () => {
    await connect();
    expect(state().theme).toBe("default");
    const update: ServerMessage = {
      type: "room.updated",
      room: { ...welcomeDefaults.room, theme: "sunset" },
    };
    h.socket.receive(update);
    expect(state().theme).toBe("sunset");
  });

  it("setRoomTheme sai para o dono na sala fixa e espera a confirmação do servidor", async () => {
    fixedRoutes();
    await connect({ key: FIXED_KEY, self: participant("me", { isOwner: true }), room: fixedRoom });
    client.actions.setRoomTheme("forest");
    expect(h.socket.sentOfType("room.setTheme")).toEqual([{ type: "room.setTheme", theme: "forest" }]);
    expect(state().theme).toBe("default");
    h.socket.receive({ type: "room.updated", room: { ...fixedRoom, theme: "forest" } });
    expect(state().theme).toBe("forest");
  });

  it("setRoomTheme não sai para quem não é dono", async () => {
    fixedRoutes();
    await connect({ key: FIXED_KEY, room: fixedRoom });
    client.actions.setRoomTheme("forest");
    expect(h.socket.sentOfType("room.setTheme")).toEqual([]);
  });

  it("setRoomTheme não sai na sala comum, nem para o dono", async () => {
    await connect({ self: participant("me", { isOwner: true }) });
    client.actions.setRoomTheme("forest");
    expect(h.socket.sentOfType("room.setTheme")).toEqual([]);
  });
});

describe("participantes com conta", () => {
  it("carregam @nome, avatar e selos do servidor", async () => {
    await connect({
      others: [
        participant("bob", {
          handle: "bob",
          avatarUrl: "https://cdn.test/bob.png",
          badges: ["plus", "early_supporter"],
        }),
      ],
    });
    const bob = state().participants.find((p) => p.id === "bob");
    expect(bob).toMatchObject({
      handle: "bob",
      avatarUrl: "https://cdn.test/bob.png",
      badges: ["plus", "early_supporter"],
    });
    h.socket.receive({ type: "participant.updated", participant: participant("bob", { badges: [] }) });
    expect(state().participants.find((p) => p.id === "bob")?.badges).toEqual([]);
    const me = state().participants.find((p) => p.id === "me");
    expect(me).toMatchObject({ handle: null, avatarUrl: null, badges: [] });
  });
});
