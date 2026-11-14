import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "./store";
import { createAccountHarness, meResponse, meUser, type AccountHarness } from "./testing/fakes";
import { createUseAccount } from "./use-account";

let h: AccountHarness;

beforeEach(() => {
  vi.useFakeTimers();
  h = createAccountHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

describe("useAccount", () => {
  it("vários componentes, StrictMode: um só carregamento compartilhado", async () => {
    h.server.me(meResponse(meUser()));
    const store = new AccountStore(h.deps);
    const useAccount = createUseAccount(() => store);
    const first = renderHook(() => useAccount(), { reactStrictMode: true });
    const second = renderHook(() => useAccount(), { reactStrictMode: true });
    expect(first.result.current.state.status).toBe("loading");
    await flush();
    expect(h.server.callsTo("GET", "/api/me")).toHaveLength(1);
    expect(first.result.current.state.status).toBe("authenticated");
    expect(second.result.current.state.user?.handle).toBe("ana");
    expect(first.result.current.actions).toBe(second.result.current.actions);
  });

  it("uma ação aparece em todos que usam a conta", async () => {
    h.server.me(meResponse(meUser()));
    h.server.on("POST", "/api/auth/logout", { status: 204 });
    const store = new AccountStore(h.deps);
    const useAccount = createUseAccount(() => store);
    const first = renderHook(() => useAccount());
    const second = renderHook(() => useAccount());
    await flush();
    await act(() => first.result.current.actions.logout());
    expect(second.result.current.state.status).toBe("anonymous");
  });
});
