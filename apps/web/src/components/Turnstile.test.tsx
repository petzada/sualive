import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installTurnstileStub, TEST_TOKEN } from "../test/room";
import { texts } from "../texts";
import type { TurnstileHandle } from "./Turnstile";
import { TurnstileField } from "./TurnstileField";
import { useTurnstileAction } from "./useTurnstileAction";

const { reportTurnstileError } = vi.hoisted(() => ({
  reportTurnstileError: vi.fn<(code: string) => void>(),
}));
vi.mock("../monitoring", () => ({ reportTurnstileError }));

afterEach(() => {
  reportTurnstileError.mockClear();
  vi.useRealTimers();
});

/** A screen with one action behind the check, like "create room" or "join". */
function Screen({ action }: { action: (token: string) => Promise<void> }) {
  const turnstile = useTurnstileAction(action);
  return (
    <>
      <button type="button" onClick={turnstile.trigger}>
        act:{turnstile.status}
      </button>
      <TurnstileField {...turnstile} />
    </>
  );
}

const actButton = () => screen.getByRole("button", { name: /^act:/ });
const overlay = () => screen.getByTestId("turnstile-overlay");
const widget = () => screen.getByTestId("turnstile");

async function mount(action = vi.fn((_token: string) => Promise.resolve()), { strict = false } = {}) {
  const tree = <Screen action={action} />;
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());
  return { action, ...view };
}

