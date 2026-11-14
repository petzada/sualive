import { HANDLE_CHANGE_INTERVAL_DAYS, ROOM_THEMES, TERMS_VERSION, type RoomTheme } from "@sualive/config";
import {
  handleAvailabilityResponseSchema,
  handleSchema,
  meResponseSchema,
  meUserSchema,
  onboardingRequestSchema,
  updateMeRequestSchema,
  type HandleAvailabilityResponse,
  type MeUser,
} from "@sualive/protocol";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import { sameOriginOnly } from "../auth/csrf";
import { enabledProviders } from "../auth/providers";
import { clearAccountCookie, type UserRow } from "../auth/session";
import { getSessionUser, isOnboarded } from "../auth/viewer";
import { deleteBillingData, getPlanStatus, isBillingEnabled } from "../billing/plan";
import { createDb } from "../db";
import { users } from "../db/schema";
import type { AppEnv } from "../env";
import { apiError, isUniqueViolation, rateLimitByIp, readJson, type Env } from "./http";
import { findUserById, handleChangeAvailableAt, isReservedHandle } from "./users";

const DAY_MS = 24 * 60 * 60 * 1000;

function roomThemeOf(value: string): RoomTheme {
  return (ROOM_THEMES as readonly string[]).includes(value) ? (value as RoomTheme) : "default";
}

/** Perfil completo da conta, como o front recebe. Plano e selos vêm da cobrança. */
export async function toMeUser(env: AppEnv, user: UserRow): Promise<MeUser> {
  const { plan, badges } = await getPlanStatus(env, user.id);
  return meUserSchema.parse({
    id: user.id,
    handle: user.handle,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    onboarded: isOnboarded(user),
    badges,
    plan,
    roomTheme: roomThemeOf(user.roomTheme),
    handleChangeAvailableAt: handleChangeAvailableAt(user),
  });
}

export const me = new Hono<Env>();

// Todas as rotas que mudam estado com o cookie de conta exigem mesma origem.
me.use(sameOriginOnly);

me.get("/", async (c) => {
  const user = await getSessionUser(c);
  c.header("Cache-Control", "no-store");
  return c.json(
    meResponseSchema.parse({
      user: user ? await toMeUser(c.env, user) : null,
      providers: enabledProviders(c.env),
      billingEnabled: isBillingEnabled(c.env),
    }),
  );
});

me.post("/onboarding", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, "unauthorized");
  const body = onboardingRequestSchema.safeParse(await readJson(c));
  if (!body.success) return apiError(c, "invalid_request");
  // Primeiro acesso já concluído: não se repete (o @nome se troca pelo PATCH, com prazo).
  if (isOnboarded(user)) return apiError(c, "invalid_request");
  const { handle } = body.data;
  if (isReservedHandle(handle)) return apiError(c, "handle_reserved");

  const now = Date.now();
  try {
    // A escolha inicial do @nome não conta como troca: handleChangedAt continua nulo.
    const updated = await createDb(c.env.DB)
      .update(users)
      .set({ handle, adultConfirmedAt: now, termsAcceptedAt: now, termsVersion: TERMS_VERSION })
      .where(and(eq(users.id, user.id), isNull(users.handle)))
      .returning();
    if (updated.length === 0) return apiError(c, "invalid_request");
    return c.json(await toMeUser(c.env, updated[0]!));
  } catch (error) {
    if (isUniqueViolation(error)) return apiError(c, "handle_taken");
    throw error;
  }
});

me.patch("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, "unauthorized");
  const body = updateMeRequestSchema.safeParse(await readJson(c));
  if (!body.success) return apiError(c, "invalid_request");
  if (!isOnboarded(user)) return apiError(c, "onboarding_required");
  const { nickname, handle, roomTheme } = body.data;

  const now = Date.now();
  const changes: Partial<typeof users.$inferInsert> = {};
  if (nickname !== undefined) changes.nickname = nickname;

  const changesHandle = handle !== undefined && handle !== user.handle;
  if (changesHandle) {
    if (isReservedHandle(handle)) return apiError(c, "handle_reserved");
    if (handleChangeAvailableAt(user, now) !== null) return apiError(c, "handle_change_too_soon");
    changes.handle = handle;
    changes.handleChangedAt = now;
  }

  if (roomTheme !== undefined) {
    // O servidor decide o plano: nunca o que o navegador diz.
    const { plan } = await getPlanStatus(c.env, user.id);
    if (!plan.plus) return apiError(c, "plus_required");
    changes.roomTheme = roomTheme;
  }

  if (Object.keys(changes).length > 0) {
    // Com troca de @nome, o prazo é conferido de novo no próprio UPDATE (duas trocas simultâneas).
    const cutoff = now - HANDLE_CHANGE_INTERVAL_DAYS * DAY_MS;
    const where = changesHandle
      ? and(eq(users.id, user.id), or(isNull(users.handleChangedAt), lte(users.handleChangedAt, cutoff)))
      : eq(users.id, user.id);
    try {
      const updated = await createDb(c.env.DB).update(users).set(changes).where(where).returning();
      if (updated.length === 0) {
        return apiError(c, changesHandle ? "handle_change_too_soon" : "unauthorized");
      }
      return c.json(await toMeUser(c.env, updated[0]!));
    } catch (error) {
      // O índice único do banco é quem garante o @nome único, mesmo em corrida.
      if (isUniqueViolation(error)) return apiError(c, "handle_taken");
      throw error;
    }
  }
  const current = await findUserById(c.env, user.id);
  if (!current) return apiError(c, "unauthorized");
  return c.json(await toMeUser(c.env, current));
});

me.delete("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return apiError(c, "unauthorized");
  await deleteBillingData(c.env, user.id);
  // Cascata: apaga também os logins externos e as sessões.
  await createDb(c.env.DB).delete(users).where(eq(users.id, user.id));
  clearAccountCookie(c);
  return c.body(null, 204);
});

export const handles = new Hono<Env>();

handles.get("/:handle", rateLimitByIp("handles"), async (c) => {
  c.header("Cache-Control", "no-store");
  const parsed = handleSchema.safeParse(c.req.param("handle"));
  let result: HandleAvailabilityResponse;
  if (!parsed.success) {
    result = { available: false, reason: "invalid" };
  } else if (isReservedHandle(parsed.data)) {
    result = { available: false, reason: "reserved" };
  } else {
    const [taken] = await createDb(c.env.DB)
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, parsed.data))
      .limit(1);
    result = taken ? { available: false, reason: "taken" } : { available: true };
  }
  return c.json(handleAvailabilityResponseSchema.parse(result));
});
