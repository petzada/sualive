import { TERMS_VERSION } from "@sualive/config";
import { apiErrorSchema, meResponseSchema, meUserSchema } from "@sualive/protocol";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMAIL_MAX_LENGTH, normalizeEmail } from "../src/auth/providers";
import { oauthAccounts, users } from "../src/db/schema";
import {
  accountRequest,
  completeLogin,
  createTestUser,
  fakeOAuthProviders,
  testDb,
  uniqueHandle,
} from "./account";
import { useD1 } from "./d1";
import { mockOutboundFetch } from "./helpers";

useD1();

afterEach(() => {
  vi.restoreAllMocks();
});

const OLD_TERMS_VERSION = "2026-01-01.1";

function discordId(): string {
  return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

async function errorOf(response: Response) {
  return apiErrorSchema.parse(await response.json()).error;
}

async function getMeUser(cookie: string) {
  const response = await accountRequest("/api/me", { cookie });
  expect(response.status).toBe(200);
  return meResponseSchema.parse(await response.json()).user;
}

async function emailOf(userId: string): Promise<string | null | undefined> {
  const [row] = await testDb().select({ email: users.email }).from(users).where(eq(users.id, userId));
  return row?.email;
}

async function userIdOfLogin(provider: "google" | "discord", providerUserId: string): Promise<string> {
  const [link] = await testDb()
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, providerUserId)));
  expect(link).toBeDefined();
  return link!.userId;
}

