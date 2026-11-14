/** Dublês do navegador para os testes da conta. */
import type { MeResponse, MeUser } from "@sualive/protocol";
import type { AccountDeps } from "../deps";

export interface FakeReply {
  status: number;
  body?: unknown;
}

type Route = (body: unknown) => FakeReply | Promise<FakeReply>;

export class FakeServer {
  readonly calls: Array<{ method: string; path: string; body: unknown; init?: RequestInit }> = [];
  readonly routes = new Map<string, Route>();
  /** Faz a próxima requisição falhar sem resposta (rede caída). */
  offline = false;

  on(method: string, path: string, route: Route | FakeReply): void {
    this.routes.set(`${method} ${path}`, typeof route === "function" ? route : () => route);
  }

  me(body: MeResponse): void {
    this.on("GET", "/api/me", { status: 200, body });
  }

  callsTo(method: string, path: string) {
    return this.calls.filter((c) => c.method === method && c.path === path);
  }

  readonly fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    this.calls.push({ method, path: input, body, init });
    if (this.offline) throw new TypeError("Failed to fetch");
    const route = this.routes.get(`${method} ${input}`);
    const reply = route ? await route(body) : { status: 404, body: { error: "not_found" } };
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => {
        if (reply.body === undefined) throw new SyntaxError("no body");
        return reply.body;
      },
    } as Response;
  };
}

export class FakeVisibility {
  hidden = false;
  readonly handlers = new Set<() => void>();

  set(hidden: boolean): void {
    this.hidden = hidden;
    for (const handler of [...this.handlers]) handler();
  }
}

export interface AccountHarness {
  deps: AccountDeps;
  server: FakeServer;
  visibility: FakeVisibility;
  reports: Array<{ message: string; extra?: Record<string, string | number> }>;
}

/** Usa os timers globais (os testes ligam `vi.useFakeTimers`). */
export function createAccountHarness(): AccountHarness {
  const server = new FakeServer();
  const visibility = new FakeVisibility();
  const reports: AccountHarness["reports"] = [];
  const deps: AccountDeps = {
    fetch: server.fetch,
    timers: {
      setTimeout: (handler, ms) => setTimeout(handler, ms),
      clearTimeout: (id) => clearTimeout(id),
    },
    visibility: {
      isHidden: () => visibility.hidden,
      onChange: (handler) => {
        visibility.handlers.add(handler);
        return () => visibility.handlers.delete(handler);
      },
    },
    report: (message, extra) => reports.push({ message, extra }),
  };
  return { deps, server, visibility, reports };
}

export function meUser(overrides: Partial<MeUser> = {}): MeUser {
  return {
    id: "u1",
    handle: "ana",
    nickname: "Ana",
    avatarUrl: "https://cdn.test/ana.png",
    onboarded: true,
    badges: [],
    plan: { status: "none", plus: false, cycle: null, periodEnd: null, renews: false },
    roomTheme: "default",
    handleChangeAvailableAt: null,
    termsUpdate: null,
    ...overrides,
  };
}

export const PLUS_PLAN: MeUser["plan"] = {
  status: "active",
  plus: true,
  cycle: "monthly",
  periodEnd: 2_000_000_000_000,
  renews: true,
};

export function meResponse(user: MeUser | null): MeResponse {
  return { user, providers: ["google", "discord"], billingEnabled: true };
}
