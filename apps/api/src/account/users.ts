import {
  HANDLE_CHANGE_INTERVAL_DAYS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  RESERVED_HANDLES,
} from "@sualive/config";
import { handleSchema, type AuthProvider } from "@sualive/protocol";
import { and, eq } from "drizzle-orm";
import type { ProviderProfile } from "../auth/providers";
import type { UserRow } from "../auth/session";
import { createDb } from "../db";
import { oauthAccounts, users } from "../db/schema";
import type { AppEnv } from "../env";

/** Apelido de quem não tem nome utilizável no provedor. */
export const FALLBACK_NICKNAME = "Pessoa";

const DAY_MS = 24 * 60 * 60 * 1000;

const reserved: ReadonlySet<string> = new Set(RESERVED_HANDLES);

export function isReservedHandle(handle: string): boolean {
  return reserved.has(handle);
}

/** A partir de quando o @nome pode ser trocado de novo (ms), ou `null` se já pode. */
export function handleChangeAvailableAt(
  user: Pick<UserRow, "handleChangedAt">,
  now = Date.now(),
): number | null {
  if (user.handleChangedAt === null) return null;
  const availableAt = user.handleChangedAt + HANDLE_CHANGE_INTERVAL_DAYS * DAY_MS;
  return availableAt > now ? availableAt : null;
}

/**
 * Apelido derivado do nome no provedor: sem caracteres de controle, espaços colapsados, cortado em
 * NICKNAME_MAX_LENGTH (sem partir emoji) e com pelo menos NICKNAME_MIN_LENGTH; senão o próximo nome
 * candidato, e por fim FALLBACK_NICKNAME.
 */
export function deriveNickname(names: readonly string[]): string {
  for (const name of names) {
    const clean = name
      .normalize("NFC")
      .replace(/[\p{Cc}\p{Cf}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    // O limite do esquema conta unidades UTF-16; corta por caractere para não partir um emoji.
    let cut = "";
    for (const char of clean) {
      if (cut.length + char.length > NICKNAME_MAX_LENGTH) break;
      cut += char;
    }
    cut = cut.trim();
    if (cut.length >= NICKNAME_MIN_LENGTH && cut.length <= NICKNAME_MAX_LENGTH) return cut;
  }
  return FALLBACK_NICKNAME;
}

export async function findUserById(env: AppEnv, id: string): Promise<UserRow | null> {
  const [user] = await createDb(env.DB).select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

/** Conta pública encontrada pelo @nome (para salas e outros módulos). */
export interface PublicAccount {
  userId: string;
  handle: string;
  nickname: string;
  avatarUrl: string | null;
  roomTheme: string;
  /** Primeiro acesso concluído. */
  onboarded: boolean;
}

/** Conta pelo @nome (sem "@"), ou `null` se o @nome é inválido ou não existe. */
export async function findUserByHandle(env: AppEnv, handle: string): Promise<PublicAccount | null> {
  const parsed = handleSchema.safeParse(handle);
  if (!parsed.success) return null;
  const [user] = await createDb(env.DB).select().from(users).where(eq(users.handle, parsed.data)).limit(1);
  if (!user || user.handle === null) return null;
  return {
    userId: user.id,
    handle: user.handle,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    roomTheme: user.roomTheme,
    onboarded: user.adultConfirmedAt !== null && user.termsAcceptedAt !== null,
  };
}

async function findLinkedUser(env: AppEnv, provider: AuthProvider, providerUserId: string) {
  const [row] = await createDb(env.DB)
    .select({ user: users })
    .from(oauthAccounts)
    .innerJoin(users, eq(users.id, oauthAccounts.userId))
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, providerUserId)))
    .limit(1);
  return row?.user ?? null;
}

/**
 * Encontra a conta ligada ao login externo ou cria uma nova (apelido derivado do nome, avatar do
 * provedor, sem @nome). Em todo login o avatar é atualizado com o do provedor.
 */
export async function findOrCreateUser(
  env: AppEnv,
  provider: AuthProvider,
  profile: ProviderProfile,
): Promise<UserRow> {
  const db = createDb(env.DB);
  const existing = await findLinkedUser(env, provider, profile.providerUserId);
  if (existing) {
    if (existing.avatarUrl !== profile.avatarUrl) {
      await db.update(users).set({ avatarUrl: profile.avatarUrl }).where(eq(users.id, existing.id));
    }
    return { ...existing, avatarUrl: profile.avatarUrl };
  }

  const now = Date.now();
  const user: UserRow = {
    id: crypto.randomUUID(),
    handle: null,
    handleChangedAt: null,
    nickname: deriveNickname(profile.names),
    avatarUrl: profile.avatarUrl,
    adultConfirmedAt: null,
    termsAcceptedAt: null,
    termsVersion: null,
    roomTheme: "default",
    createdAt: now,
  };
  try {
    // Lote do D1 é uma transação: a conta não fica sem o login, nem o login sem a conta.
    await db.batch([
      db.insert(users).values(user),
      db.insert(oauthAccounts).values({
        provider,
        providerUserId: profile.providerUserId,
        userId: user.id,
        createdAt: now,
      }),
    ]);
    return user;
  } catch (error) {
    // Dois retornos simultâneos do mesmo login novo: o outro criou primeiro; usa a conta dele.
    const winner = await findLinkedUser(env, provider, profile.providerUserId);
    if (winner) return winner;
    throw error;
  }
}
