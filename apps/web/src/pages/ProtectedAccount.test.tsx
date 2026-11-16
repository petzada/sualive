import {
  ACCESS_LOG_RETENTION_DAYS,
  FREE_VIDEO_QUALITY,
  PLUS_ANNUAL_PRICE_CENTS,
  PLUS_GIFT_PRICE_GOLD,
  PLUS_GOLD_AMOUNT,
  PLUS_GOLD_INTERVAL_DAYS,
  PLUS_MONTHLY_PRICE_CENTS,
  PLUS_VIDEO_QUALITY,
  PLUS_VIDEOS_PER_PERSON,
  PROTECTED_ROOM_GOLD_PER_HOUR,
  PROTECTED_ROOM_MAX_PEOPLE,
  PROTECTED_ROOM_MAX_VIDEOS,
  RELAY_VIDEO_GOLD_PER_HOUR,
  ROOM_MAX_PEOPLE,
  VIDEOS_PER_PERSON,
  WATCHED_VIDEOS_PER_PERSON,
} from "@sualive/config";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  formatAmount,
  formatCents,
  formatDuration,
  formatProtectedRoomTime,
  protectedRoomMinutes,
} from "../components/format";
import { MANIFESTO_PATH } from "../components/ManifestoCard";
import type { CreateRoom } from "../lib/room";
import { makeAccountState, makeActivePlan, makeUser } from "../test/account";
import { installTurnstileStub, renderApp, TEST_TOKEN } from "../test/room";
import { makeLoadedWalletState, makeWallet, makeWalletState } from "../test/wallet";
import { texts } from "../texts";

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const money = (cents: number) => formatCents(cents).replace(/\s/g, " ");
/** The text of the page with the non-breaking spaces of the prices turned into plain ones. */
const pageText = () => (document.body.textContent ?? "").replace(/\s/g, " ");
const gold = (amount: number) => `${formatAmount(amount)} de ouro`;

const visitor = () => makeAccountState();
const free = () => makeAccountState({ user: makeUser() });
const plus = (overrides: Parameters<typeof makeUser>[0] = {}) =>
  makeAccountState({ user: makeUser({ plan: makeActivePlan(), badges: ["plus"], ...overrides }) });
const walletWith = (amount: number) => makeLoadedWalletState({ wallet: makeWallet({ gold: amount }) });

const HOUR = PROTECTED_ROOM_GOLD_PER_HOUR;
const copy = texts.home.protectedRoom;

describe("gold as time of protected room", () => {
  it("rounds down to whole minutes", () => {
    expect(protectedRoomMinutes(HOUR)).toBe(60);
    expect(protectedRoomMinutes(HOUR - 1)).toBe(59);
    expect(protectedRoomMinutes(0)).toBe(0);
    expect(protectedRoomMinutes(-10)).toBe(0);
  });

  it("writes hours and minutes, and only minutes under one hour", () => {
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(formatDuration(59)).toBe("59 min");
    expect(formatDuration(0)).toBe("0 min");
    expect(formatProtectedRoomTime(HOUR)).toBe("1 h");
    expect(formatProtectedRoomTime(HOUR / 2)).toBe("30 min");
    expect(formatProtectedRoomTime(HOUR * 2 + HOUR / 4)).toBe("2 h 15 min");
  });
});

