import { createHash } from "node:crypto";
import { ACCOUNT_SESSION_TTL_SECONDS, TERMS_VERSION } from "@sualive/config";

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
}

/** Uma conta por cenário: nenhum teste depende do que outro fez. */
const SEEDS = {
  newcomer: { handle: null, nickname: "Nina Nova" },
  free: { handle: "e2e_gratis", nickname: "Gil" },
  plus: { handle: "e2e_plus", nickname: "Pri", plus: true },
  deleter: { handle: "e2e_excluir", nickname: "Edu" },
  leaver: { handle: "e2e_sair", nickname: "Sami" },
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
    const { userId, handle, nickname, plus, token } = account(name);
    const onboardedAt = handle === null ? "NULL" : String(now);
    statements.push(
      `INSERT INTO users (id, handle, nickname, adult_confirmed_at, terms_accepted_at, terms_version, created_at)
       VALUES (${sqlText(userId)}, ${sqlText(handle)}, ${sqlText(nickname)}, ${onboardedAt}, ${onboardedAt},
         ${handle === null ? "NULL" : sqlText(TERMS_VERSION)}, ${now});`,
      `INSERT INTO sessions (id, user_id, created_at, expires_at)
       VALUES (${sqlText(base64UrlSha256(`account-session:${token}`))}, ${sqlText(userId)}, ${now},
         ${now + ACCOUNT_SESSION_TTL_SECONDS * 1000});`,
    );
    if (plus) {
      statements.push(
        `INSERT INTO billing_subscriptions (user_id, cycle, status, period_end, created_at, updated_at)
         VALUES (${sqlText(userId)}, 'annual', 'active', ${now + 200 * DAY_MS}, ${now}, ${now});`,
      );
    }
  }
  return statements.join("\n");
}
