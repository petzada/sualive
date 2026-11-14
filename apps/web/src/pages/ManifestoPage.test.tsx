import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { MANIFESTO_PATH } from "../components/ManifestoCard";
import { PeopleCards } from "../components/PeopleCards";
import type { CreateRoom } from "../lib/room";
import { installTurnstileStub, renderApp, TEST_TOKEN } from "../test/room";
import { texts } from "../texts";
import { MANIFESTO_PHOTOS } from "./ManifestoPage";

function renderManifesto() {
  return render(
    <MemoryRouter initialEntries={[MANIFESTO_PATH]}>
      <App />
    </MemoryRouter>,
  );
}

/** `true` when `first` comes before `second` in the document. */
const isBefore = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("manifesto page", () => {
  it("is where the home card's link leads", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: texts.home.manifesto.action }));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(texts.manifesto.title);
  });

  it("shows the title, every paragraph, the closing line, the button and the age notice, in this order", () => {
    renderManifesto();

    const order = [
      screen.getByRole("heading", { level: 1, name: texts.manifesto.title }),
      ...texts.manifesto.paragraphs.map((paragraph) => screen.getByText(paragraph)),
      screen.getByText(texts.manifesto.closing),
      screen.getByRole("button", { name: texts.home.create }),
      screen.getByText(texts.manifesto.ageNotice),
    ];
    order.slice(1).forEach((element, index) => expect(isBefore(order[index]!, element)).toBe(true));
    expect(texts.manifesto.paragraphs).toHaveLength(4);
  });

  it("ends with the legal links of the home footer, below the age notice", () => {
    renderManifesto();

    const footer = screen.getByRole("contentinfo", { name: texts.nav.footerLabel });
    const terms = within(footer).getByRole("link", { name: texts.nav.terms });
    const privacy = within(footer).getByRole("link", { name: texts.nav.privacy });
    expect(terms.getAttribute("href")).toBe("/termos");
    expect(privacy.getAttribute("href")).toBe("/privacidade");
    expect(isBefore(screen.getByText(texts.manifesto.ageNotice), terms)).toBe(true);
    expect(isBefore(terms, privacy)).toBe(true);
    // Nothing comes after them.
    expect(footer.parentElement?.lastElementChild).toBe(footer);
  });

  it("follows the rules of the text: people, not adults; the Discord named once", () => {
    const copy = [texts.manifesto.title, ...texts.manifesto.paragraphs, texts.manifesto.closing].join(" ");

    expect(copy.toLowerCase()).not.toContain("adult");
    expect(copy.split("Discord")).toHaveLength(2);
    expect(copy).not.toContain("ANPD");
  });

  it("names the browser tab while open and gives the title back on leaving", () => {
    document.title = "sualive";
    const view = renderManifesto();

    expect(document.title).toBe(texts.manifesto.pageTitle);
    view.unmount();
    expect(document.title).toBe("sualive");
  });

  it("has no name or mark at the top: the page starts at the photos", () => {
    const { container } = renderManifesto();

    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("link", { name: texts.home.title })).toBeNull();
    expect(container.querySelector('a[href="/"]')).toBeNull();
    // The column of the page is the first thing in it, and the photos the first thing in the column.
    const main = screen.getByRole("main");
    expect(main.parentElement?.firstElementChild).toBe(main);
    expect(main.firstElementChild?.querySelectorAll("img")).toHaveLength(MANIFESTO_PHOTOS.length);
    expect(main.className.split(" ")).toContain("pt-14");
  });

  it("creates a room from the page, with the Turnstile token", async () => {
    installTurnstileStub();
    const createRoom = vi.fn<CreateRoom>(() => Promise.resolve({ ok: true, code: "abc123" }));
    renderApp({ createRoom, path: MANIFESTO_PATH });

    fireEvent.click(screen.getByRole("button", { name: texts.home.create }));

    await waitFor(() => expect(createRoom).toHaveBeenCalledWith(TEST_TOKEN));
  });

  it("opens with the three photos, with no name or city, above the title", () => {
    const { container } = renderManifesto();

    const photos = [...container.querySelectorAll("img")];
    expect(photos.map((photo) => photo.getAttribute("src"))).toEqual(
      MANIFESTO_PHOTOS.map((photo) => `/images/${photo}`),
    );
    const title = screen.getByRole("heading", { level: 1, name: texts.manifesto.title });
    expect(isBefore(photos[2]!, title)).toBe(true);
    // The strip is the first block of the page's column; the reading column (title first) is the next.
    const strip = photos[0]!.closest("[aria-hidden]")!;
    const main = screen.getByRole("main");
    expect(main.firstElementChild).toBe(strip);
    expect(strip.nextElementSibling?.contains(title)).toBe(true);
    expect(strip.nextElementSibling?.firstElementChild).toBe(title);
    // A breathing room above the photos, and the column's gap keeps the title apart.
    for (const name of ["pt-14", "gap-18"]) expect(main.className.split(" ")).toContain(name);
    // The cards carry no text at all.
    expect(photos[0]!.closest("[aria-hidden]")?.textContent).toBe("");
  });

  it("drops the photo strip while no photo is there", () => {
    const { container } = renderManifesto();

    container.querySelectorAll("img").forEach((photo) => fireEvent.error(photo));

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[aria-hidden]")).toBeNull();
    // The title takes the first place back.
    expect(screen.getByRole("main").firstElementChild?.firstElementChild).toBe(
      screen.getByRole("heading", { level: 1 }),
    );
  });
});

describe("people cards", () => {
  const photos = ["um.jpg", "dois.jpg", "tres.jpg"];

  it("shows one card per photo, with nothing to read or press", () => {
    const { container } = render(<PeopleCards photos={photos} />);

    const images = [...container.querySelectorAll("img")];
    expect(images.map((image) => image.getAttribute("src"))).toEqual(
      photos.map((photo) => `/images/${photo}`),
    );
    expect(container.textContent).toBe("");
    // Not a link or a button: the highlight is the whole interaction.
    expect(container.querySelector("a, button, [tabindex]")).toBeNull();
  });

  it("leaves out a photo that is missing", () => {
    const { container } = render(<PeopleCards photos={photos} />);

    fireEvent.error(container.querySelectorAll("img")[1]!);

    expect([...container.querySelectorAll("img")].map((image) => image.getAttribute("src"))).toEqual([
      "/images/um.jpg",
      "/images/tres.jpg",
    ]);
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<PeopleCards photos={[]} />);

    expect(container.firstChild).toBeNull();
  });
});