describe("home: creating a protected room", () => {
  const createButton = () => screen.getByRole("button", { name: texts.home.create });
  const openButton = () => screen.getByTestId("protected-room-open");
  const confirmButton = () => screen.getByTestId("protected-room-confirm");

  async function openHome(options: Parameters<typeof renderApp>[0] = {}) {
    const { api } = installTurnstileStub();
    const view = renderApp({ path: "/", account: plus(), wallet: walletWith(HOUR), ...options });
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    return { ...view, api };
  }

  it("shows nothing about it to a visitor, whose room is still one click away", async () => {
    const { createRoom } = await openHome({ account: visitor() });

    expect(screen.queryByTestId("protected-room-open")).toBeNull();
    expect(screen.queryByTestId("protected-room-plus-only")).toBeNull();
    expect(document.body.textContent).not.toContain(copy.title);

    fireEvent.click(createButton());
    // Exactly as before: the token and nothing else.
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith(TEST_TOKEN));
    expect(vi.mocked(createRoom).mock.calls[0]).toHaveLength(1);
  });

  it("tells an account without the Plus, in one plain line, that it comes with the Plus", async () => {
    const { walletActions } = await openHome({ account: free() });

    expect(screen.queryByTestId("protected-room-open")).toBeNull();
    const line = screen.getByTestId("protected-room-plus-only");
    expect(line.textContent).toBe(`${copy.plusOnly.text}${copy.plusOnly.link}`);
    expect(within(line).getByRole("link", { name: copy.plusOnly.link }).getAttribute("href")).toBe("/plus");
    expect(within(line).queryByRole("button")).toBeNull();
    // Nothing of the wallet is asked for an option the person cannot use.
    expect(walletActions.load).not.toHaveBeenCalled();
  });

  it("does not offer it to an account that has not finished the first access", async () => {
    await openHome({
      account: makeAccountState({
        user: makeUser({ onboarded: false, handle: null, plan: makeActivePlan() }),
      }),
    });
    expect(screen.queryByTestId("protected-room-open")).toBeNull();
    expect(screen.queryByTestId("protected-room-plus-only")).toBeNull();
  });

  it("shows what it is, the price and the hours of the balance before anything is created", async () => {
    const amount = HOUR + HOUR / 2;
    const { createRoom, walletActions } = await openHome({ wallet: walletWith(amount) });

    expect(screen.queryByTestId("protected-room-panel")).toBeNull();
    expect(walletActions.load).not.toHaveBeenCalled();
    fireEvent.click(openButton());

    const panel = within(screen.getByTestId("protected-room-panel"));
    expect(panel.getByRole("heading", { name: copy.title })).toBeTruthy();
    expect(panel.getByText(copy.about)).toBeTruthy();
    expect(copy.about).toContain(`${PROTECTED_ROOM_MAX_PEOPLE} pessoas`);
    expect(copy.about).toContain(`${PROTECTED_ROOM_MAX_VIDEOS} vídeos`);
    expect(copy.about).toContain("retransmissão");
    expect(screen.getByTestId("protected-room-price").textContent).toContain(`${gold(HOUR)} por hora`);
    expect(screen.getByTestId("protected-room-balance").textContent).toBe(
      `Seu saldo de ${gold(amount)} cobre cerca de 1 h 30 min.`,
    );
    // The balance comes from the wallet, asked when the panel opens.
    expect(walletActions.load).toHaveBeenCalledTimes(1);
    expect(createRoom).not.toHaveBeenCalled();
  });

  it("creates the protected room only after the confirmation, and goes to it", async () => {
    const { createRoom } = await openHome();

    fireEvent.click(openButton());
    fireEvent.click(confirmButton());

    await waitFor(() => expect(createRoom).toHaveBeenCalledWith(TEST_TOKEN, { protected: true }));
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("heading", { name: texts.lobby.title })).toBeTruthy();
  });

  it("keeps the common room one click away for who has the Plus", async () => {
    const { createRoom } = await openHome();

    fireEvent.click(openButton());
    fireEvent.click(createButton());

    await waitFor(() => expect(createRoom).toHaveBeenCalledWith(TEST_TOKEN));
    expect(vi.mocked(createRoom).mock.calls[0]).toHaveLength(1);
  });

  it("can give up: the panel closes and nothing is created", async () => {
    const { createRoom } = await openHome();

    fireEvent.click(openButton());
    fireEvent.click(screen.getByRole("button", { name: texts.common.cancel }));

    expect(screen.queryByTestId("protected-room-panel")).toBeNull();
    expect(openButton()).toBeTruthy();
    expect(createRoom).not.toHaveBeenCalled();
  });

  it("says when the balance pays for no minute, with the way to the wallet", async () => {
    await openHome({ wallet: walletWith(0) });
    fireEvent.click(openButton());

    const balance = screen.getByTestId("protected-room-balance");
    expect(balance.textContent).toBe(`${copy.balanceEmpty}${copy.walletLink}`);
    expect(within(balance).getByRole("link", { name: copy.walletLink }).getAttribute("href")).toBe(
      "/carteira",
    );
  });

  it("waits for the balance, and says when it could not be loaded", async () => {
    const loading = await openHome({ wallet: makeWalletState() });
    fireEvent.click(openButton());
    expect(screen.getByText(copy.balanceLoading)).toBeTruthy();
    loading.unmount();

    await openHome({ wallet: makeWalletState({ status: "error" }) });
    fireEvent.click(openButton());
    expect(screen.getByRole("alert").textContent).toBe(copy.balanceFailed);
    // The server decides: the confirmation is still there.
    expect(confirmButton()).toBeTruthy();
  });

  it.each(["plusRequired", "protectedUnavailable", "unauthorized"] as const)(
    "explains a %s failure with its own text",
    async (reason) => {
      const createRoom = vi.fn<CreateRoom>(() => Promise.resolve({ ok: false, reason }));
      await openHome({ createRoom });

      fireEvent.click(openButton());
      fireEvent.click(confirmButton());

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(texts.home.errors[reason]);
      expect(texts.home.errors[reason]).not.toBe(texts.home.errors.error);
      // Still on the home page, with the panel open to try again.
      expect(confirmButton()).toBeTruthy();
    },
  );

  it("explains a lack of gold and leads to the wallet", async () => {
    const createRoom = vi.fn<CreateRoom>(() => Promise.resolve({ ok: false, reason: "insufficientFunds" }));
    await openHome({ createRoom });

    fireEvent.click(openButton());
    fireEvent.click(confirmButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(`${texts.home.errors.insufficientFunds} ${copy.walletLink}`);
    expect(within(alert).getByRole("link", { name: copy.walletLink }).getAttribute("href")).toBe("/carteira");
  });
});

