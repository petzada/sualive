import { createHash } from "node:crypto";
import {
  ACCOUNT_SESSION_TTL_SECONDS,
  PLUS_GIFT_PRICE_GOLD,
  PROTECTED_ROOM_GOLD_PER_HOUR,
  TERMS_VERSION,
} from "@sualive/config";

/**
 * Contas da fumaça, gravadas direto no D1 local do simulador antes de o Worker subir (nenhuma rota
 * de teste no produto). O login real do Google e do Discord não roda no navegador: cada conta já
 * nasce com uma sessão, e o teste põe o cookie dela no contexto do Playwright.
 *
 * Os tokens são determinísticos (o estado do simulador é zerado a cada execução e os processos de
 * teste precisam chegar ao mesmo valor que o processo principal gravou). Só valem no simulador.
 */

/** Nome do cookie de conta, como `apps/api/src/auth/session.ts` o grava (prefixo `__Host-`). */
export const ACCOUNT_COOKIE = "__Host-sualive_account";

interface AccountSeed {
  /** Nulo = primeiro acesso pendente (sem @nome, sem aceite). */
  handle: string | null;
  nickname: string;
  /** Linha de assinatura anual ativa, como o webhook da Woovi gravaria. */
  plus?: boolean;
  /** Versão dos termos aceita no primeiro acesso; sem ela, a atual (nenhuma faixa de aviso). */
  termsVersion?: string;
  /** Saldos da carteira, gravados com a linha do livro-razão (como a prata de boas-vindas). */
  silver?: number;
  gold?: number;
}

/** Versão anterior dos termos: quem aceitou esta vê a faixa de aviso. */
const OLD_TERMS_VERSION = "2026-11-14";

/** Uma conta por cenário: nenhum teste depende do que outro fez. */
const SEEDS = {
  newcomer: { handle: null, nickname: "Nina Nova" },
  free: { handle: "e2e_gratis", nickname: "Gil" },
  plus: { handle: "e2e_plus", nickname: "Pri", plus: true },
  deleter: { handle: "e2e_excluir", nickname: "Edu" },
  leaver: { handle: "e2e_sair", nickname: "Sami" },
  termsCloser: { handle: "e2e_termos_x", nickname: "Teo", termsVersion: OLD_TERMS_VERSION },
  termsReader: { handle: "e2e_termos_link", nickname: "Lia", termsVersion: OLD_TERMS_VERSION },
  // Entrega 3: quem compra na loja, quem envia ouro (por @nome e na sala) e quem recebe.
  // A prata paga a cor (70) e não o degradê (200) depois dela; o ouro paga a moldura (200).
  shopper: { handle: "e2e_loja", nickname: "Lola", silver: 250, gold: 500 },
  // Depois de enviar 1.500, sobram 900: menos que o presente de Plus.
  giver: { handle: "e2e_envia", nickname: "Davi", silver: 300, gold: 2400 },
  receiver: { handle: "e2e_recebe", nickname: "Rita", silver: 300 },
  roomGiver: { handle: "e2e_sala_envia", nickname: "Caio", gold: 1000 },
  roomReceiver: { handle: "e2e_sala_recebe", nickname: "Nara" },
  plusGiver: { handle: "e2e_plus_envia", nickname: "Otto", gold: PLUS_GIFT_PRICE_GOLD + 10 },
  plusReceiver: { handle: "e2e_plus_recebe", nickname: "Iris" },
  // Entrega 4: assinante com ouro para 2 horas de sala protegida.
  protector: {
    handle: "e2e_protegida",
    nickname: "Vera",
    plus: true,
    gold: PROTECTED_ROOM_GOLD_PER_HOUR * 2,
  },
} satisfies Record<string, AccountSeed>;

export type AccountName = keyof typeof SEEDS;

export interface TestAccount extends AccountSeed {
  name: AccountName;
  userId: string;
  /** Valor do cookie de sessão (o D1 guarda só o hash). */
  token: string;
}

function base64UrlSha256(text: string): string {
  return createHash("sha256").update(text).digest("base64url");
}

export function account(name: AccountName): TestAccount {
  return {
    name,
    ...SEEDS[name],
    userId: `e2e-${name}`,
    // 32 bytes em base64url (43 caracteres), o formato que o Worker aceita no cookie.
    token: base64UrlSha256(`e2e-account:${name}`),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function sqlText(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}

/**
 * SQL que cria as contas e as sessões. O id da sessão é o hash do token calculado como
 * `sessionIdFor` em `apps/api/src/auth/session.ts`. O Plus é a linha de `billing_subscriptions`
 * que `getPlanStatus` lê (o caminho webhook → plano fica com os testes da API).
 */
export function seedSql(now = Date.now()): string {
  const statements: string[] = [];
  for (const name of Object.keys(SEEDS) as AccountName[]) {
    const { userId, handle, nickname, plus, token, termsVersion } = account(name);
    const seed: AccountSeed = SEEDS[name];
    const onboardedAt = handle === null ? "NULL" : String(now);
    statements.push(
      `INSERT INTO users (id, handle, nickname, adult_confirmed_at, terms_accepted_at, terms_version, created_at)
       VALUES (${sqlText(userId)}, ${sqlText(handle)}, ${sqlText(nickname)}, ${onboardedAt}, ${onboardedAt},
         ${handle === null ? "NULL" : sqlText(termsVersion ?? TERMS_VERSION)}, ${now});`,
      `INSERT INTO sessions (id, user_id, created_at, expires_at)
       VALUES (${sqlText(base64UrlSha256(`account-session:${token}`))}, ${sqlText(userId)}, ${now},
         ${now + ACCOUNT_SESSION_TTL_SECONDS * 1000});`,
    );
    const balances = { silver: seed.silver ?? 0, gold: seed.gold ?? 0 };
    if (balances.silver > 0 || balances.gold > 0) {
      statements.push(
        `INSERT INTO wallets (user_id, silver, gold, updated_at)
         VALUES (${sqlText(userId)}, ${balances.silver}, ${balances.gold}, ${now});`,
      );
      for (const currency of ["silver", "gold"] as const) {
        if (balances[currency] === 0) continue;
        statements.push(
          `INSERT INTO wallet_ledger (id, user_id, currency, amount, reason, reference, created_at)
           VALUES (${sqlText(`e2e-${name}-${currency}`)}, ${sqlText(userId)}, '${currency}', ${balances[currency]},
             '${currency === "silver" ? "welcome" : "gold_purchase"}', ${sqlText(`e2e:${name}:${currency}`)}, ${now});`,
        );
      }
    }
    if (plus) {
      statements.push(
        `INSERT INTO billing_subscriptions (user_id, cycle, status, period_end, created_at, updated_at)
         VALUES (${sqlText(userId)}, 'annual', 'active', ${now + 200 * DAY_MS}, ${now}, ${now});`,
      );
    }
  }
  return statements.join("\n");
}
