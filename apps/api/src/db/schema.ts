// Esquema do D1 (Drizzle). Migrations: `pnpm db:generate` grava em `migrations/`, aplicadas pelo
// CI antes do código. Só adicionar (tabela, índice, coluna nula ou com default).
import { EARLY_SUPPORTER_LIMIT } from "@sualive/config";
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Conta. Guarda só o necessário: nada de nome civil. Excluir a conta apaga a linha (e-mail
 * inclusive) e, em cascata, logins e sessões.
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
  /**
   * Última versão dos termos que a conta viu depois do aceite (fechou a faixa de aviso ou abriu o
   * link). Nulo = só a versão aceita no primeiro acesso (`termsVersion`).
   */
  termsSeenVersion: text("terms_seen_version"),
  /**
   * E-mail vindo do Google ou do Discord, para contato e avisos de cobrança. Nulo até o primeiro
   * login depois desta coluna existir, ou se o provedor não informar um e-mail verificado.
   */
  email: text("email"),
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

// ---------- Plus e cobrança (entrega 2) ----------
// Nenhuma tabela guarda CPF: ele só passa pelo Worker a caminho da Woovi, que guarda o cliente.

/**
 * Assinatura do Plus: uma linha por conta (assinar de novo depois de encerrada reaproveita a
 * linha; o histórico fica em `billing_payments`). Só o webhook da Woovi e a rotina diária mudam o
 * estado (o cancelamento pedido pela pessoa só registra o pedido). `version` é a trava otimista
 * entre webhooks simultâneos.
 */
export const billingSubscriptions = sqliteTable(
  "billing_subscriptions",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `monthly` ou `annual`. */
    cycle: text("cycle").notNull(),
    /** `active`, `past_due`, `canceled` ou `ended`. */
    status: text("status").notNull(),
    /** Fim do período pago (ms). */
    periodEnd: integer("period_end").notNull(),
    /** Início do atraso: a primeira tentativa de cobrança da renovação que falhou (ms). */
    pastDueSince: integer("past_due_since"),
    /** Tentativas de cobrança da renovação atual que falharam. */
    failedAttempts: integer("failed_attempts").notNull().default(0),
    /**
     * `correlationID` da recorrência na Woovi (só mensal). As rotas de consulta e de cancelamento
     * da Woovi aceitam este identificador no lugar do `globalID`.
     */
    wooviCorrelationId: text("woovi_correlation_id"),
    /** Cancelamento pedido aqui (ms); a rotina diária confirma na Woovi. */
    cancelRequestedAt: integer("cancel_requested_at"),
    /** A Woovi confirmou que a recorrência não cobra mais (ms). */
    cancelConfirmedAt: integer("cancel_confirmed_at"),
    /** Aviso de vencimento do anual marcado (ms); o front mostra o aviso a partir de `periodEnd`. */
    expiryNoticeAt: integer("expiry_notice_at"),
    /** Última passagem da rotina diária (ms). */
    checkedAt: integer("checked_at"),
    version: integer("version").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("billing_subscriptions_status_idx").on(table.status, table.checkedAt),
    index("billing_subscriptions_woovi_correlation_idx").on(table.wooviCorrelationId),
  ],
);

/**
 * Cobranças do Plus: o checkout (pendente até a Woovi confirmar) e cada renovação paga. É também o
 * histórico que a entrega 3 usa para o crédito retroativo de ouro. Ao excluir a conta, as linhas
 * pagas ficam anônimas (`user_id` nulo, sem QR Code) e as demais são apagadas.
 */
export const billingPayments = sqliteTable(
  "billing_payments",
  {
    /** Identificador público (`paymentId` da API). */
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    cycle: text("cycle").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** `pending`, `paid`, `expired` ou `failed`. */
    status: text("status").notNull(),
    /** `correlationID` desta cobrança na Woovi (cobrança única, recorrência ou parcela). */
    correlationId: text("correlation_id").notNull().unique(),
    /** Recorrência da Woovi a que a cobrança pertence (só mensal). */
    wooviSubscriptionCorrelationId: text("woovi_subscription_correlation_id"),
    /** Parcela da Woovi que pagou esta linha (só mensal). */
    wooviInstallmentId: text("woovi_installment_id").unique(),
    /** Pix copia e cola e imagem do QR Code, para reaproveitar o checkout pendente. */
    brCode: text("br_code"),
    qrCodeImageUrl: text("qr_code_image_url"),
    expiresAt: integer("expires_at"),
    paidAt: integer("paid_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("billing_payments_user_idx").on(table.userId, table.status),
    index("billing_payments_subscription_idx").on(table.wooviSubscriptionCorrelationId),
  ],
);

/** Eventos de webhook da Woovi já aplicados: a chave única garante a idempotência. */
export const billingWebhookEvents = sqliteTable("billing_webhook_events", {
  eventKey: text("event_key").primaryKey(),
  processedAt: integer("processed_at").notNull(),
});

/**
 * Selo permanente de apoiador inicial dos primeiros pagantes. A posição é atribuída numa única
 * instrução no banco (sem corrida); se a conta for excluída, a linha fica anônima e a posição
 * continua ocupada.
 */
export const billingEarlySupporters = sqliteTable(
  "billing_early_supporters",
  {
    position: integer("position").primaryKey(),
    userId: text("user_id")
      .unique()
      .references(() => users.id, { onDelete: "set null" }),
    grantedAt: integer("granted_at").notNull(),
  },
  (table) => [
    check(
      "billing_early_supporters_position_check",
      sql`${table.position} BETWEEN 1 AND ${sql.raw(String(EARLY_SUPPORTER_LIMIT))}`,
    ),
  ],
);