describe("plan: the fixed-link room as a protected room", () => {
  const fixed = texts.plan.fixedProtected;
  const toggle = () => screen.getByTestId("fixed-room-protected-toggle");
  const state = () => screen.getByTestId("fixed-room-protected-state").textContent;

  it("says the price by the hour and that it only changes with the room empty", () => {
    renderApp({ path: "/plano", account: plus() });

    const card = within(screen.getByTestId("fixed-room-protected"));
    expect(card.getByRole("heading", { name: fixed.title })).toBeTruthy();
    expect(screen.getByTestId("fixed-room-protected-price").textContent).toContain(`${gold(HOUR)} por hora`);
    expect(card.getByText(fixed.rule)).toBeTruthy();
    expect(fixed.rule).toContain("sala vazia");
    expect(card.getByRole("link", { name: fixed.walletLink }).getAttribute("href")).toBe("/carteira");
  });

  it("turns it on", async () => {
    const { accountActions } = renderApp({ path: "/plano", account: plus() });
    expect(state()).toBe(fixed.state.off);
    expect(toggle().textContent).toBe(fixed.turnOn);

    fireEvent.click(toggle());

    await waitFor(() => expect(accountActions.setFixedRoomProtected).toHaveBeenCalledWith(true));
    await waitFor(() => expect(state()).toBe(fixed.state.on));
    expect(toggle().textContent).toBe(fixed.turnOff);
    expect(screen.getByTestId("fixed-room-protected").getAttribute("data-state")).toBe("on");
  });

  it("turns it off", async () => {
    const { accountActions } = renderApp({ path: "/plano", account: plus({ fixedRoomProtected: true }) });
    expect(state()).toBe(fixed.state.on);

    fireEvent.click(screen.getByRole("button", { name: fixed.turnOff }));

    await waitFor(() => expect(accountActions.setFixedRoomProtected).toHaveBeenCalledWith(false));
    await waitFor(() => expect(state()).toBe(fixed.state.off));
  });

  it.each([
    ["roomInUse", fixed.roomInUse],
    ["plusRequired", texts.account.errors.plusRequired],
    ["error", texts.account.errors.error],
  ] as const)("explains a %s refusal and keeps the room as it was", async (reason, message) => {
    const { accountActions } = renderApp({ path: "/plano", account: plus() });
    vi.mocked(accountActions.setFixedRoomProtected).mockResolvedValue({ ok: false, reason });

    fireEvent.click(toggle());

    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(state()).toBe(fixed.state.off);
    expect(toggle().textContent).toBe(fixed.turnOn);
  });

  it("says clearly that the room has people in it", () => {
    expect(fixed.roomInUse).toMatch(/Espere a sala esvaziar/);
  });

  it("is not there for who has no Plus: the page of the plan gives way to the offer", () => {
    renderApp({ path: "/plano", account: free() });
    expect(heading()).toBe(texts.plus.title);
    expect(screen.queryByTestId("fixed-room-protected")).toBeNull();
  });
});

