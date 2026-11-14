import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/env";
import { createTestUser } from "./account";
import { useD1 } from "./d1";
import { createRoom, GOOD_TURNSTILE, join, mockOutboundFetch, postJson } from "./helpers";
import { joinWith } from "./room-e4-helpers";

useD1();

beforeEach(() => {
  mockOutboundFetch();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function rowsFor(roomKey: string) {
  const { results } = await (env as unknown as AppEnv).DB.prepare(
    "SELECT kind, user_id, session_id, ip, room_key, created_at FROM access_log WHERE room_key = ?1 ORDER BY created_at",
  )
    .bind(roomKey)
    .all<{ kind: string; user_id: string | null; session_id: string | null; ip: string; room_key: string }>();
  return results;
}

describe("registro de acesso", () => {
  it("cada entrada em sala que deu certo grava conta ou sessão, IP e a chave da sala", async () => {
    const { code } = await createRoom();
    const guest = await join(code, "Ana");
    const user = await createTestUser();
    const member = await joinWith(code, { cookie: user.cookie }, {});

    const rows = await rowsFor(code);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "room_join", user_id: null, ip: guest.ip, room_key: code });
    expect(rows[0]!.session_id).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(rows[1]).toMatchObject({
      kind: "room_join",
      user_id: user.userId,
      session_id: null,
      ip: member.ip,
    });
  });

  it("entrada recusada não grava", async () => {
    const response = await postJson("/api/rooms/abcdefghjk/join", {
      nickname: "Ana",
      turnstileToken: GOOD_TURNSTILE,
    });
    expect(response.status).toBe(410);
    expect(await rowsFor("abcdefghjk")).toEqual([]);
  });

  it("falha ao gravar não impede a entrada", async () => {
    const { code } = await createRoom();
    const db = (env as unknown as AppEnv).DB;
    const original = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation((query: string) => {
      if (query.includes("INSERT INTO access_log")) throw new Error("D1 fora do ar");
      return original(query);
    });
    const guest = await join(code, "Bia");
    expect(guest.participantId).toBeTruthy();
  });
});
