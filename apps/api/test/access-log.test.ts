import { ACCESS_LOG_RETENTION_DAYS } from "@sualive/config";
import { env as workerEnv } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { purgeAccessLog, recordAccess } from "../src/access/log";
import type { AppEnv } from "../src/env";
import { runDaily } from "../src/index";
import { createTestUser } from "./account";
import { useD1 } from "./d1";

useD1();

const env = workerEnv as unknown as AppEnv;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 20, 15, 0, 0);

async function rows(where: string, ...values: unknown[]) {
  const { results } = await env.DB.prepare(
    `SELECT kind, user_id, session_id, ip, room_key, created_at FROM access_log WHERE ${where} ORDER BY created_at`,
  )
    .bind(...values)
    .all();
  return results;
}

describe("registro de acesso", () => {
  it("grava login de conta e entrada em sala de visitante com IP, data e hora", async () => {
    const { userId } = await createTestUser();
    await recordAccess(env, { kind: "login", userId, sessionId: null, ip: "203.0.113.7", now: NOW });
    await recordAccess(env, {
      kind: "room_join",
      userId: null,
      sessionId: "sid-visitante-1",
      ip: "2001:db8::1",
      roomKey: "abcdefghjk",
      now: NOW + 1000,
    });
    expect(await rows("user_id = ?1", userId)).toEqual([
      {
        kind: "login",
        user_id: userId,
        session_id: null,
        ip: "203.0.113.7",
        room_key: null,
        created_at: NOW,
      },
    ]);
    expect(await rows("session_id = ?1", "sid-visitante-1")).toEqual([
      {
        kind: "room_join",
        user_id: null,
        session_id: "sid-visitante-1",
        ip: "2001:db8::1",
        room_key: "abcdefghjk",
        created_at: NOW + 1000,
      },
    ]);
  });

  it("tipo fora de login e room_join é recusado pelo banco", async () => {
    await expect(
      recordAccess(env, { kind: "outro" as "login", userId: null, sessionId: "s", ip: "1.1.1.1", now: NOW }),
    ).rejects.toThrow();
  });

  it("o registro sobrevive à exclusão da conta até o prazo", async () => {
    const { userId } = await createTestUser();
    await recordAccess(env, { kind: "login", userId, sessionId: null, ip: "198.51.100.9", now: NOW });
    await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(userId).run();
    expect(await rows("user_id = ?1", userId)).toHaveLength(1);
  });

  it("a limpeza apaga só o que passou do prazo de guarda", async () => {
    const tag = `purge-${crypto.randomUUID()}`;
    const old = NOW - ACCESS_LOG_RETENTION_DAYS * DAY - 1;
    const edge = NOW - ACCESS_LOG_RETENTION_DAYS * DAY;
    for (const [sessionId, now] of [
      [`${tag}-velho`, old],
      [`${tag}-limite`, edge],
      [`${tag}-novo`, NOW - DAY],
    ] as const) {
      await recordAccess(env, { kind: "room_join", userId: null, sessionId, ip: "192.0.2.1", now });
    }
    expect(await purgeAccessLog(env, NOW)).toBeGreaterThanOrEqual(1);
    const left = (await rows("session_id LIKE ?1", `${tag}-%`)).map((row) => row.session_id);
    expect(left).toEqual([`${tag}-limite`, `${tag}-novo`]);
  });

  it("a rotina diária roda a limpeza junto com a do Plus", async () => {
    const sessionId = `daily-${crypto.randomUUID()}`;
    await recordAccess(env, {
      kind: "room_join",
      userId: null,
      sessionId,
      ip: "192.0.2.2",
      now: NOW - (ACCESS_LOG_RETENTION_DAYS + 5) * DAY,
    });
    await runDaily(env, NOW);
    expect(await rows("session_id = ?1", sessionId)).toEqual([]);
  });
});