describe("wallet: the gold as hours of protected room", () => {
  const time = () => screen.getByTestId("gold-protected-time").textContent;
  const open = (amount: number) =>
    renderApp({ path: "/carteira", account: free(), wallet: walletWith(amount) });

  it("says one hour for the price of one hour", () => {
    open(HOUR);
    expect(time()).toBe("Cerca de 1 h de sala protegida");
    // Beside the gold balance, not the silver one.
    expect(within(screen.getByTestId("balance-gold")).getByTestId("gold-protected-time")).toBeTruthy();
    expect(within(screen.getByTestId("balance-silver")).queryByTestId("gold-protected-time")).toBeNull();
  });

  it("says minutes under one hour, rounded down", () => {
    open(HOUR - 1);
    expect(time()).toBe("Cerca de 59 min de sala protegida");
  });

  it("says hours and minutes above it", () => {
    open(HOUR * 3 + HOUR / 2);
    expect(time()).toBe("Cerca de 3 h 30 min de sala protegida");
  });

  it("says zero minutes with no gold", () => {
    open(0);
    expect(time()).toBe("Cerca de 0 min de sala protegida");
  });
});

describe("the new Plus", () => {
  const freeShort = `${FREE_VIDEO_QUALITY.height}p${FREE_VIDEO_QUALITY.frameRate}`;

  it("takes the two prices from the configuration", () => {
    expect([PLUS_MONTHLY_PRICE_CENTS, PLUS_ANNUAL_PRICE_CENTS]).toEqual([990, 7990]);
    renderApp({ path: "/plus" });
    expect(within(screen.getByTestId("cycle-monthly")).getByText("R$ 9,90")).toBeTruthy();
    expect(within(screen.getByTestId("cycle-annual")).getByText("R$ 79,90")).toBeTruthy();
  });

  it("lists the new benefits, in order", () => {
    renderApp({ path: "/plus" });

    expect(texts.plus.benefits.map((benefit) => benefit.title)).toEqual([
      `Qualidade acima de ${freeShort}`,
      `${PLUS_VIDEOS_PER_PERSON} vídeos ao mesmo tempo`,
      "Vídeo em retransmissão",
      "Sala protegida",
      "Link fixo",
      "Tema de sala",
      "Selo ao lado do nome",
    ]);
    for (const benefit of texts.plus.benefits) {
      expect(screen.getByText(benefit.title)).toBeTruthy();
      expect(screen.getByText(benefit.text)).toBeTruthy();
    }
    const [quality, videos, relay, protectedRoom] = texts.plus.benefits.map((benefit) => benefit.text);
    expect(freeShort).toBe("1080p60");
    expect(quality).toContain(`até 4K e ${PLUS_VIDEO_QUALITY.frameRate} fps`);
    expect(videos).toContain(`Sem o Plus são ${VIDEOS_PER_PERSON}`);
    // What spends our bandwidth is paid in gold, and the page says how much.
    expect(relay).toContain(`${gold(RELAY_VIDEO_GOLD_PER_HOUR)} por hora`);
    expect(protectedRoom).toContain(`${gold(HOUR)} por hora`);
    expect(protectedRoom).toContain(`${PROTECTED_ROOM_MAX_PEOPLE} pessoas`);
  });

  it("shows the monthly gold also as time of protected room", () => {
    renderApp({ path: "/plus" });
    const block = screen.getByTestId("plus-gold").textContent ?? "";
    expect(block).toContain(`${gold(PLUS_GOLD_AMOUNT)} a cada ${PLUS_GOLD_INTERVAL_DAYS} dias`);
    expect(block).toContain(`cerca de ${formatProtectedRoomTime(PLUS_GOLD_AMOUNT)} de sala protegida`);
    // A franquia em tempo acompanha o preço da sala protegida: nunca um número escrito à mão.
    expect(block).toContain(formatProtectedRoomTime(PLUS_GOLD_AMOUNT));
  });

  it("promises no free hours, courtesy or trial", () => {
    renderApp({ path: "/plus" });
    expect(pageText()).not.toMatch(/gr[áa]tis|cortesia|período de teste|horas? gratuitas?/i);
  });

  it("says the same in the balloon after the first access", async () => {
    renderApp({ path: "/bem-vindo", account: free() });
    const opener = screen.getByRole("button", { name: texts.welcome.plansOpen });
    act(() => opener.focus());
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog", { name: texts.welcome.plans.title });
    const items = within(dialog)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(items).toContain(`Qualidade acima de ${freeShort}, até 4K e ${PLUS_VIDEO_QUALITY.frameRate} fps`);
    expect(items).toContain("Vídeo em retransmissão e sala protegida, pagos em ouro");
    expect(items).toContain(
      `${gold(PLUS_GOLD_AMOUNT)} a cada ${PLUS_GOLD_INTERVAL_DAYS} dias: cerca de ${formatProtectedRoomTime(PLUS_GOLD_AMOUNT)} de sala protegida`,
    );
  });

  it("says what the Plus gives now when the payment is confirmed", () => {
    expect(texts.plus.checkout.paid).toContain("até 4K");
    expect(texts.plus.checkout.paid).toContain("sala protegida");
  });
});