describe("normalizeEmail", () => {
  it("normaliza e recusa o que não tem formato de e-mail", () => {
    expect(normalizeEmail("  Maria@Example.TEST ")).toBe("maria@example.test");
    expect(normalizeEmail("sem-arroba")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("a b@c.d")).toBeNull();
    expect(normalizeEmail("a@@c.d")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    const long = `${"a".repeat(EMAIL_MAX_LENGTH - "@x.test".length + 1)}@x.test`;
    expect(long.length).toBe(EMAIL_MAX_LENGTH + 1);
    expect(normalizeEmail(long)).toBeNull();
    expect(normalizeEmail(long.slice(1))).toBe(long.slice(1));
  });
});

describe("e-mail no login", () => {
  it("cada login grava uma linha no registro de acesso, com a conta e sem derrubar o login", async () => {
    const sub = `g-${crypto.randomUUID()}`;
    mockOutboundFetch(
      fakeOAuthProviders({ acesso: { body: { sub, name: "Ana", email_verified: false } } }).handler,
    );
    const before = Date.now();
    expect((await completeLogin("google", "acesso")).accountCookie).not.toBeNull();
    expect((await completeLogin("google", "acesso")).accountCookie).not.toBeNull();
    const userId = await userIdOfLogin("google", sub);
    const { results } = await (env as unknown as { DB: D1Database }).DB.prepare(
      "SELECT kind, session_id, ip, room_key, created_at FROM access_log WHERE user_id = ?1",
    )
      .bind(userId)
      .all<{
        kind: string;
        session_id: string | null;
        ip: string;
        room_key: string | null;
        created_at: number;
      }>();
    expect(results).toHaveLength(2);
    for (const row of results) {
      expect(row).toMatchObject({ kind: "login", session_id: null, room_key: null });
      expect(row.ip).toMatch(/^[0-9a-f.:]+$/i);
      expect(row.created_at).toBeGreaterThanOrEqual(before);
    }
  });

  it("conta nova do Google grava o e-mail verificado, normalizado", async () => {
    const sub = `g-${crypto.randomUUID()}`;
    mockOutboundFetch(
      fakeOAuthProviders({
        g: { body: { sub, name: "Ana", email: "  Ana@Example.TEST ", email_verified: true } },
      }).handler,
    );
    const { response, accountCookie } = await completeLogin("google", "g");
    expect(accountCookie).not.toBeNull();
    expect(await response.text()).not.toContain("ana@example.test");
    expect(response.headers.get("Location")).not.toContain("example.test");
    expect(await emailOf(await userIdOfLogin("google", sub))).toBe("ana@example.test");
  });

  it("conta nova do Discord grava o e-mail verificado", async () => {
    const id = discordId();
    mockOutboundFetch(
      fakeOAuthProviders({
        d: { body: { id, username: "bia", email: "bia@example.test", verified: true } },
      }).handler,
    );
    const { accountCookie } = await completeLogin("discord", "d");
    expect(accountCookie).not.toBeNull();
    expect(await emailOf(await userIdOfLogin("discord", id))).toBe("bia@example.test");
  });

  it("e-mail não verificado ou inválido não é guardado, e o login continua", async () => {
    const id = discordId();
    const sub = `g-${crypto.randomUUID()}`;
    const sub2 = `g-${crypto.randomUUID()}`;
    mockOutboundFetch(
      fakeOAuthProviders({
        naoVerificado: { body: { id, username: "cris", email: "cris@example.test", verified: false } },
        textoTrue: { body: { sub, name: "Davi", email: "davi@example.test", email_verified: "true" } },
        invalido: { body: { sub: sub2, name: "Eva", email: "não é e-mail", email_verified: true } },
      }).handler,
    );
    const discord = await completeLogin("discord", "naoVerificado");
    expect(discord.accountCookie).not.toBeNull();
    expect(await emailOf(await userIdOfLogin("discord", id))).toBeNull();

    const google = await completeLogin("google", "textoTrue");
    expect(google.accountCookie).not.toBeNull();
    expect(await emailOf(await userIdOfLogin("google", sub))).toBeNull();

    const invalid = await completeLogin("google", "invalido");
    expect(invalid.accountCookie).not.toBeNull();
    expect(await emailOf(await userIdOfLogin("google", sub2))).toBeNull();
  });

  it("conta antiga sem e-mail recebe o e-mail no login seguinte", async () => {
    const id = discordId();
    const existing = await createTestUser({ oauth: { provider: "discord", providerUserId: id } });
    expect(await emailOf(existing.userId)).toBeNull();
    mockOutboundFetch(
      fakeOAuthProviders({
        volta: { body: { id, username: "fê", email: "Fe@Example.test", verified: true } },
      }).handler,
    );
    const { accountCookie } = await completeLogin("discord", "volta");
    expect((await getMeUser(accountCookie!))?.id).toBe(existing.userId);
    expect(await emailOf(existing.userId)).toBe("fe@example.test");
  });

  it("e-mail diferente no provedor substitui o guardado; sem e-mail no provedor, mantém", async () => {
    const sub = `g-${crypto.randomUUID()}`;
    const existing = await createTestUser({
      email: "antigo@example.test",
      oauth: { provider: "google", providerUserId: sub },
    });
    mockOutboundFetch(
      fakeOAuthProviders({
        semEmail: { body: { sub, name: "Gil" } },
        naoVerificado: { body: { sub, name: "Gil", email: "outro@example.test", email_verified: false } },
        novo: { body: { sub, name: "Gil", email: "novo@example.test", email_verified: true } },
      }).handler,
    );
    await completeLogin("google", "semEmail");
    expect(await emailOf(existing.userId)).toBe("antigo@example.test");
    await completeLogin("google", "naoVerificado");
    expect(await emailOf(existing.userId)).toBe("antigo@example.test");
    await completeLogin("google", "novo");
    expect(await emailOf(existing.userId)).toBe("novo@example.test");
  });

  it("excluir a conta apaga a linha com o e-mail", async () => {
    const user = await createTestUser({ email: "apagar@example.test" });
    const response = await accountRequest("/api/me", { method: "DELETE", cookie: user.cookie });
    expect(response.status).toBe(204);
    const rows = await testDb().select().from(users).where(eq(users.email, "apagar@example.test"));
    expect(rows).toEqual([]);
    expect(await emailOf(user.userId)).toBeUndefined();
  });

  it("nenhuma resposta da conta contém o e-mail", async () => {
    const email = "segredo@example.test";
    const pending = await createTestUser({ onboarded: false, email });
    const user = await createTestUser({ email, termsVersion: OLD_TERMS_VERSION });
    const bodies: string[] = [];
    const collect = async (response: Response) => {
      expect(response.status).toBeLessThan(500);
      bodies.push(await response.text(), JSON.stringify([...response.headers]));
    };
    await collect(await accountRequest("/api/me", { cookie: pending.cookie }));
    await collect(
      await accountRequest("/api/me/onboarding", {
        method: "POST",
        cookie: pending.cookie,
        body: { handle: uniqueHandle("mail"), adult: true, acceptTerms: true },
      }),
    );
    await collect(await accountRequest("/api/me", { cookie: user.cookie }));
    await collect(
      await accountRequest("/api/me", { method: "PATCH", cookie: user.cookie, body: { nickname: "Hana" } }),
    );
    await collect(await accountRequest("/api/me/terms-seen", { method: "POST", cookie: user.cookie }));
    expect(bodies.join("\n")).not.toContain(email);
    expect(bodies.join("\n")).not.toContain("segredo");
  });
});

describe("aviso de termos atualizados", () => {
  it("GET /api/me devolve termsUpdate quando a versão vista é antiga e null quando é a atual", async () => {
    const accepted = await createTestUser({ termsVersion: OLD_TERMS_VERSION });
    expect((await getMeUser(accepted.cookie))?.termsUpdate).toBe(TERMS_VERSION);

    const seenOld = await createTestUser({ termsSeenVersion: OLD_TERMS_VERSION });
    expect((await getMeUser(seenOld.cookie))?.termsUpdate).toBe(TERMS_VERSION);

    const current = await createTestUser();
    expect((await getMeUser(current.cookie))?.termsUpdate).toBeNull();

    const seenCurrent = await createTestUser({
      termsVersion: OLD_TERMS_VERSION,
      termsSeenVersion: TERMS_VERSION,
    });
    expect((await getMeUser(seenCurrent.cookie))?.termsUpdate).toBeNull();

    // Antes do primeiro acesso não há faixa: o aceite acontece lá.
    const pending = await createTestUser({ onboarded: false });
    expect((await getMeUser(pending.cookie))?.termsUpdate).toBeNull();
  });

  it("POST /api/me/terms-seen grava a versão atual e a faixa não volta (idempotente)", async () => {
    const user = await createTestUser({ termsVersion: OLD_TERMS_VERSION });
    expect((await getMeUser(user.cookie))?.termsUpdate).toBe(TERMS_VERSION);

    const response = await accountRequest("/api/me/terms-seen", { method: "POST", cookie: user.cookie });
    expect(response.status).toBe(200);
    const body = meUserSchema.parse(await response.json());
    expect(body).toMatchObject({ id: user.userId, termsUpdate: null });

    const [row] = await testDb().select().from(users).where(eq(users.id, user.userId));
    expect(row?.termsSeenVersion).toBe(TERMS_VERSION);
    // A versão aceita no primeiro acesso não muda: ver o aviso não é novo aceite.
    expect(row?.termsVersion).toBe(OLD_TERMS_VERSION);

    expect((await getMeUser(user.cookie))?.termsUpdate).toBeNull();

    const again = await accountRequest("/api/me/terms-seen", { method: "POST", cookie: user.cookie });
    expect(again.status).toBe(200);
    expect(meUserSchema.parse(await again.json()).termsUpdate).toBeNull();
  });

  it("sem sessão: 401; primeiro acesso pendente: onboarding_required; outra origem: recusado", async () => {
    const anonymous = await accountRequest("/api/me/terms-seen", { method: "POST" });
    expect(anonymous.status).toBe(401);
    expect(await errorOf(anonymous)).toBe("unauthorized");

    const pending = await createTestUser({ onboarded: false });
    const blocked = await accountRequest("/api/me/terms-seen", { method: "POST", cookie: pending.cookie });
    expect(await errorOf(blocked)).toBe("onboarding_required");
    const [pendingRow] = await testDb().select().from(users).where(eq(users.id, pending.userId));
    expect(pendingRow?.termsSeenVersion).toBeNull();

    const user = await createTestUser({ termsVersion: OLD_TERMS_VERSION });
    const evil = await accountRequest("/api/me/terms-seen", {
      method: "POST",
      cookie: user.cookie,
      origin: "https://evil.test",
    });
    expect(evil.status).toBe(400);
    expect((await getMeUser(user.cookie))?.termsUpdate).toBe(TERMS_VERSION);
  });
});