describe("Turnstile on demand", () => {
  it("asks Cloudflare for nothing when the screen mounts", async () => {
    const { api } = installTurnstileStub();
    const { action } = await mount();

    const options = api.render.mock.calls[0]?.[1];
    expect(options?.execution).toBe("execute");
    expect(options?.appearance).toBe("interaction-only");
    // No refresh and no retry without an action of the person.
    expect(options?.["refresh-expired"]).toBe("never");
    expect(options?.["refresh-timeout"]).toBe("never");
    expect(options?.retry).toBe("never");
    expect(api.execute).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(overlay().dataset.pending).toBe("false");
    expect(widget().className.split(" ")).toContain("invisible");
  });

  it("runs the check on the click and the action by itself when the token arrives", async () => {
    const { api, callbacks } = installTurnstileStub({ pass: false });
    const { action } = await mount();

    fireEvent.click(actButton());
    expect(api.execute).toHaveBeenCalledTimes(1);
    expect(actButton().textContent).toBe("act:waiting");
    expect(action).not.toHaveBeenCalled();

    act(() => callbacks.token?.("fresh"));
    await waitFor(() => expect(action).toHaveBeenCalledWith("fresh"));
    await waitFor(() => expect(actButton().textContent).toBe("act:idle"));
  });

  it("asks for one token per action and none after using it", async () => {
    const { api } = installTurnstileStub();
    const { action } = await mount();

    for (let index = 1; index <= 10; index++) {
      fireEvent.click(actButton());
      await waitFor(() => expect(action).toHaveBeenCalledTimes(index));
      await waitFor(() => expect(actButton().textContent).toBe("act:idle"));
    }
    // The widget is cleared after each token, which in the `execute` mode asks for nothing.
    await waitFor(() => expect(api.reset).toHaveBeenCalledTimes(10));
    expect(api.execute).toHaveBeenCalledTimes(10);
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(action.mock.calls.every(([token]) => token === TEST_TOKEN)).toBe(true);
  });

  it("does not run a second check while one is running", async () => {
    const { api } = installTurnstileStub({ pass: false });
    await mount();

    fireEvent.click(actButton());
    fireEvent.click(actButton());
    expect(api.execute).toHaveBeenCalledTimes(1);
  });

  it("ignores a token nobody asked for", async () => {
    const { callbacks } = installTurnstileStub({ pass: false });
    const { action } = await mount();

    act(() => callbacks.token?.("unasked"));
    fireEvent.click(actButton());
    expect(action).not.toHaveBeenCalled();
  });

  it("shows the widget over the veil while an interaction is demanded and hides it with the token", async () => {
    const { callbacks } = installTurnstileStub({ pass: false });
    const { action } = await mount();
    fireEvent.click(actButton());

    act(() => callbacks.beforeInteractive?.());
    expect(overlay().dataset.interactive).toBe("true");
    expect(overlay().className.split(" ")).toContain("bg-stage/40");
    expect(overlay().className.split(" ")).not.toContain("pointer-events-none");
    expect(widget().className.split(" ")).not.toContain("invisible");

    act(() => callbacks.token?.("solved"));
    expect(overlay().dataset.interactive).toBe("false");
    expect(overlay().className.split(" ")).toContain("pointer-events-none");
    expect(widget().className.split(" ")).toContain("invisible");
    await waitFor(() => expect(action).toHaveBeenCalledWith("solved"));
  });

  it("keeps the widget visible and clickable while the check runs, even with no before-interactive", async () => {
    installTurnstileStub({ pass: false });
    await mount();

    fireEvent.click(actButton());
    expect(overlay().dataset.pending).toBe("true");
    expect(widget().className.split(" ")).not.toContain("invisible");
    expect(widget().className.split(" ")).toContain("pointer-events-auto");
  });

  it.each([
    [
      "error",
      "300030",
      (callbacks: ReturnType<typeof installTurnstileStub>["callbacks"]) => callbacks.error?.("300030"),
    ],
    [
      "timeout",
      "timeout",
      (callbacks: ReturnType<typeof installTurnstileStub>["callbacks"]) => callbacks.timeout?.(),
    ],
    [
      "unsupported",
      "unsupported",
      (callbacks: ReturnType<typeof installTurnstileStub>["callbacks"]) => callbacks.unsupported?.(),
    ],
  ])(
    "leaves the checking state on %s, reports the code and tries again only on a click",
    async (_name, code, fire) => {
      const { api, callbacks } = installTurnstileStub({ pass: false });
      const { action } = await mount();
      fireEvent.click(actButton());

      act(() => void fire(callbacks));
      expect(await screen.findByText(texts.turnstile.failed)).toBeTruthy();
      expect(actButton().textContent).toBe("act:idle");
      expect(widget().className.split(" ")).toContain("invisible");
      expect(reportTurnstileError).toHaveBeenCalledExactlyOnceWith(code);

      // No retry by itself, however long it waits.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(api.execute).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: texts.turnstile.retry }));
      expect(api.execute).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(texts.turnstile.failed)).toBeNull();
      act(() => callbacks.token?.("second"));
      await waitFor(() => expect(action).toHaveBeenCalledExactlyOnceWith("second"));
    },
  );

  it("handles a repeated failure callback once", async () => {
    const { callbacks } = installTurnstileStub({ pass: false });
    await mount();
    fireEvent.click(actButton());

    act(() => {
      callbacks.error?.("600010");
      callbacks.error?.("600010");
    });
    expect(reportTurnstileError).toHaveBeenCalledTimes(1);
  });

  it("does not show or report an error that comes with no check asked", async () => {
    const { callbacks } = installTurnstileStub({ pass: false });
    await mount();

    act(() => void callbacks.error?.("110200"));
    expect(screen.queryByText(texts.turnstile.failed)).toBeNull();
    expect(reportTurnstileError).not.toHaveBeenCalled();
  });

  it("leaves no widget behind and runs nothing when moving between screens", async () => {
    const { api, live } = installTurnstileStub();
    const first = await mount();
    first.unmount();
    expect(live.size).toBe(0);

    const second = await mount();
    expect(live.size).toBe(1);
    expect(document.querySelectorAll("[data-testid=turnstile-overlay]")).toHaveLength(1);
    second.unmount();
    expect(live.size).toBe(0);
    expect(api.execute).not.toHaveBeenCalled();
  });

  it("keeps one widget and one check per click under StrictMode", async () => {
    const { api, live } = installTurnstileStub();
    const { action } = await mount(undefined, { strict: true });
    await waitFor(() => expect(live.size).toBe(1));
    expect(api.execute).not.toHaveBeenCalled();

    fireEvent.click(actButton());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(api.execute).toHaveBeenCalledTimes(1);
  });

  it("runs a click made before the script loaded as soon as it loads", async () => {
    const action = vi.fn((_token: string) => Promise.resolve());
    render(<Screen action={action} />);
    const script = document.head.querySelector("script");
    expect(script).toBeTruthy();

    fireEvent.click(actButton());
    expect(actButton().textContent).toBe("act:waiting");
    const { api } = installTurnstileStub();
    act(() => script?.dispatchEvent(new Event("load")));

    await waitFor(() => expect(action).toHaveBeenCalledWith(TEST_TOKEN));
    expect(api.execute).toHaveBeenCalledTimes(1);
  });

  it("does not show a failed load ahead of any action, and loads again on the click", async () => {
    const action = vi.fn((_token: string) => Promise.resolve());
    render(<Screen action={action} />);
    act(() => document.head.querySelector("script")?.dispatchEvent(new Event("error")));
    await act(() => Promise.resolve());
    expect(screen.queryByText(texts.turnstile.failed)).toBeNull();
    expect(document.head.querySelector("script")).toBeNull();

    fireEvent.click(actButton());
    const again = await waitFor(() => {
      const script = document.head.querySelector("script");
      expect(script).toBeTruthy();
      return script;
    });
    installTurnstileStub();
    act(() => again?.dispatchEvent(new Event("load")));
    await waitFor(() => expect(action).toHaveBeenCalledWith(TEST_TOKEN));
  });

  it("shows the failure when the script cannot be loaded after a click", async () => {
    render(<Screen action={vi.fn(() => Promise.resolve())} />);
    fireEvent.click(actButton());
    act(() => document.head.querySelector("script")?.dispatchEvent(new Event("error")));

    expect(await screen.findByText(texts.turnstile.failed)).toBeTruthy();
    expect(actButton().textContent).toBe("act:idle");
    expect(reportTurnstileError).toHaveBeenCalledWith("script");
  });
});

