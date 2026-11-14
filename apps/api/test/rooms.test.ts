import {
  API_RATE_LIMIT_MAX,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_MAX_PEOPLE,
  TURN_CREDENTIAL_TTL_SECONDS,
  GUEST_SESSION_TTL_SECONDS,
} from "@sualive/config";
import {
  apiErrorSchema,
  iceServersResponseSchema,
  roomInfoResponseSchema,
  WS_CLOSE,
} from "@sualive/protocol";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOUDFLARE_STUN_URL, TURN_API_BASE } from "../src/external";
import {
  api,
  BAD_TURNSTILE,
  createRoom,
  fetchWithEnv,
  GOOD_TURNSTILE,
  join,
  mockOutboundFetch,
  openSocket,
  ORIGIN,
  postJson,
  randomIp,
  roomStub,
} from "./helpers";

beforeEach(() => {
  mockOutboundFetch();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function errorOf(response: Response) {
  return apiErrorSchema.parse(await response.json()).error;
}

describe("POST /api/rooms", () => {
  it("cria a sala com código do alfabeto e token do dono", async () => {
    const { code, ownerToken } = await createRoom();

    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    expect([...code].every((ch) => ROOM_CODE_ALPHABET.includes(ch))).toBe(true);
    expect(ownerToken.length).toBeGreaterThanOrEqual(32);
    const info = roomInfoResponseSchema.parse(await (await api(`/api/rooms/${code}`)).json());
    expect(info).toEqual({ status: "open", participants: 0, capacity: ROOM_MAX_PEOPLE, fixed: false });
  });

  it("guarda só o hash do token do dono", async () => {
    const { code, ownerToken } = await createRoom();

    const stored = await runInDurableObject(roomStub(code), async (_, state) =>
      JSON.stringify([...(await state.storage.list()).entries()]),
    );
    expect(stored).not.toContain(ownerToken);
  });

  it("recusa corpo inválido", async () => {
    const response = await postJson("/api/rooms", { turnstileToken: "" });

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe("invalid_request");
  });

  it("recusa JSON malformado", async () => {
    const response = await api("/api/rooms", { method: "POST", body: "{nao-e-json" });

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe("invalid_request");
  });

  it("recusa Turnstile reprovado", async () => {
    const response = await postJson("/api/rooms", { turnstileToken: BAD_TURNSTILE });

    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe("turnstile_failed");
  });

  it("envia o segredo, o token e o IP ao siteverify", async () => {
    const fetchSpy = mockOutboundFetch();
    await postJson("/api/rooms", { turnstileToken: GOOD_TURNSTILE }, { ip: "10.1.2.3" });

    const body = fetchSpy.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("secret")).toBeTruthy();
    expect(body.get("response")).toBe(GOOD_TURNSTILE);
    expect(body.get("remoteip")).toBe("10.1.2.3");
  });

  it(`limita a ${API_RATE_LIMIT_MAX} requisições por IP na janela`, async () => {
    const ip = randomIp();
    for (let i = 0; i < API_RATE_LIMIT_MAX; i++) {
      const response = await postJson("/api/rooms", {}, { ip });
      expect(response.status).toBe(400);
    }
    const limited = await postJson("/api/rooms", {}, { ip });
    expect(limited.status).toBe(429);
    expect(await errorOf(limited)).toBe("rate_limited");

    // Outro IP segue livre; o limite vale também no join.
    expect((await postJson("/api/rooms", {}, { ip: randomIp() })).status).toBe(400);
    const joinLimited = await postJson("/api/rooms/abcdefghij/join", {}, { ip });
    expect(joinLimited.status).toBe(429);
  });
});

describe("GET /api/rooms/:code", () => {
  it("sala que nunca existiu é `ended` e não cria estado", async () => {
    const code = "zzzzzzzzzz";
    const info = roomInfoResponseSchema.parse(await (await api(`/api/rooms/${code}`)).json());

    expect(info).toEqual({ status: "ended", participants: 0, capacity: ROOM_MAX_PEOPLE, fixed: false });
    const keys = await runInDurableObject(
      roomStub(code),
      async (_, state) => (await state.storage.list()).size,
    );
    expect(keys).toBe(0);
  });

  it("código malformado é `ended`", async () => {
    const info = roomInfoResponseSchema.parse(await (await api("/api/rooms/ABC")).json());
    expect(info.status).toBe("ended");
  });
});

describe("POST /api/rooms/:code/join", () => {
  it("grava o cookie de sessão assinado com os atributos certos", async () => {
    const { code } = await createRoom();
    const response = await postJson(`/api/rooms/${code}/join`, {
      nickname: "  Ana  ",
      turnstileToken: GOOD_TURNSTILE,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ nickname: "Ana" });
    const cookie = response.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/^__Host-sualive_session=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${GUEST_SESSION_TTL_SECONDS}`);
  });

  it("mantém o identificador da sessão e atualiza o apelido", async () => {
    const { code } = await createRoom();
    const first = await join(code, "Ana");
    const second = await join(code, "Ana Maria", { cookie: first.cookie });

    expect(second.participantId).toBe(first.participantId);
    expect(second.nickname).toBe("Ana Maria");
  });

  it("participantId muda de uma sala para outra e não é o identificador da sessão", async () => {
    const a = await createRoom();
    const b = await createRoom();
    const inA = await join(a.code, "Ana");
    const inB = await join(b.code, "Ana", { cookie: inA.cookie });

    expect(inB.participantId).not.toBe(inA.participantId);
    expect(decodeURIComponent(inA.cookie)).not.toContain(inA.participantId);
  });

  it("recusa apelido curto demais e Turnstile reprovado", async () => {
    const { code } = await createRoom();
    const short = await postJson(`/api/rooms/${code}/join`, {
      nickname: "A",
      turnstileToken: GOOD_TURNSTILE,
    });
    expect(short.status).toBe(400);
    expect(await errorOf(short)).toBe("invalid_request");

    const bad = await postJson(`/api/rooms/${code}/join`, {
      nickname: "Ana",
      turnstileToken: BAD_TURNSTILE,
    });
    expect(bad.status).toBe(403);
    expect(await errorOf(bad)).toBe("turnstile_failed");
  });

  it("sala inexistente é `room_ended`", async () => {
    const response = await postJson("/api/rooms/zzzzzzzzzy/join", {
      nickname: "Ana",
      turnstileToken: GOOD_TURNSTILE,
    });

    expect(response.status).toBe(410);
    expect(await errorOf(response)).toBe("room_ended");
  });
});

describe("GET /api/rooms/:code/ice", () => {
  it("sem chave de TURN devolve só o STUN público", async () => {
    const { code } = await createRoom();
    const guest = await join(code, "Ana");
    const response = await api(`/api/rooms/${code}/ice`, { headers: { Cookie: guest.cookie } });

    expect(response.status).toBe(200);
    expect(iceServersResponseSchema.parse(await response.json())).toEqual({
      iceServers: [{ urls: CLOUDFLARE_STUN_URL }],
      ttlSeconds: TURN_CREDENTIAL_TTL_SECONDS,
    });
  });

  it("com chave de TURN gera credenciais pela API da Cloudflare sem expor a chave", async () => {
    const { code } = await createRoom();
    const guest = await join(code, "Ana");
    const fetchSpy = mockOutboundFetch(() =>
      Response.json(
        {
          iceServers: [
            { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
            {
              urls: [
                "turn:turn.cloudflare.com:3478?transport=udp",
                "turn:turn.cloudflare.com:53?transport=udp",
              ],
              username: "usuario-temporario",
              credential: "credencial-temporaria",
            },
          ],
        },
        { status: 201 },
      ),
    );

    const response = await fetchWithEnv(
      new Request(`${ORIGIN}/api/rooms/${code}/ice`, {
        headers: { Cookie: guest.cookie, "CF-Connecting-IP": guest.ip },
      }),
      { TURN_KEY_ID: "id-da-chave", TURN_KEY_API_TOKEN: "token-secreto-da-chave" },
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("token-secreto-da-chave");
    expect(iceServersResponseSchema.parse(JSON.parse(text))).toEqual({
      iceServers: [
        { urls: ["stun:stun.cloudflare.com:3478"] },
        {
          urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
          username: "usuario-temporario",
          credential: "credencial-temporaria",
        },
      ],
      ttlSeconds: TURN_CREDENTIAL_TTL_SECONDS,
    });
    const [url, init] = fetchSpy.mock.calls.at(-1)!;
    expect(url).toBe(`${TURN_API_BASE}/id-da-chave/credentials/generate-ice-servers`);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-secreto-da-chave");
    expect(JSON.parse(init?.body as string)).toEqual({ ttl: TURN_CREDENTIAL_TTL_SECONDS });
  });

  it("sem cookie, com cookie adulterado ou sem admissão responde `unauthorized`", async () => {
    const { code } = await createRoom();
    const guest = await join(code, "Ana");
    const [name, value] = guest.cookie.split("=") as [string, string];
    const tampered = `${name}=${value.replace(/.$/, (ch) => (ch === "A" ? "B" : "A"))}`;
    const other = await createRoom();

    const attempts: Record<string, string>[] = [{}, { Cookie: tampered }];
    for (const headers of attempts) {
      const response = await api(`/api/rooms/${code}/ice`, { headers });
      expect(response.status).toBe(401);
      expect(await errorOf(response)).toBe("unauthorized");
    }
    // Cookie válido, mas sem join nesta outra sala.
    const notAdmitted = await api(`/api/rooms/${other.code}/ice`, {
      headers: { Cookie: guest.cookie },
    });
    expect(notAdmitted.status).toBe(401);
  });

  it("apelido trocado no cookie invalida a assinatura", async () => {
    const { code } = await createRoom();
    const guest = await join(code, "Ana");
    const [name, value] = guest.cookie.split("=") as [string, string];
    const decoded = decodeURIComponent(value);
    const forged = `${name}=${encodeURIComponent(decoded.replace("Ana", "Bia"))}`;

    const response = await api(`/api/rooms/${code}/ice`, { headers: { Cookie: forged } });
    expect(response.status).toBe(401);
  });
});

describe("GET /api/rooms/:code/ws", () => {
  it("sem upgrade responde `invalid_request`", async () => {
    const { code } = await createRoom();
    const response = await api(`/api/rooms/${code}/ws`);
    expect(response.status).toBe(400);
  });

  it("sem sessão fecha com WS_CLOSE.unauthorized", async () => {
    const { code } = await createRoom();
    const client = await openSocket(code);
    expect(await client.closed()).toBe(WS_CLOSE.unauthorized);
  });

  it("sala inexistente fecha com WS_CLOSE.roomEnded", async () => {
    const { code } = await createRoom();
    const guest = await join(code, "Ana");
    const client = await openSocket("zzzzzzzzzx", guest);
    expect(await client.closed()).toBe(WS_CLOSE.roomEnded);
  });

  it("cabeçalho de identidade enviado pelo cliente é ignorado", async () => {
    const { code } = await createRoom();
    const guest = await join(code, "Ana");
    const response = await api(`/api/rooms/${code}/ws`, {
      headers: {
        Upgrade: "websocket",
        Cookie: guest.cookie,
        "x-sualive-identity": encodeURIComponent(
          JSON.stringify({ participantId: "forjado", nickname: "X", ip: "1" }),
        ),
      },
      ip: guest.ip,
    });
    const ws = response.webSocket!;
    const received: string[] = [];
    ws.addEventListener("message", (event) => {
      received.push(event.data as string);
    });
    ws.accept();
    ws.send(JSON.stringify({ type: "hello" }));
    await vi.waitFor(() => expect(received.length).toBeGreaterThan(0));
    expect(JSON.parse(received[0]!)).toMatchObject({ type: "welcome", self: guest.participantId });
    ws.close();
  });
});
