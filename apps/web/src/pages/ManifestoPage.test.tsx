import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { MANIFESTO_PATH } from "../components/ManifestoCard";
import { PeopleCards } from "../components/PeopleCards";
import type { CreateRoom } from "../lib/room";
import { installTurnstileStub, renderApp, TEST_TOKEN } from "../test/room";
import { texts } from "../texts";

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

  it("has no people section while the list is empty", () => {
    renderManifesto();

    expect(texts.manifesto.people).toHaveLength(0);
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("people cards", () => {
  const people = [
    { name: "Pessoa Um", city: "Recife, PE", image: "um.jpg" },
    { name: "Pessoa Dois", city: "Curitiba, PR", image: "dois.jpg" },
    { name: "Pessoa Três", city: "Manaus, AM", image: "tres.jpg" },
  ];

  it("shows each person with the name above the city, over the photo", () => {
    render(<PeopleCards people={people} />);

    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    cards.forEach((card, index) => {
      const person = people[index]!;
      const name = screen.getByText(person.name);
      const city = screen.getByText(person.city);
      expect(card.contains(name) && card.contains(city)).toBe(true);
      expect(isBefore(name, city)).toBe(true);
      expect(card.querySelector("img")?.getAttribute("src")).toBe(`/images/${person.image}`);
      // Not a link or a button: the highlight is the whole interaction.
      expect(card.querySelector("a, button")).toBeNull();
    });
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<PeopleCards people={[]} />);

    expect(container.firstChild).toBeNull();
  });
});