describe("useTurnstileAction", () => {
  function setup() {
    const action = vi.fn((_token: string) => Promise.resolve());
    const { result } = renderHook(() => useTurnstileAction(action));
    const handle: TurnstileHandle = { execute: vi.fn() };
    (result.current.turnstileProps.ref as { current: TurnstileHandle | null }).current = handle;
    return { action, result, handle };
  }

  it("reuses a token that was not used while it is still valid", async () => {
    const { action, result, handle } = setup();
    act(() => result.current.turnstileProps.onToken("unused"));

    act(() => result.current.trigger());
    await waitFor(() => expect(action).toHaveBeenCalledWith("unused"));
    expect(handle.execute).not.toHaveBeenCalled();
  });

  it("never reuses an expired token: asks for a new one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { action, result, handle } = setup();
    act(() => result.current.turnstileProps.onToken("old"));
    vi.setSystemTime(Date.now() + 241_000);

    act(() => result.current.trigger());
    expect(handle.execute).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
    act(() => result.current.turnstileProps.onToken("new"));
    await waitFor(() => expect(action).toHaveBeenCalledWith("new"));
  });

  it("never hands out the same token twice", async () => {
    const { action, result, handle } = setup();
    act(() => result.current.turnstileProps.onToken("once"));
    act(() => result.current.trigger());
    await waitFor(() => expect(result.current.status).toBe("idle"));

    act(() => result.current.trigger());
    expect(handle.execute).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("drops a token reported as expired", () => {
    const { action, result, handle } = setup();
    act(() => result.current.turnstileProps.onToken("soon-expired"));
    act(() => result.current.turnstileProps.onToken(null));

    act(() => result.current.trigger());
    expect(handle.execute).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });
});
