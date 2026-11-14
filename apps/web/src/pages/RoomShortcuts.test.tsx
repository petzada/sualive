import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeAccountState, makeActivePlan, makePlan, makeUser } from "../test/account";
import { makeConnectedState, renderApp } from "../test/room";
import { texts } from "../texts";

const toolbar = () => screen.getByRole("toolbar", { name: texts.controls.label });
const shortcuts = () => screen.getByRole("navigation", { name: texts.controls.accountLabel });
const pill = () => within(shortcuts()).getByTestId("plan-pill");
const photo = () => within(shortcuts()).queryByTestId("account-photo");
const room = (account = makeAccountState(), path = "/s/abcdefghjk") =>
  renderApp({ path, state: makeConnectedState(), account });
const isBefore = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

function expectNewTab(link: HTMLElement) {
  expect(link.tagName).toBe("A");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener");
}

describe("account shortcuts in the row of the room actions", () => {
  it("shows a visitor only the pill that invites to the Plus", () => {
    room();

    expect(photo()).toBeNull();
    expect(within(shortcuts()).getAllByRole("link")).toHaveLength(1);
    expect(pill().textContent).toBe(texts.controls.plusOfferShort);
    expect(pill().textContent).toBe("Conheça o Plus");
    expect(pill().getAttribute("href")).toBe("/plus");
    expect(pill().getAttribute("aria-label")).toBe(texts.controls.plusOffer);
    expectNewTab(pill());
  });

  it("shows a free account its picture, to the profile, and the same invitation", () => {
    room(makeAccountState({ user: makeUser({ avatarUrl: "https://example.test/a.png" }) }));

    const picture = photo()!;
    expect(picture.getAttribute("href")).toBe("/perfil");
    expect(picture.getAttribute("aria-label")).toBe(texts.controls.profile);
    expectNewTab(picture);
    // Only the picture: no name beside it.
    expect(picture.textContent).toBe("");
    const image = picture.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("https://example.test/a.png");
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");

    expect(pill().textContent).toBe("Conheça o Plus");
    expect(pill().getAttribute("href")).toBe("/plus");
  });

  it("falls back to the initial when there is no picture or it fails to load", () => {
    const none = room(makeAccountState({ user: makeUser() }));
    expect(photo()!.textContent).toBe("M");
    expect(photo()!.querySelector("img")).toBeNull();
    none.unmount();

    room(makeAccountState({ user: makeUser({ avatarUrl: "https://example.test/broken.png" }) }));
    fireEvent.error(photo()!.querySelector("img")!);
    expect(photo()!.querySelector("img")).toBeNull();
    expect(photo()!.textContent).toBe("M");
  });

  it("shows a subscriber the pill of the own plan", () => {
    room(makeAccountState({ user: makeUser({ plan: makeActivePlan(), badges: ["plus"] }) }));

    expect(pill().textContent).toBe("Plus");
    expect(pill().getAttribute("href")).toBe("/plano");
    expect(pill().getAttribute("aria-label")).toBe(texts.controls.plan);
    expectNewTab(pill());
    expect(photo()!.getAttribute("href")).toBe("/perfil");
  });

  it("follows the plan in force: a canceled plan still counts, an ended one does not", () => {
    const canceled = room(
      makeAccountState({
        user: makeUser({ plan: makePlan({ status: "canceled", plus: true, cycle: "monthly" }) }),
      }),
    );
    expect(pill().getAttribute("href")).toBe("/plano");
    canceled.unmount();

    room(
      makeAccountState({
        user: makeUser({ plan: makePlan({ status: "ended", plus: false, cycle: "monthly" }) }),
      }),
    );
    expect(pill().textContent).toBe("Conheça o Plus");
    expect(pill().getAttribute("href")).toBe("/plus");
  });

  it("has the same shortcuts in a fixed-link room", () => {
    room(makeAccountState({ user: makeUser({ plan: makeActivePlan() }) }), "/@marina");
    expect(pill().getAttribute("href")).toBe("/plano");
    expect(photo()!.getAttribute("href")).toBe("/perfil");
  });

  it("keeps the six actions as they were, with the pill and then the picture after them", () => {
    room(makeAccountState({ user: makeUser() }));

    expect(
      within(toolbar())
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      texts.controls.micOn,
      texts.controls.cameraOn,
      texts.controls.screenOn,
      texts.controls.handRaise,
      texts.controls.reactions,
      texts.controls.copyLink,
    ]);
    expect(within(toolbar()).queryAllByRole("link")).toHaveLength(0);
    // Same row: the actions, then the pill, then the picture at the far right.
    expect(toolbar().parentElement?.parentElement).toBe(shortcuts().parentElement);
    expect(isBefore(toolbar(), pill())).toBe(true);
    expect(isBefore(pill(), photo()!)).toBe(true);
    expect(shortcuts().lastElementChild).toBe(photo());
    expect(shortcuts().className).toContain("justify-self-end");
  });

  it("gives the pill and the picture the height and the rounding of the action buttons", () => {
    room(makeAccountState({ user: makeUser() }));
    const action = screen.getByRole("button", { name: texts.controls.copyLink });

    for (const shortcut of [pill(), photo()!]) {
      for (const token of ["h-11", "rounded-button"]) {
        expect(action.className).toContain(token);
        expect(shortcut.className).toContain(token);
      }
    }
    // Round picture; pill on the pair of tokens made for it (black and white in the light theme).
    expect(photo()!.className).toContain("w-11");
    expect(pill().className).toContain("bg-plan");
    expect(pill().className).toContain("text-on-plan");
  });

  it("shows nothing of the account while it is still loading", () => {
    room(makeAccountState({ status: "loading" }));
    expect(screen.queryByRole("navigation", { name: texts.controls.accountLabel })).toBeNull();
    expect(toolbar()).toBeTruthy();
  });
});
