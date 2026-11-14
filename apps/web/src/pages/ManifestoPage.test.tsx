import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      screen.getByRole("link", { name: texts.home.title }),
      screen.getByRole("heading", { level: 1, name: texts.manifesto.title }),
      ...texts.manifesto.paragraphs.map((paragraph) => screen.getByText(paragraph)),
      screen.getByText(texts.manifesto.closing),
      screen.getByRole("button", { name: texts.home.create }),
      screen.getByText(texts.manifesto.ageNotice),
    ];
    order.slice(1).forEach((element, index) => expect(isBefore(order[index]!, element)).toBe(true));
    expect(texts.manifesto.paragraphs).toHaveLength(4);
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

  it("goes back home by the name at the top", () => {
    renderManifesto();

    fireEvent.click(screen.getByRole("link", { name: texts.home.title }));

    expect(screen.getByText(texts.home.tagline[0])).toBeTruthy();
  });

  it("creates a room from the page, with the Turnstile token", async () => {
    installTurnstileStub();
    const createRoom = vi.fn<CreateRoom>(() => Promise.resolve({ ok: true, code: "abc123" }));
    renderApp({ createRoom, path: MANIFESTO_PATH });

    fireEvent.click(screen.getByRole("button", { name: texts.home.create }));

    await waitFor(() => expect(createRoom).toHaveBeenCalledWith(TEST_TOKEN));
  });

  it("shows the three photos, with no name or city, after the button and before the age notice", () => {
    const { container } = renderManifesto();

    const photos = [...container.querySelectorAll("img")];
    expect(photos.map((photo) => photo.getAttribute("src"))).toEqual(
      MANIFESTO_PHOTOS.map((photo) => `/images/${photo}`),
    );
    expect(isBefore(screen.getByRole("button", { name: texts.home.create }), photos[0]!)).toBe(true);
    expect(isBefore(photos[2]!, screen.getByText(texts.manifesto.ageNotice))).toBe(true);
    // The cards carry no text at all.
    expect(photos[0]!.closest("[aria-hidden]")?.textContent).toBe("");
  });

  it("drops the photo strip while no photo is there", () => {
    const { container } = renderManifesto();

    container.querySelectorAll("img").forEach((photo) => fireEvent.error(photo));

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[aria-hidden]")).toBeNull();
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
