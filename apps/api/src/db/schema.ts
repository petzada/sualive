// Esquema do D1 (Drizzle). Migrations: `pnpm db:generate` grava em `migrations/`, aplicadas pelo
// CI antes do código. Só adicionar (tabela, índice, coluna nula ou com default).
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Conta. Guarda só o necessário: nada de e-mail nem nome civil. Excluir a conta apaga a linha e,
 * em cascata, logins e sessões.
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  /** @nome único. Nulo até concluir o primeiro acesso. */
  handle: text("handle").unique(),
  handleChangedAt: integer("handle_changed_at"),
  /** Apelido mostrado nas salas. */
  nickname: text("nickname").notNull(),
  /** Avatar vindo do Google ou do Discord. */
  avatarUrl: text("avatar_url"),
  /** Quando declarou ter 18 anos ou mais. Nulo = primeiro acesso pendente. */
  adultConfirmedAt: integer("adult_confirmed_at"),
  termsAcceptedAt: integer("terms_accepted_at"),
  termsVersion: text("terms_version"),
  /** Tema da sala de link fixo (um de ROOM_THEMES). */
  roomTheme: text("room_theme").notNull().default("default"),
  createdAt: integer("created_at").notNull(),
});

/** Login externo (Google ou Discord) ligado a uma conta. Sem senha própria. */
export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  {
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerUserId] }),
    index("oauth_accounts_user_id_idx").on(table.userId),
  ],
);

/** Sessão própria. `id` é o hash do token do cookie HttpOnly; o token nunca é guardado. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);
