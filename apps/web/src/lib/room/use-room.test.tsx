import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CODE, createHarness, participant, type Harness } from "./testing/fakes";
import { createUseRoom } from "./use-room";

let h: Harness;

beforeEach(() => {
  vi.useFakeTimers();
  h = createHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

async function enterRoom(strict: boolean) {
  const useRoom = createUseRoom(() => h.deps);
  const view = renderHook(() => useRoom(CODE), { reactStrictMode: strict });
  await flush();
  expect(view.result.current.state.phase).toBe("lobby");
  await act(() => view.result.current.actions.startPreview());
  await act(() => view.result.current.actions.join({ nickname: "Ana", turnstileToken: "tok" }));
  act(() => {
    h.socket.accept();
    h.socket.receive({
      type: "welcome",
      self: "me",
      participants: [participant("me"), participant("bob")],
      chat: [],
    });
  });
  await flush();
  expect(view.result.current.state.phase).toBe("connected");
  return view;
}

describe("useRoom", () => {
  it("StrictMode não duplica consulta, conexão, mídia nem listeners", async () => {
    await enterRoom(true);
    expect(h.server.callsTo("GET", `/api/rooms/${CODE}`)).toHaveLength(1);
    expect(h.sockets).toHaveLength(1);
    expect(h.medias).toHaveLength(1);
    expect(h.media.enableMicrophone).toHaveBeenCalledOnce();
    expect(h.previews).toHaveLength(1);
    expect(h.resumeHandlers.size).toBe(1);
  });

  it("desmontar limpa tudo", async () => {
    const view = await enterRoom(false);
    const media = h.media;
    const socket = h.socket;
    view.unmount();
    await flush();
    expect(socket.closedByClient).toBe(true);
    expect(media.closed).toBe(true);
    expect(h.previews[0]?.stop).toHaveBeenCalled();
    expect(h.resumeHandlers.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("desmontar no lobby para a prévia", async () => {
    const useRoom = createUseRoom(() => h.deps);
    const view = renderHook(() => useRoom(CODE), { reactStrictMode: true });
    await flush();
    await act(() => view.result.current.actions.startPreview());
    view.unmount();
    await flush();
    expect(h.previews[0]?.stop).toHaveBeenCalledOnce();
  });
});