describe("legal texts of the fourth delivery", () => {
  const blocks = (kind: "terms" | "privacy") =>
    texts.legal[kind].sections
      .flatMap((section) => section.blocks)
      .join("\n")
      .replace(/\s/g, " ");
  const section = (kind: "terms" | "privacy", title: string) =>
    (texts.legal[kind].sections.find((candidate) => candidate.title === title)?.blocks ?? [])
      .join("\n")
      .replace(/\s/g, " ");

  it("has the new Plus in the Termos de Uso: price, gold and what it gives", () => {
    const plusSection = section("terms", "Plus e pagamento");
    expect(plusSection).toContain(
      `${money(PLUS_MONTHLY_PRICE_CENTS)} por mês ou ${money(PLUS_ANNUAL_PRICE_CENTS)} por ano`,
    );
    expect(plusSection).toContain(`${gold(PLUS_GOLD_AMOUNT)} a cada ${PLUS_GOLD_INTERVAL_DAYS} dias`);
    expect(plusSection).toContain("até 4K e 240 fps");
    expect(plusSection).toContain(`${PLUS_VIDEOS_PER_PERSON} vídeos ao mesmo tempo`);
    expect(plusSection).toMatch(/vídeo em conexão retransmitida e sala protegida, os dois pagos em ouro/);
    expect(blocks("terms")).toContain(`dias de Plus por ${gold(PLUS_GIFT_PRICE_GOLD)}`);
  });

  it("has the room of twelve and the paid relay in the Termos de Uso", () => {
    const room = section("terms", "Como a sala funciona");
    expect(room).toContain(`com até ${ROOM_MAX_PEOPLE} pessoas`);
    expect(room).toContain(`assiste até ${WATCHED_VIDEOS_PER_PERSON} vídeos ao mesmo tempo`);
    expect(room).toContain(`transmite até ${VIDEOS_PER_PERSON} vídeos ao mesmo tempo, em até 1080p a 60 fps`);
    expect(room).toMatch(
      /O vídeo só passa pela retransmissão quando quem transmite assina o Plus e tem ouro/,
    );
    expect(room).toContain(`${gold(RELAY_VIDEO_GOLD_PER_HOUR)} por hora`);
    expect(room).toMatch(/debitado por minuto do ouro de quem transmite/);
    expect(room).toMatch(/Sem o Plus ou sem ouro, o vídeo para naquela conexão e a voz e o chat continuam/);
  });

  it("has the protected room in the Termos de Uso: what it is, who opens, price, warnings and the end", () => {
    const room = section("terms", "Sala protegida");
    expect(room).toMatch(/toda a voz e todo o vídeo passam pelo servidor de retransmissão/);
    expect(room).toMatch(/não recebem o endereço IP uns dos outros/);
    expect(room).toContain(`até ${PROTECTED_ROOM_MAX_PEOPLE} pessoas e ${PROTECTED_ROOM_MAX_VIDEOS} vídeos`);
    expect(room).toMatch(/Só quem assina o Plus e tem ouro abre uma sala protegida/);
    expect(room).toMatch(/liga ou desliga a sala protegida com a sala vazia/);
    expect(room).toContain(`${gold(HOUR)} por hora, debitado por minuto do ouro do dono`);
    expect(room).toContain("o saldo cobre 10 e 2 minutos");
    expect(room).toContain("a sala espera 3 minutos");
    expect(room).toMatch(/encerrada para todos e não vira sala direta/);
    expect(room).toMatch(/O ouro gasto nos minutos já usados.*não volta/);
    expect(room).toMatch(
      /preços em ouro.*acompanham o custo da retransmissão.*podem mudar.*a versão destes Termos de Uso muda junto/,
    );
  });

  it("has the moderator in the Termos de Uso", () => {
    expect(section("terms", "Conduta e moderação")).toMatch(
      /O dono pode promover participantes a moderador: o moderador também silencia, remove e bane/,
    );
  });

  it("has the access log, now kept for real, in the Políticas de Privacidade", () => {
    const log = section("privacy", "Registros de acesso");
    expect(ACCESS_LOG_RETENTION_DAYS).toBeGreaterThanOrEqual(180);
    expect(log).toMatch(
      /a conta ou a sessão, o endereço IP, a data e a hora de cada login e de cada entrada em sala/,
    );
    expect(log).toContain("guardado por 6 meses");
    expect(log).toMatch(/só é entregue a autoridades mediante ordem judicial/);
    expect(log).toMatch(
      /Se você excluir a conta, o registro de acesso continua guardado até o fim desse prazo/,
    );
    expect(section("privacy", "Excluir a conta")).toMatch(/O registro de acesso não é apagado com a conta/);
  });

  it("has the relay and the protected room in the Políticas de Privacidade", () => {
    const room = section("privacy", "Dentro da sala");
    expect(room).toMatch(/participantes de uma mesma sala direta podem ver o endereço IP uns dos outros/);
    expect(room).toMatch(
      /Na sala protegida, toda a mídia passa pelo servidor de retransmissão da Cloudflare, e os participantes não recebem o endereço IP uns dos outros/,
    );
    expect(room).toMatch(/credencial de retransmissão.*identificador da sua sessão.*medirmos o uso/);
    expect(section("privacy", "Carteira e loja")).toMatch(/ouro debitado por minuto.*aparece no extrato/);
  });

  it.each([
    ["/termos", "Sala protegida"],
    ["/privacidade", "Registros de acesso"],
  ])("shows it on %s", (path, title) => {
    renderApp({ path });
    expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
    for (const name of screen.getByRole("main").querySelectorAll("strong")) {
      expect(name.textContent).toBe("sualive");
    }
  });

  it("promises nothing that is outside the delivery", () => {
    for (const kind of ["terms", "privacy"] as const) {
      expect(blocks(kind)).not.toMatch(
        /sala grande|sala pública|vitrine|denúncia|cortesia|período de teste/i,
      );
    }
  });
});

