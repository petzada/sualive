import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeAccountState, makeActivePlan, makePlan, makeUser } from "../test/account";
import { makeConnectedState, renderApp } from "../test/room";
import { texts } from "../texts";

const toolbar = () => screen.getByRole("toolbar", { name: texts.controls.label });
/** The row of the actions: from `md` it also has the plan pill (left) and the picture (right). */
const bar = () => screen.getByTestId("control-bar");
const pill = () => within(bar()).getByTestId("plan-pill");
const photo = () => within(bar()).queryByTestId("account-photo");
/** The header of the room: on a phone it has both shortcuts, round, before the theme and leave buttons. */
const header = () => screen.getByRole("banner");
const shortcuts = () => within(header()).getByRole("navigation", { name: texts.controls.accountLabel });
const headerPill = () => within(shortcuts()).getByTestId("plan-pill");
const headerPhoto = () => within(shortcuts()).queryByTestId("account-photo");
const classes = (element: Element) => element.className.split(" ");
const room = (account = makeAccountState(), path = "/s/abcdefghjk") =>
  renderApp({ path, state: makeConnectedState(), account });
const isBefore = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

function expectNewTab(link: HTMLElement) {
  expect(link.tagName).toBe("A");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener");
}

describe("account shortcuts of the room", () => {
  it("shows a visitor only the pill that invites to the Plus", () => {
    room();

    expect(photo()).toBeNull();
    expect(within(bar()).getAllByRole("link")).toHaveLength(1);
    expect(headerPhoto()).toBeNull();
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

  it("wide screens: the pill at the left end of the row of the actions, the six actions centered, the picture at the right end", () => {
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

    // One row of three cells: pill, actions, picture. The side cells are equal, so the actions stay centered.
    const [left, center, right] = [...bar().children];
    expect(bar().children).toHaveLength(3);
    expect(classes(bar())).toContain("md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]");
    expect(left!.contains(pill())).toBe(true);
    expect(center!.contains(toolbar())).toBe(true);
    expect(right!.contains(photo())).toBe(true);
    expect(classes(left!)).toContain("justify-self-start");
    expect(classes(center!)).toContain("justify-center");
    expect(classes(right!)).toContain("justify-self-end");
    // The pill left the side of the picture: each one alone in its cell.
    expect(left!.querySelectorAll("a")).toHaveLength(1);
    expect(right!.querySelectorAll("a")).toHaveLength(1);
    expect(isBefore(pill(), toolbar())).toBe(true);
    expect(isBefore(toolbar(), photo()!)).toBe(true);
    // Only from `md`: on a phone both cells are out and the row is the actions alone.
    for (const cell of [left!, right!]) {
      for (const name of ["hidden", "md:flex"]) expect(classes(cell)).toContain(name);
    }
  });

  it("wide screens: gives the pill and the picture the height and the rounding of the action buttons", () => {
    room(makeAccountState({ user: makeUser() }));
    const action = screen.getByRole("button", { name: texts.controls.copyLink });

    expect(classes(action)).toContain("md:h-11");
    expect(classes(action)).toContain("rounded-button");
    for (const shortcut of [pill(), photo()!]) {
      for (const token of ["h-11", "rounded-button"]) expect(classes(shortcut)).toContain(token);
    }
    // Round picture; pill on the pair of tokens made for it (black and white in the light theme).
    expect(classes(photo()!)).toContain("w-11");
    expect(classes(pill())).toContain("bg-plan");
    expect(classes(pill())).toContain("text-on-plan");
  });

  it("phone: the plan and the picture go up to the header, before the theme and leave buttons, all four the same size", () => {
    room(makeAccountState({ user: makeUser({ avatarUrl: "https://example.test/a.png" }) }));

    const theme = within(header()).getByRole("button", { name: texts.room.themeToDark });
    const leave = within(header()).getByRole("button", { name: texts.controls.leave });
    const four = [headerPill(), headerPhoto()!, theme, leave];

    // In this order, in the same group of the header.
    four.slice(1).forEach((element, index) => expect(isBefore(four[index]!, element)).toBe(true));
    expect(shortcuts().parentElement).toBe(leave.parentElement);
    expect(theme.parentElement).toBe(leave.parentElement);
    // Only on a phone: from `md` the header loses them (they are in the row of the actions).
    expect(classes(shortcuts())).toContain("md:hidden");
    // Same size: 44px round. The leave button only grows, with its word, from `md`.
    for (const name of ["h-11", "w-11", "rounded-button"]) {
      expect(classes(headerPill())).toContain(name);
      expect(classes(headerPhoto()!)).toContain(name);
    }
    for (const button of [theme, leave]) {
      expect(classes(button)).toContain("size-11");
      expect(classes(button)).toContain("rounded-button");
    }
    for (const name of ["px-0", "md:w-auto", "md:px-3"]) expect(classes(leave)).toContain(name);
    expect(classes(within(leave).getByText(texts.controls.leaveShort))).toEqual(["hidden", "md:inline"]);
    // The pill is only its glyph here; its name stays in the accessible label.
    expect(headerPill().textContent).toBe("");
    expect(headerPill().querySelector("svg")).toBeTruthy();
    expect(headerPill().getAttribute("aria-label")).toBe(texts.controls.plusOffer);
    expect(headerPill().getAttribute("href")).toBe("/plus");
    expectNewTab(headerPill());
    expect(headerPhoto()!.getAttribute("aria-label")).toBe(texts.controls.profile);
    expect(headerPhoto()!.getAttribute("href")).toBe("/perfil");
    expectNewTab(headerPhoto()!);
    expect(headerPhoto()!.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.png");
  });

  it("phone: the row of the actions is only the six buttons, bigger and sharing the whole width", () => {
    room(makeAccountState({ user: makeUser() }));

    const buttons = within(toolbar()).getAllByRole("button");
    expect(buttons).toHaveLength(6);
    // One column for the row, and the buttons as equal columns that fill it.
    expect(classes(bar())).toContain("grid-cols-1");
    for (const name of ["grid", "w-full", "grid-flow-col", "auto-cols-fr"]) {
      expect(classes(toolbar())).toContain(name);
    }
    // From `md` they go back to their own width, centered.
    for (const name of ["md:flex", "md:w-auto"]) expect(classes(toolbar())).toContain(name);
    for (const button of buttons) {
      // 48px tall and as wide as its column on a phone: a comfortable touch target.
      for (const name of ["h-12", "w-full", "md:h-11", "md:w-auto"]) expect(classes(button)).toContain(name);
      expect(button.parentElement).toBe(toolbar());
    }
  });

  it("shows nothing of the account while it is still loading", () => {
    room(makeAccountState({ status: "loading" }));
    expect(screen.queryByRole("navigation", { name: texts.controls.accountLabel })).toBeNull();
    expect(screen.queryByTestId("plan-pill")).toBeNull();
    expect(screen.queryByTestId("account-photo")).toBeNull();
    expect(toolbar()).toBeTruthy();
  });
});
