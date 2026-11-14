import { apiErrorSchema, meResponseSchema, meUserSchema } from "@sualive/protocol";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findUserByHandle } from "../src/account";
import { deleteBillingData, getPlanStatus, NO_PLAN, type PlanStatus } from "../src/billing/plan";
import { oauthAccounts, sessions, users } from "../src/db/schema";
import type * as PlanModule from "../src/billing/plan";
import type { AppEnv } from "../src/env";
import { accountRequest, createTestUser, setCookies, testDb } from "./account";
import { useD1 } from "./d1";

// O plano vem da cobrança (outra tarefa): aqui ele é injetado.
vi.mock("../src/billing/plan", async (importOriginal) => {
  const original = await importOriginal<typeof PlanModule>();
  return {
    ...original,
    getPlanStatus: vi.fn(async () => original.NO_PLAN),
    deleteBillingData: vi.fn(async () => {}),
  };
});

useD1();

const PLUS: PlanStatus = {
  plan: { status: "active", plus: true, cycle: "monthly", periodEnd: Date.now() + 86_400_000, renews: true },
  badges: ["plus", "early_supporter"],
};

afterEach(() => {
  vi.mocked(getPlanStatus).mockReset();
  vi.mocked(getPlanStatus).mockResolvedValue(NO_PLAN);
  vi.mocked(deleteBillingData).mockClear();
});

describe("tema de sala e plano", () => {
  it("só com Plus ativo segundo a cobrança", async () => {
    const user = await createTestUser();
    vi.mocked(getPlanStatus).mockResolvedValue(NO_PLAN);
    const refused = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { roomTheme: "forest" },
    });
    expect(refused.status).toBe(403);
    expect(apiErrorSchema.parse(await refused.json()).error).toBe("plus_required");

    vi.mocked(getPlanStatus).mockResolvedValue(PLUS);
    const accepted = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { roomTheme: "forest" },
    });
    expect(accepted.status).toBe(200);
    const body = meUserSchema.parse(await accepted.json());
    expect(body.roomTheme).toBe("forest");
    expect(body.plan).toEqual(PLUS.plan);
    expect(body.badges).toEqual(["plus", "early_supporter"]);
    expect(getPlanStatus).toHaveBeenCalledWith(expect.anything(), user.userId);
  });

  it("GET /api/me mostra plano e selos da cobrança", async () => {
    const user = await createTestUser();
    vi.mocked(getPlanStatus).mockResolvedValue(PLUS);
    const response = await accountRequest("/api/me", { cookie: user.cookie });
    const me = meResponseSchema.parse(await response.json());
    expect(me.user?.plan.plus).toBe(true);
    expect(me.user?.badges).toEqual(["plus", "early_supporter"]);
  });
});

describe("DELETE /api/me", () => {
  it("apaga conta, logins e sessões, chama deleteBillingData e limpa o cookie", async () => {
    const user = await createTestUser({
      oauth: { provider: "google", providerUserId: `g-${crypto.randomUUID()}` },
    });
    // Uma segunda sessão (outro aparelho) também some.
    const db = testDb();
    await db.insert(sessions).values({
      id: `outra-${crypto.randomUUID()}`,
      userId: user.userId,
      createdAt: 1,
      expiresAt: Date.now() + 60_000,
    });

    const response = await accountRequest("/api/me", { method: "DELETE", cookie: user.cookie });
    expect(response.status).toBe(204);
    expect(setCookies(response).get("__Host-sualive_account")?.raw).toMatch(/Max-Age=0/);
    expect(deleteBillingData).toHaveBeenCalledWith(expect.anything(), user.userId);
    expect(await db.select().from(users).where(eq(users.id, user.userId))).toEqual([]);
    expect(await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, user.userId))).toEqual([]);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.userId))).toEqual([]);
    expect(await findUserByHandle(env as unknown as AppEnv, user.handle!)).toBeNull();

    const again = await accountRequest("/api/me", { method: "DELETE", cookie: user.cookie });
    expect(again.status).toBe(401);
  });
});