describe("no old number left", () => {
  /** Prices, gold and limits of before the fourth delivery. */
  const OLD = /19,90|159,90|1\.990|720p|1\.000 de ouro|vídeos por sala/;
  /** The blocks of the room have their own tests (and their own numbers of the relay). */
  const ROOM_BLOCKS = new Set([
    "lobby",
    "room",
    "roomEnd",
    "stage",
    "people",
    "gifts",
    "controls",
    "chat",
    "notices",
  ]);

  /** Every string of the copy, also what the functions give for sample arguments. */
  function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (typeof value === "function") {
      const samples = Array.from({ length: value.length }, () => "x");
      return strings((value as unknown as (...args: string[]) => unknown)(...samples));
    }
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") return Object.values(value).flatMap(strings);
    return [];
  }

  it("has none in the copy outside the room", () => {
    const outside = Object.entries(texts)
      .filter(([block]) => !ROOM_BLOCKS.has(block))
      .flatMap(([, value]) => strings(value));
    expect(outside.length).toBeGreaterThan(100);
    for (const text of outside) expect(text.replace(/\s/g, " ")).not.toMatch(OLD);
  });

  it.each([
    ["the home page of a visitor", "/", visitor],
    ["the home page of who has the Plus", "/", plus],
    ["the offer of the Plus", "/plus", visitor],
    ["the offer of the Plus, logged", "/plus", free],
    ["the page of the plan", "/plano", plus],
    ["the manifesto", MANIFESTO_PATH, visitor],
    ["the Termos de Uso", "/termos", visitor],
    ["the Políticas de Privacidade", "/privacidade", visitor],
    ["the shop", "/loja", free],
  ])("has none on %s", (_name, path, account) => {
    renderApp({ path, account: account(), wallet: makeLoadedWalletState() });
    expect(pageText().length).toBeGreaterThan(50);
    expect(pageText()).not.toMatch(OLD);
  });

  it("has none on the wallet, where the only 19,90 is the price of a gold pack", () => {
    // Without the packs: what is left is the copy of the wallet itself.
    renderApp({
      path: "/carteira",
      account: free(),
      wallet: makeLoadedWalletState({ goldPacks: [] }),
    });
    expect(heading()).toBe(texts.wallet.title);
    expect(pageText()).not.toMatch(OLD);
  });

  it("has none in the balloon of the Plus after the first access", async () => {
    renderApp({ path: "/bem-vindo", account: free() });
    const opener = screen.getByRole("button", { name: texts.welcome.plansOpen });
    act(() => opener.focus());
    fireEvent.click(opener);
    await screen.findByRole("dialog", { name: texts.welcome.plans.title });
    expect(pageText()).not.toMatch(OLD);
  });

  it("says the new free limits where the old ones were", () => {
    const terms = texts.legal.terms.sections.flatMap((section) => section.blocks).join("\n");
    expect(terms).toContain(`até ${ROOM_MAX_PEOPLE} pessoas`);
    expect(terms).not.toMatch(/com até 6 pessoas\. Por isso/);
  });
});
