import { PROTECTED_ROOM_GOLD_PER_HOUR, RELAY_VIDEO_GOLD_PER_HOUR } from "@sualive/config";
import { env as workerEnv } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../src/env";
import { creditStatements, getWallet, runLedger } from "../src/wallet/ledger";
import { debitMeter, meterCharge, meterRemainingMs, meterWarnings } from "../src/wallet/meter";
import { createTestUser } from "./account";
import { useD1 } from "./d1";

useD1();

const env = workerEnv as unknown as AppEnv;
const NOW = Date.UTC(2026, 10, 20, 15, 0, 0);
const MINUTE = 60_000;

async function userWithGold(gold: number): Promise<string> {
  const { userId } = await createTestUser();
  if (gold > 0) {
    await runLedger(
      env,
      creditStatements(env, {
        userId,
        currency: "gold",
        amount: gold,
        reason: "gold_purchase",
        reference: `test:${crypto.randomUUID()}`,
        now: NOW,
      }),
    );
  }
  return userId;
}

describe("medição por minuto", () => {
  it("uma hora de tiques de um minuto cobra exatamente o preço por hora", () => {
    for (const [price, units] of [
      [PROTECTED_ROOM_GOLD_PER_HOUR, 1],
      [RELAY_VIDEO_GOLD_PER_HOUR, 1],
      [RELAY_VIDEO_GOLD_PER_HOUR, 3],
      [7, 1],
    ] as const) {
      let carry = 0;
      let total = 0;
      for (let minute = 0; minute < 60; minute++) {
        const charge = meterCharge(price, units, MINUTE, carry);
        expect(Number.isInteger(charge.gold)).toBe(true);
        total += charge.gold;
        carry = charge.carry;
      }
      expect(total).toBe(price * units);
      expect(carry).toBe(0);
    }
  });

  it("a fração que não fecha uma unidade fica para o próximo tique", () => {
    // 45 por hora = 0,75 por minuto: 0, 1, 1, 1, 0, 1, ...
    const golds: number[] = [];
    let carry = 0;
    for (let minute = 0; minute < 8; minute++) {
      const charge = meterCharge(45, 1, MINUTE, carry);
      golds.push(charge.gold);
      carry = charge.carry;
    }
    expect(golds).toEqual([0, 1, 1, 1, 0, 1, 1, 1]);
  });

  it("nada a cobrar sem unidades ou sem tempo; entrada inválida é recusada", () => {
    expect(meterCharge(500, 0, MINUTE, 0)).toEqual({ gold: 0, carry: 0 });
    expect(meterCharge(500, 1, 0, 1234)).toEqual({ gold: 0, carry: 1234 });
    expect(() => meterCharge(-1, 1, MINUTE, 0)).toThrow();
    expect(() => meterCharge(500, 1, Number.NaN, 0)).toThrow();
  });

  it("tempo restante: saldo dividido pelo preço, descontada a fração já devida", () => {
    expect(meterRemainingMs(500, 500, 1)).toBe(60 * MINUTE);
    expect(meterRemainingMs(250, 500, 1)).toBe(30 * MINUTE);
    expect(meterRemainingMs(0, 500, 1)).toBe(0);
    expect(meterRemainingMs(45, 45, 3)).toBe(20 * MINUTE);
    expect(meterRemainingMs(10, 0, 1)).toBe(Number.POSITIVE_INFINITY);
    // Meia unidade de ouro já devida (1.800.000 de 3.600.000) encurta o tempo em meia unidade.
    expect(meterRemainingMs(500, 500, 1, 1_800_000)).toBe(60 * MINUTE - 3_600);
  });

  it("avisos de 10 e de 2 minutos disparam uma vez cada e voltam depois de uma recarga", () => {
    let state = meterWarnings(11 * MINUTE, []);
    expect(state).toEqual({ fire: [], warned: [] });
    state = meterWarnings(10 * MINUTE, state.warned);
    expect(state.fire).toEqual([10]);
    state = meterWarnings(9 * MINUTE, state.warned);
    expect(state.fire).toEqual([]);
    state = meterWarnings(2 * MINUTE, state.warned);
    expect(state.fire).toEqual([2]);
    state = meterWarnings(0, state.warned);
    expect(state.fire).toEqual([]);
    // Recarga: volta a ter mais de 10 minutos, e os avisos podem acontecer de novo.
    state = meterWarnings(40 * MINUTE, state.warned);
    expect(state).toEqual({ fire: [], warned: [] });
    expect(meterWarnings(90_000, state.warned).fire).toEqual([10, 2]);
  });
});

describe("débito do tique", () => {
  it("debita com linha no livro-razão e devolve o saldo", async () => {
    const userId = await userWithGold(100);
    const result = await debitMeter(env, {
      userId,
      gold: 8,
      reason: "protected_room",
      reference: `protected:sala:${crypto.randomUUID()}`,
      now: NOW,
    });
    expect(result).toEqual({ charged: 8, exhausted: false, balance: 92 });
    const line = await env.DB.prepare(
      "SELECT amount, reason FROM wallet_ledger WHERE user_id = ?1 AND reason = 'protected_room'",
    )
      .bind(userId)
      .first();
    expect(line).toEqual({ amount: -8, reason: "protected_room" });
  });

  it("saldo menor que o tique: debita o que há, zera e avisa que acabou", async () => {
    const userId = await userWithGold(5);
    const result = await debitMeter(env, {
      userId,
      gold: 8,
      reason: "protected_room",
      reference: `protected:sala:${crypto.randomUUID()}`,
      now: NOW,
    });
    expect(result).toEqual({ charged: 5, exhausted: true, balance: 0 });
    expect((await getWallet(env, userId, NOW)).gold).toBe(0);
  });

  it("sem saldo nenhum: nada é debitado e nenhuma linha é gravada", async () => {
    const userId = await userWithGold(0);
    const result = await debitMeter(env, {
      userId,
      gold: 1,
      reason: "relay_video",
      reference: `relay:sala:${crypto.randomUUID()}`,
      now: NOW,
    });
    expect(result).toEqual({ charged: 0, exhausted: true, balance: 0 });
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM wallet_ledger WHERE user_id = ?1")
      .bind(userId)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it("o mesmo tique duas vezes debita uma vez só", async () => {
    const userId = await userWithGold(50);
    const debit = {
      userId,
      gold: 3,
      reason: "relay_video" as const,
      reference: `relay:sala:${crypto.randomUUID()}`,
      now: NOW,
    };
    expect((await debitMeter(env, debit)).charged).toBe(3);
    expect(await debitMeter(env, debit)).toEqual({ charged: 0, exhausted: false, balance: 47 });
  });

  it("tique de zero ouro não toca o banco e não esgota", async () => {
    const userId = await userWithGold(10);
    expect(
      await debitMeter(env, { userId, gold: 0, reason: "relay_video", reference: "relay:zero", now: NOW }),
    ).toEqual({ charged: 0, exhausted: false, balance: 10 });
  });
});
