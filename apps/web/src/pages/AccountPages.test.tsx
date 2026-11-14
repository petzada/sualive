import {
  HANDLE_CHANGE_INTERVAL_DAYS,
  MINIMUM_AGE,
  PLUS_ANNUAL_EXPIRY_NOTICE_DAYS,
  PLUS_ANNUAL_PRICE_CENTS,
  PLUS_MONTHLY_PRICE_CENTS,
  TERMS_VERSION,
} from "@sualive/config";
import type { MeUser, Plan } from "@sualive/protocol";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AccountClientProvider } from "../components/account/AccountClient";
import type { AccountClient } from "../components/account/AccountClient";
import { PATHS } from "../components/account/paths";
import { planStatusText } from "../components/account/plan";
import { formatCents, formatDate, isValidCpf, maskCpf } from "../components/format";
import {
  DAY_MS,
  makeAccountActions,
  makeAccountClient,
  makeAccountState,
  makeActivePlan,
  makeCheckout,
  makePlan,
  makeUser,
} from "../test/account";
import { renderApp } from "../test/room";
import { texts } from "../texts";
import { OnboardingPage } from "./OnboardingPage";

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const logged = (user = makeUser()) => makeAccountState({ user });
const newcomer = () => logged(makeUser({ onboarded: false, handle: null }));
const VALID_CPF = "529.982.247-25";
/** The price as the queries see it: they turn the non-breaking space of the locale into a plain one. */
const money = (cents: number) => formatCents(cents).replace(/\s/g, " ");

describe("login", () => {
  const providerButton = (provider: "google" | "discord") =>
    screen.getByRole("link", { name: new RegExp(`^${texts.login.providers[provider]}`) });
  const isBefore = (first: Element, second: Element) =>
    Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("always shows the two buttons; only an available provider is a link, and it carries returnTo", () => {
    const { accountActions } = renderApp({
      path: "/entrar?returnTo=%2Fs%2Fabcdefghjk",
      account: makeAccountState({ providers: ["google"] }),
    });

    expect(heading()).toBe(texts.login.title);
    const google = providerButton("google");
    expect(google.textContent).toBe(texts.login.providers.google);
    expect(google.getAttribute("href")).toBe("/api/auth/google/start?returnTo=%2Fs%2Fabcdefghjk");
    expect(google.hasAttribute("aria-disabled")).toBe(false);
    expect(accountActions.loginUrl).toHaveBeenCalledWith("google", "/s/abcdefghjk");
    expect(accountActions.loginUrl).toHaveBeenCalledTimes(1);

    // The one that is not configured is there, switched off: no address, and it says "soon".
    const discord = providerButton("discord");
    expect(discord.textContent).toBe(`${texts.login.providers.discord}${texts.login.soon}`);
    expect(discord.getAttribute("aria-disabled")).toBe("true");
    expect(discord.hasAttribute("href")).toBe(false);
    expect(discord.tagName).not.toBe("A");
    expect(screen.getAllByText(texts.login.soon)).toHaveLength(1);
    // No password and no sign-up by e-mail: there is nothing to type on this page.
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(document.querySelector("input")).toBeNull();
  });

  it("offers both providers as links when both are configured", () => {
    renderApp({ path: "/entrar" });
    expect(providerButton("google").getAttribute("href")).toBe("/api/auth/google/start");
    expect(providerButton("discord").getAttribute("href")).toBe("/api/auth/discord/start");
    expect(screen.queryByText(texts.login.soon)).toBeNull();
  });

  it("switches both buttons off when no provider is available", () => {
    const { accountActions } = renderApp({ path: "/entrar", account: makeAccountState({ providers: [] }) });
    for (const provider of ["google", "discord"] as const) {
      expect(providerButton(provider).getAttribute("aria-disabled")).toBe("true");
      expect(providerButton(provider).hasAttribute("href")).toBe(false);
    }
    expect(screen.getAllByText(texts.login.soon)).toHaveLength(2);
    expect(accountActions.loginUrl).not.toHaveBeenCalled();
  });

  it("dresses each button in the colors of its provider, both with the same width", () => {
    renderApp({ path: "/entrar" });
    const [google, discord] = [providerButton("google"), providerButton("discord")];

    for (const name of ["bg-canvas", "border-hairline", "text-ink"]) {
      expect(google.className.split(" ")).toContain(name);
    }
    // The official "G": its four colors, from the tokens of the theme.
    const fills = [...google.querySelectorAll("svg path")].map((path) => path.getAttribute("fill"));
    expect(fills.sort()).toEqual(
      ["blue", "green", "red", "yellow"].map((color) => `var(--color-brand-google-${color})`),
    );
    for (const name of ["bg-brand-discord", "text-on-brand-discord"]) {
      expect(discord.className.split(" ")).toContain(name);
    }
    expect(discord.querySelector("svg path")?.getAttribute("fill")).toBe("currentColor");
    for (const button of [google, discord]) {
      expect(button.className.split(" ")).toContain("w-full");
      expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(google.closest("ul")).toBe(discord.closest("ul"));
  });

  it("is only the two columns: title, sub-headline, Google, Discord and the legal links; faces at the right", () => {
    renderApp({ path: "/entrar" });
    const main = screen.getByRole("main");

    const order = [
      screen.getByRole("heading", { level: 1, name: texts.login.title }),
      screen.getByText(texts.login.intro),
      providerButton("google"),
      providerButton("discord"),
      screen.getByRole("link", { name: texts.nav.terms }),
      screen.getByRole("link", { name: texts.nav.privacy }),
    ];
    order.slice(1).forEach((element, index) => expect(isBefore(order[index]!, element)).toBe(true));
    expect(texts.login.intro).toBe("Acesse sua conta.");
    expect(main.textContent).not.toContain("você não precisa de conta");
    // Nothing at the top: no name of the product and no way into the account.
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("link", { name: texts.nav.home })).toBeNull();
    expect(document.body.textContent).not.toContain(texts.home.title);
    expect(main.parentElement?.lastElementChild).toBe(main);

    // The right column: three slices of the big card of the home page, one face in each.
    const column = order[0]!.parentElement!;
    const faces = column.nextElementSibling!;
    expect(faces.getAttribute("aria-hidden")).toBe("true");
    expect(faces.textContent).toBe("");
    expect(faces.querySelector("a, button, [tabindex]")).toBeNull();
    for (const name of ["aspect-[4/5]", "max-w-md", "grid-rows-3"]) {
      expect(faces.className.split(" ")).toContain(name);
    }
    const photos = [...faces.querySelectorAll("img")];
    expect(photos.map((photo) => photo.getAttribute("src"))).toEqual(
      [1, 2, 3].map((index) => `/images/manifesto-${index}.jpg`),
    );
    for (const photo of photos) {
      expect(photo.getAttribute("alt")).toBe("");
      expect(photo.className.split(" ")).toContain("object-cover");
      expect(photo.parentElement?.className.split(" ")).toContain("rounded-card");
    }
  });

  it("shares the two columns with the home page", () => {
    const login = renderApp({ path: "/entrar" });
    const grid = () => screen.getByRole("heading", { level: 1 }).parentElement!.parentElement!;
    const [loginGrid, loginColumn] = [grid().className, grid().firstElementChild!.className];
    const loginMain = screen.getByRole("main").className;
    login.unmount();

    renderApp({ path: "/" });
    expect(grid().className).toBe(loginGrid);
    expect(grid().firstElementChild!.className).toBe(loginColumn);
    expect(screen.getByRole("main").className).toBe(loginMain);
    expect(loginGrid.split(" ")).toContain("md:grid-cols-2");
  });

  it("explains a failed login", () => {
    renderApp({ path: "/entrar?erro=login" });
    expect(screen.getByRole("alert").textContent).toBe(texts.login.failed);
  });

  it("ignores a returnTo that is not a local path", () => {
    const { accountActions } = renderApp({ path: "/entrar?returnTo=%2F%2Fevil.example" });
    expect(accountActions.loginUrl).toHaveBeenCalledWith("google", undefined);
  });

  it("sends who is already logged to the profile, or to returnTo", () => {
    const profile = renderApp({ path: "/entrar", account: logged() });
    expect(heading()).toBe(texts.profile.title);
    profile.unmount();

    renderApp({ path: "/entrar?returnTo=%2Fplus", account: logged() });
    expect(heading()).toBe(texts.plus.title);
  });
});

describe("first access", () => {
  const handleInput = () => screen.getByLabelText<HTMLInputElement>(texts.handle.label);
  const consent = () => screen.getByRole<HTMLInputElement>("checkbox");
  const submit = () => fireEvent.click(screen.getByRole("button", { name: texts.onboarding.submit }));
  const isBefore = (first: Element, second: Element) =>
    Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
  const describedBy = () => (handleInput().getAttribute("aria-describedby") ?? "").split(" ");

  /** Where the app is; stands in for every page that is not the first access. */
  function Location() {
    const location = useLocation();
    return <p data-testid="location">{location.pathname + location.search}</p>;
  }

  /** The first access alone in a router, to see where it sends the person afterwards. */
  function renderOnboarding(path: string, client: AccountClient) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <AccountClientProvider client={client}>
          <Routes>
            <Route path={PATHS.onboarding} element={<OnboardingPage />} />
            <Route path="*" element={<Location />} />
          </Routes>
        </AccountClientProvider>
      </MemoryRouter>,
    );
  }

  /** As the real account does: it turns "onboarded" before the form gets its answer. */
  function LiveAccount({ path, user }: { path: string; user: MeUser }) {
    const [state, setState] = useState(() => makeAccountState({ user }));
    const [actions] = useState(() => {
      const mocks = makeAccountActions();
      mocks.completeOnboarding.mockImplementation(({ handle }) => {
        setState(makeAccountState({ user: makeUser({ handle }) }));
        return Promise.resolve({ ok: true, value: undefined });
      });
      return mocks;
    });
    return (
      <MemoryRouter initialEntries={[path]}>
        <AccountClientProvider client={{ useAccount: () => ({ state, actions }) }}>
          <Routes>
            <Route path={PATHS.onboarding} element={<OnboardingPage />} />
            <Route path="*" element={<Location />} />
          </Routes>
        </AccountClientProvider>
      </MemoryRouter>
    );
  }

  async function finish() {
    fireEvent.change(handleInput(), { target: { value: "marina" } });
    fireEvent.click(consent());
    await screen.findByText(texts.handle.available);
    submit();
    return (await screen.findByTestId("location")).textContent;
  }

  it("is an onboarding screen: no name, no Plus and no account at the top, the legal links at the foot", () => {
    renderApp({ path: "/boas-vindas", account: newcomer() });

    expect(heading()).toBe("Só falta mais um passo");
    expect(screen.getByText("Escolha seu @nome e aceite os termos.")).toBeTruthy();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("link", { name: texts.nav.home })).toBeNull();
    expect(screen.queryByRole("link", { name: texts.nav.plus })).toBeNull();
    expect(document.body.textContent).not.toContain(texts.home.title);
    // Centered in the window, both ways.
    const main = screen.getByRole("main");
    for (const name of ["mx-auto", "flex-1", "justify-center"])
      expect(main.className.split(" ")).toContain(name);
    // The legal links close the page, centered, outside the form.
    const footer = screen.getByRole("contentinfo");
    expect(main.nextElementSibling).toBe(footer);
    expect(footer.className.split(" ")).toContain("justify-center");
    expect(within(footer).getByRole("link", { name: texts.nav.terms }).getAttribute("href")).toBe("/termos");
    expect(within(footer).getByRole("link", { name: texts.nav.privacy }).getAttribute("href")).toBe(
      "/privacidade",
    );
  });

  it("orders the form: the @handle, the single consent and then the button", () => {
    renderApp({ path: "/boas-vindas", account: newcomer() });

    const order = [
      screen.getByRole("heading", { level: 1 }),
      screen.getByText(texts.onboarding.intro),
      handleInput(),
      screen.getByText(texts.onboarding.handleHint),
      consent(),
      screen.getByRole("button", { name: texts.onboarding.submit }),
    ];
    order.slice(1).forEach((element, index) => expect(isBefore(order[index]!, element)).toBe(true));
  });

  it("explains the handle under the field, and keeps the rule for when it is broken", () => {
    renderApp({ path: "/boas-vindas", account: newcomer() });

    expect(texts.onboarding.handleHint).toBe(
      `Esse nome é a sua identificação oficial. Pode ser trocado a cada ${HANDLE_CHANGE_INTERVAL_DAYS} dias.`,
    );
    const hint = screen.getByText(texts.onboarding.handleHint);
    expect(describedBy()).toContain(hint.id);
    // Nothing about the size or the characters until what was typed breaks the rule.
    expect(document.body.textContent).not.toContain(texts.handle.rule);
    expect(screen.queryByText(texts.handle.invalid)).toBeNull();
    expect(handleInput().hasAttribute("aria-invalid")).toBe(false);

    fireEvent.change(handleInput(), { target: { value: "ab" } });
    const error = screen.getByText(texts.handle.invalid);
    expect(error.getAttribute("role")).toBe("alert");
    expect(handleInput().getAttribute("aria-invalid")).toBe("true");
    expect(describedBy()).toContain(error.id);
    // Under the field, before the hint; not on the line of the label.
    expect(isBefore(handleInput(), error)).toBe(true);
    expect(isBefore(error, hint)).toBe(true);
    expect(document.querySelector("[data-status]")?.textContent).toBe("");

    fireEvent.change(handleInput(), { target: { value: "abc" } });
    expect(screen.queryByText(texts.handle.invalid)).toBeNull();
    expect(handleInput().hasAttribute("aria-invalid")).toBe(false);
  });

  it("shows the availability on the line of the label, at the right", async () => {
    renderApp({ path: "/boas-vindas", account: newcomer() });
    const label = document.querySelector(`label[for="${handleInput().id}"]`)!;
    const status = document.querySelector("[data-status]")!;

    expect(label.textContent).toBe(texts.handle.label);
    expect(label.parentElement).toBe(status.parentElement);
    expect(label.nextElementSibling).toBe(status);
    expect(label.parentElement?.className.split(" ")).toContain("justify-between");
    expect(status.className.split(" ")).toContain("text-right");
    expect(isBefore(status, handleInput())).toBe(true);
    expect(describedBy()).toContain(status.id);

    fireEvent.change(handleInput(), { target: { value: "marina_2" } });
    expect(status.textContent).toBe(texts.handle.checking);
    await waitFor(() => expect(status.textContent).toBe(texts.handle.available));
  });

  it("goes to the welcome after finishing, not to the profile", async () => {
    const actions = makeAccountActions();
    renderOnboarding("/boas-vindas", makeAccountClient(newcomer(), actions));

    expect(await finish()).toBe(PATHS.welcome);
    expect(PATHS.welcome).toBe("/bem-vindo");
  });

  it("goes back to where the person came from, when there was a returnTo", async () => {
    renderOnboarding("/boas-vindas?returnTo=%2Fs%2Fabcdefghjk", makeAccountClient(newcomer()));

    expect(await finish()).toBe("/s/abcdefghjk");
  });

  it("still goes to the welcome when the account turns onboarded before the answer arrives", async () => {
    const user = makeUser({ onboarded: false, handle: null });
    const first = render(<LiveAccount path="/boas-vindas" user={user} />);
    expect(await finish()).toBe(PATHS.welcome);
    first.unmount();

    render(<LiveAccount path="/boas-vindas?returnTo=%2Fplus" user={user} />);
    expect(await finish()).toBe("/plus");
  });

  it("sends who finished long ago and opens it again to the profile", () => {
    renderOnboarding("/boas-vindas", makeAccountClient(logged()));
    expect(screen.getByTestId("location").textContent).toBe(PATHS.profile);
  });

  it("has one checkbox for age, terms and privacy, with links to the two pages", () => {
    renderApp({ path: "/boas-vindas", account: newcomer() });

    expect(heading()).toBe(texts.onboarding.title);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    const label = document.querySelector(`label[for="${consent().id}"]`);
    expect(label?.textContent).toBe(
      `Declaro que sou maior de ${MINIMUM_AGE} anos e aceito os Termos de Uso e a Política de Privacidade.`,
    );
    expect(screen.getByRole("link", { name: texts.onboarding.consent.terms }).getAttribute("href")).toBe(
      "/termos",
    );
    expect(screen.getByRole("link", { name: texts.onboarding.consent.privacy }).getAttribute("href")).toBe(
      "/privacidade",
    );
  });

  it("does not finish without the consent, and ties the error to the checkbox", () => {
    const { accountActions } = renderApp({ path: "/boas-vindas", account: newcomer() });
    fireEvent.change(handleInput(), { target: { value: "marina" } });

    submit();

    expect(accountActions.completeOnboarding).not.toHaveBeenCalled();
    const error = screen.getByText(texts.onboarding.consentRequired);
    expect(consent().getAttribute("aria-invalid")).toBe("true");
    expect(consent().getAttribute("aria-describedby")).toBe(error.id);
  });

  it("validates the handle as it is typed: rules first, then the availability", async () => {
    const accountActions = makeAccountActions();
    accountActions.checkHandle.mockImplementation((handle) =>
      Promise.resolve({
        ok: true,
        value:
          handle === "caio"
            ? { available: false, reason: "taken" }
            : handle === "admin"
              ? { available: false, reason: "reserved" }
              : { available: true },
      }),
    );
    renderApp({ path: "/boas-vindas", account: newcomer(), accountActions });

    // Capitals and the "@" are fixed for the person; what breaks the rules is explained.
    fireEvent.change(handleInput(), { target: { value: "@Ab" } });
    expect(handleInput().value).toBe("ab");
    expect(screen.getByText(texts.handle.invalid)).toBeTruthy();
    expect(handleInput().getAttribute("aria-invalid")).toBe("true");
    expect(accountActions.checkHandle).not.toHaveBeenCalled();

    fireEvent.change(handleInput(), { target: { value: "caio" } });
    expect(screen.getByText(texts.handle.checking)).toBeTruthy();
    expect(await screen.findByText(texts.handle.taken)).toBeTruthy();
    expect(handleInput().getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(handleInput(), { target: { value: "admin" } });
    expect(await screen.findByText(texts.handle.reserved)).toBeTruthy();

    fireEvent.change(handleInput(), { target: { value: "marina_2" } });
    expect(await screen.findByText(texts.handle.available)).toBeTruthy();
    expect(handleInput().getAttribute("aria-invalid")).toBeNull();
  });

  it("does not finish with a handle that is taken or missing", async () => {
    const accountActions = makeAccountActions();
    accountActions.checkHandle.mockResolvedValue({ ok: true, value: { available: false, reason: "taken" } });
    renderApp({ path: "/boas-vindas", account: newcomer(), accountActions });
    fireEvent.click(consent());

    submit();
    expect(screen.getByText(texts.onboarding.handleRequired)).toBeTruthy();

    fireEvent.change(handleInput(), { target: { value: "caio" } });
    await screen.findByText(texts.handle.taken);
    submit();
    expect(accountActions.completeOnboarding).not.toHaveBeenCalled();
  });

  it("finishes with the two fields of the contract and the chosen handle", async () => {
    const { accountActions } = renderApp({ path: "/boas-vindas?returnTo=%2Fplus", account: newcomer() });
    fireEvent.click(consent());
    fireEvent.change(handleInput(), { target: { value: "marina" } });
    await screen.findByText(texts.handle.available);

    submit();

    await waitFor(() =>
      expect(accountActions.completeOnboarding).toHaveBeenCalledWith({
        handle: "marina",
        adult: true,
        acceptTerms: true,
      }),
    );
  });

  it("shows a refusal of the server on the handle field", async () => {
    const accountActions = makeAccountActions();
    accountActions.completeOnboarding.mockResolvedValue({ ok: false, reason: "handleTaken" });
    renderApp({ path: "/boas-vindas", account: newcomer(), accountActions });
    fireEvent.click(consent());
    fireEvent.change(handleInput(), { target: { value: "marina" } });

    submit();

    expect(await screen.findByText(texts.handle.taken)).toBeTruthy();
    expect(handleInput().getAttribute("aria-invalid")).toBe("true");
  });

  it.each(["/perfil", "/plus", "/s/abcdefghjk", "/@marina"])(
    "is where %s sends a logged person who has not finished it",
    (path) => {
      const { useRoom } = renderApp({ path, account: newcomer() });
      expect(heading()).toBe(texts.onboarding.title);
      // The room is not even opened before the first access is done.
      expect(useRoom).not.toHaveBeenCalled();
    },
  );

  it("sends a visitor to the login, and who already finished to where they were going", () => {
    const visitor = renderApp({ path: "/boas-vindas" });
    expect(heading()).toBe(texts.login.title);
    visitor.unmount();

    renderApp({ path: "/boas-vindas?returnTo=%2Fplus", account: logged() });
    expect(heading()).toBe(texts.plus.title);
  });
});

describe("profile", () => {
  it("sends a visitor to the login, with the way back", () => {
    const { accountActions } = renderApp({ path: "/perfil" });
    expect(heading()).toBe(texts.login.title);
    expect(accountActions.loginUrl).toHaveBeenCalledWith("google", "/perfil");
  });

  it("shows nickname, handle, picture and badges, with no way to send a photo", () => {
    renderApp({
      path: "/perfil",
      account: logged(
        makeUser({
          avatarUrl: "https://example.test/a.png",
          badges: ["plus", "early_supporter"],
          plan: makeActivePlan(),
        }),
      ),
    });

    expect(screen.getByTestId("profile-nickname").textContent).toBe("Marina");
    expect(screen.getByText("@marina")).toBeTruthy();
    const badges = screen.getByRole("group", { name: texts.profile.badgesLabel });
    expect(within(badges).getByText(texts.badges.plus.name)).toBeTruthy();
    expect(within(badges).getByText(texts.badges.early_supporter.name)).toBeTruthy();
    const picture = document.querySelector<HTMLImageElement>('img[src="https://example.test/a.png"]');
    expect(picture?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("edits the nickname", async () => {
    const { accountActions } = renderApp({ path: "/perfil", account: logged() });
    const input = screen.getByLabelText<HTMLInputElement>(texts.profile.nicknameLabel);
    const save = screen.getByRole("button", { name: texts.common.save });
    expect(input.value).toBe("Marina");
    expect(save.hasAttribute("disabled")).toBe(true);

    fireEvent.change(input, { target: { value: "M" } });
    expect(screen.getByText(texts.profile.nicknameInvalid)).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(input, { target: { value: "  Mari  " } });
    fireEvent.click(save);

    await waitFor(() => expect(accountActions.updateProfile).toHaveBeenCalledWith({ nickname: "Mari" }));
    expect(await screen.findByText(texts.common.saved)).toBeTruthy();
  });

  it("says when the handle can be changed again instead of offering the change", () => {
    const availableAt = Date.now() + 12 * DAY_MS;
    renderApp({ path: "/perfil", account: logged(makeUser({ handleChangeAvailableAt: availableAt })) });

    expect(screen.getByTestId("handle-locked").textContent).toBe(
      texts.profile.handleLocked(formatDate(availableAt)),
    );
    expect(screen.queryByLabelText(texts.profile.handleLabel)).toBeNull();
  });

  it.each(["handleChangeTooSoon", "handleTaken", "handleReserved"] as const)(
    "explains a %s refusal when changing the handle",
    async (reason) => {
      const accountActions = makeAccountActions();
      accountActions.updateProfile.mockResolvedValue({ ok: false, reason });
      renderApp({ path: "/perfil", account: logged(), accountActions });

      fireEvent.change(screen.getByLabelText(texts.profile.handleLabel), { target: { value: "nova" } });
      fireEvent.click(screen.getByRole("button", { name: texts.profile.handleSubmit }));

      expect(await screen.findByText(texts.account.errors[reason])).toBeTruthy();
      expect(accountActions.updateProfile).toHaveBeenCalledWith({ handle: "nova" });
    },
  );

  it("does not send the handle the person already has", () => {
    const { accountActions } = renderApp({ path: "/perfil", account: logged() });
    fireEvent.change(screen.getByLabelText(texts.profile.handleLabel), { target: { value: "marina" } });
    fireEvent.click(screen.getByRole("button", { name: texts.profile.handleSubmit }));

    expect(screen.getByText(texts.profile.handleSame)).toBeTruthy();
    expect(accountActions.updateProfile).not.toHaveBeenCalled();
  });

  it("summarizes the plan with a link to its page, and warns discreetly near the annual expiry", () => {
    const free = renderApp({ path: "/perfil", account: logged() });
    expect(screen.getByText(texts.profile.planFree)).toBeTruthy();
    expect(screen.getByRole("link", { name: texts.profile.planLink }).getAttribute("href")).toBe("/plus");
    expect(screen.queryByTestId("annual-expiry")).toBeNull();
    free.unmount();

    const periodEnd = Date.now() + 3 * DAY_MS;
    const plan = makeActivePlan({ cycle: "annual", renews: false, periodEnd });
    renderApp({ path: "/perfil", account: logged(makeUser({ plan })) });
    expect(screen.getByText(planStatusText(plan)!)).toBeTruthy();
    expect(screen.getByTestId("annual-expiry").textContent).toBe(
      texts.plus.annualExpiry(3, formatDate(periodEnd)),
    );
    expect(screen.getByRole("link", { name: texts.profile.planManage })).toBeTruthy();
  });

  it("gives the fixed link, to copy and to open, only to who has the Plus", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const free = renderApp({ path: "/perfil", account: logged() });
    expect(screen.queryByLabelText(texts.profile.fixedLinkLabel)).toBeNull();
    free.unmount();

    renderApp({ path: "/perfil", account: logged(makeUser({ plan: makeActivePlan() })) });
    const address = `${window.location.origin}/@marina`;
    expect(screen.getByLabelText<HTMLInputElement>(texts.profile.fixedLinkLabel).value).toBe(address);
    expect(screen.getByRole("link", { name: texts.profile.fixedLinkOpen }).getAttribute("href")).toBe(
      "/@marina",
    );

    fireEvent.click(screen.getByRole("button", { name: texts.common.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(address));
    expect(await screen.findByRole("button", { name: texts.common.copied })).toBeTruthy();
  });

  it("logs out and goes back to the home page", async () => {
    const { accountActions } = renderApp({ path: "/perfil", account: logged() });
    fireEvent.click(screen.getByRole("button", { name: texts.profile.logout }));

    await waitFor(() => expect(accountActions.logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: texts.home.create })).toBeTruthy();
  });

  it("deletes the account only after the person types their handle", async () => {
    const { accountActions } = renderApp({ path: "/perfil", account: logged() });
    const zone = within(screen.getByTestId("delete-zone"));
    expect(zone.getByText(texts.profile.deleteExplain)).toBeTruthy();
    expect(zone.queryByRole("button", { name: texts.profile.deleteConfirm })).toBeNull();

    fireEvent.click(zone.getByRole("button", { name: texts.profile.deleteStart }));
    const confirm = zone.getByRole("button", { name: texts.profile.deleteConfirm });
    const input = zone.getByLabelText(texts.profile.deleteConfirmLabel("marina"));
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(input, { target: { value: "@marin" } });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.click(confirm);
    expect(accountActions.deleteAccount).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "@marina" } });
    expect(confirm.hasAttribute("disabled")).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(accountActions.deleteAccount).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: texts.home.create })).toBeTruthy();
  });

  it("keeps the person on the page when the deletion fails", async () => {
    const accountActions = makeAccountActions();
    accountActions.deleteAccount.mockResolvedValue({ ok: false, reason: "error" });
    renderApp({ path: "/perfil", account: logged(), accountActions });
    const zone = within(screen.getByTestId("delete-zone"));
    fireEvent.click(zone.getByRole("button", { name: texts.profile.deleteStart }));
    fireEvent.change(zone.getByLabelText(texts.profile.deleteConfirmLabel("marina")), {
      target: { value: "marina" },
    });
    fireEvent.click(zone.getByRole("button", { name: texts.profile.deleteConfirm }));

    expect(await zone.findByText(texts.account.errors.error)).toBeTruthy();
    expect(heading()).toBe(texts.profile.title);
  });
});

describe("plan", () => {
  const chooseMonthly = () =>
    fireEvent.click(screen.getByRole("button", { name: texts.plus.cycles.monthly.choose }));
  const cpfInput = () => screen.getByLabelText<HTMLInputElement>(texts.plus.checkout.cpfLabel);
  const generate = () => fireEvent.click(screen.getByRole("button", { name: texts.plus.checkout.submit }));

  /** Chooses the monthly cycle and sends a valid CPF: the QR Code is on screen afterwards. */
  async function reachPayment() {
    chooseMonthly();
    fireEvent.change(cpfInput(), { target: { value: VALID_CPF } });
    generate();
    return screen.findByTestId("payment");
  }

  it("shows the benefits and the two cycles with the prices of the configuration", () => {
    renderApp({ path: "/plus" });

    expect(heading()).toBe(texts.plus.title);
    for (const benefit of texts.plus.benefits) expect(screen.getByText(benefit.title)).toBeTruthy();
    const monthly = within(screen.getByTestId("cycle-monthly"));
    const annual = within(screen.getByTestId("cycle-annual"));
    expect(monthly.getByText(money(PLUS_MONTHLY_PRICE_CENTS))).toBeTruthy();
    expect(monthly.getByText(texts.plus.cycles.monthly.how)).toBeTruthy();
    expect(annual.getByText(money(PLUS_ANNUAL_PRICE_CENTS))).toBeTruthy();
    expect(annual.getByText(texts.plus.cycles.annual.how)).toBeTruthy();
    // Pix only.
    expect(document.body.textContent).not.toMatch(/cartão|boleto/i);
  });

  it("formats cents the Brazilian way", () => {
    expect(formatCents(1990).replace(/\s/g, " ")).toBe("R$ 19,90");
    expect(formatCents(15990).replace(/\s/g, " ")).toBe("R$ 159,90");
  });

  it("takes a visitor to the login when a cycle is chosen, to come back with it", () => {
    const { accountActions } = renderApp({ path: "/plus" });
    fireEvent.click(screen.getByRole("button", { name: texts.plus.cycles.annual.choose }));

    expect(heading()).toBe(texts.login.title);
    expect(accountActions.loginUrl).toHaveBeenCalledWith("google", "/plus?ciclo=anual");
  });

  it("opens the CPF step at once when coming back from the login with a cycle", () => {
    renderApp({ path: "/plus?ciclo=anual", account: logged() });
    expect(screen.getByRole("heading", { name: texts.plus.checkout.title("anual") })).toBeTruthy();
    expect(cpfInput()).toBeTruthy();
  });

  it("only shows the benefits while billing is off", () => {
    renderApp({ path: "/plus", account: makeAccountState({ user: makeUser(), billingEnabled: false }) });

    expect(screen.getByTestId("billing-disabled").textContent).toBe(texts.plus.billingDisabled);
    expect(screen.getByText(texts.plus.benefits[0].title)).toBeTruthy();
    expect(screen.queryByRole("button", { name: texts.plus.cycles.monthly.choose })).toBeNull();
    expect(screen.queryByRole("button", { name: texts.plus.cycles.annual.choose })).toBeNull();
  });

  const periodEnd = Date.now() + 40 * DAY_MS;
  const plans: Array<[string, Plan]> = [
    ["active monthly", makeActivePlan({ periodEnd })],
    ["active annual", makeActivePlan({ cycle: "annual", renews: false, periodEnd })],
    ["past due", makePlan({ status: "past_due", plus: true, cycle: "monthly", periodEnd })],
    ["canceled", makePlan({ status: "canceled", plus: true, cycle: "monthly", periodEnd })],
    ["ended", makePlan({ status: "ended", plus: false, cycle: "monthly", periodEnd: Date.now() - DAY_MS })],
  ];

  it.each(plans)("describes the %s state of the subscription", (_name, plan) => {
    renderApp({ path: "/plus", account: logged(makeUser({ plan })) });

    const status = within(screen.getByTestId("plan-status"));
    expect(status.getByText(planStatusText(plan)!)).toBeTruthy();
    // Who has the Plus is not offered another subscription; who lost it can subscribe again.
    expect(Boolean(screen.queryByRole("button", { name: texts.plus.cycles.monthly.choose }))).toBe(
      !plan.plus,
    );
  });

  it("has a different sentence for each state, with the dates", () => {
    const sentences = plans.map(([, plan]) => planStatusText(plan));
    expect(new Set(sentences).size).toBe(plans.length);
    expect(sentences[0]).toBe(texts.plus.status.activeRenews("mensal", formatDate(periodEnd)));
    expect(sentences[1]).toBe(texts.plus.status.activeUntil("anual", formatDate(periodEnd)));
    expect(sentences[2]).toBe(texts.plus.status.pastDue);
    expect(sentences[3]).toBe(texts.plus.status.canceled(formatDate(periodEnd)));
    expect(planStatusText(makePlan())).toBeNull();
  });

  it("has no subscription card for who never subscribed", () => {
    renderApp({ path: "/plus", account: logged() });
    expect(screen.queryByTestId("plan-status")).toBeNull();
    expect(screen.getByRole("button", { name: texts.plus.cycles.monthly.choose })).toBeTruthy();
  });

  it.each([
    [PLUS_ANNUAL_EXPIRY_NOTICE_DAYS, true],
    [1, true],
    [PLUS_ANNUAL_EXPIRY_NOTICE_DAYS + 1, false],
  ])("warns about the annual plan at %i days from the end: %s", (days, warns) => {
    // Half a day short, so the count rounds up to exactly `days`.
    const end = Date.now() + days * DAY_MS - DAY_MS / 2;
    const plan = makeActivePlan({ cycle: "annual", renews: false, periodEnd: end });
    renderApp({ path: "/plus", account: logged(makeUser({ plan })) });

    const notice = screen.queryByTestId("annual-expiry");
    expect(Boolean(notice)).toBe(warns);
    if (warns) expect(notice?.textContent).toBe(texts.plus.annualExpiry(days, formatDate(end)));
  });

  it("never warns about a monthly plan, which renews by itself", () => {
    const plan = makeActivePlan({ periodEnd: Date.now() + DAY_MS });
    renderApp({ path: "/plus", account: logged(makeUser({ plan })) });
    expect(screen.queryByTestId("annual-expiry")).toBeNull();
  });

  it("masks and validates the CPF before creating the charge", async () => {
    const { accountActions } = renderApp({ path: "/plus", account: logged() });
    chooseMonthly();

    expect(screen.getByText(texts.plus.checkout.cpfWhy)).toBeTruthy();
    fireEvent.change(cpfInput(), { target: { value: "52998224724" } });
    expect(cpfInput().value).toBe("529.982.247-24");
    generate();

    const error = screen.getByText(texts.plus.checkout.cpfInvalid);
    expect(cpfInput().getAttribute("aria-invalid")).toBe("true");
    expect(cpfInput().getAttribute("aria-describedby")).toContain(error.id);
    expect(accountActions.startPlusCheckout).not.toHaveBeenCalled();

    fireEvent.change(cpfInput(), { target: { value: "52998224725" } });
    expect(cpfInput().value).toBe(VALID_CPF);
    generate();

    await waitFor(() =>
      expect(accountActions.startPlusCheckout).toHaveBeenCalledWith({
        cycle: "monthly",
        taxId: "52998224725",
      }),
    );
  });

  it("knows a CPF by its check digits", () => {
    expect(isValidCpf(VALID_CPF)).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("529.982.247")).toBe(false);
    expect(maskCpf("5299822")).toBe("529.982.2");
    expect(maskCpf("52998224725999")).toBe(VALID_CPF);
  });

  it("shows the QR Code, the copy-and-paste code, the amount and the deadline, then the confirmation", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const accountActions = makeAccountActions();
    const checkout = makeCheckout();
    accountActions.startPlusCheckout.mockResolvedValue({ ok: true, value: checkout });
    renderApp({ path: "/plus", account: logged(), accountActions });

    const payment = within(await reachPayment());
    expect(payment.getByAltText(texts.plus.checkout.qrAlt).getAttribute("src")).toBe(checkout.qrCodeImageUrl);
    expect(payment.getByLabelText<HTMLTextAreaElement>(texts.plus.checkout.brCodeLabel).value).toBe(
      checkout.brCode,
    );
    expect(payment.getByText(money(checkout.amountCents))).toBeTruthy();
    expect(payment.getByText(texts.plus.checkout.expiresAt)).toBeTruthy();
    expect(accountActions.watchPlusPayment).toHaveBeenCalledWith(checkout.paymentId, expect.any(Function));

    fireEvent.click(payment.getByRole("button", { name: texts.common.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(checkout.brCode));

    // The state of the payment is announced from one live region.
    const live = payment.getByText(texts.plus.checkout.pending).closest('[aria-live="polite"]');
    expect(live).toBeTruthy();

    act(() => accountActions.emitPayment("paid"));

    expect(payment.getByRole("heading", { name: texts.plus.checkout.paidTitle })).toBeTruthy();
    expect(live?.textContent).toBe(texts.plus.checkout.paid);
    expect(payment.queryByAltText(texts.plus.checkout.qrAlt)).toBeNull();
    expect(payment.getByRole("link", { name: texts.plus.checkout.paidAction }).getAttribute("href")).toBe(
      "/perfil",
    );
  });

  it.each(["expired", "failed"] as const)(
    "offers another QR Code when the payment has %s",
    async (status) => {
      const accountActions = makeAccountActions();
      accountActions.startPlusCheckout
        .mockResolvedValueOnce({ ok: true, value: makeCheckout({ paymentId: "pay-1" }) })
        .mockResolvedValueOnce({ ok: true, value: makeCheckout({ paymentId: "pay-2" }) });
      renderApp({ path: "/plus", account: logged(), accountActions });
      await reachPayment();

      act(() => accountActions.emitPayment(status));
      expect(screen.getByText(texts.plus.checkout[status])).toBeTruthy();
      expect(screen.queryByAltText(texts.plus.checkout.qrAlt)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: texts.plus.checkout.retry }));

      // Same cycle and CPF, a new charge; the screen follows the new one.
      await waitFor(() => expect(accountActions.startPlusCheckout).toHaveBeenCalledTimes(2));
      expect(accountActions.startPlusCheckout.mock.calls[1]).toEqual([
        { cycle: "monthly", taxId: "52998224725" },
      ]);
      await waitFor(() =>
        expect(accountActions.watchPlusPayment).toHaveBeenLastCalledWith("pay-2", expect.any(Function)),
      );
      expect(await screen.findByAltText(texts.plus.checkout.qrAlt)).toBeTruthy();
      expect(accountActions.stopWatching).toHaveBeenCalled();
    },
  );

  it.each(["alreadySubscribed", "billingUnavailable", "invalid", "error"] as const)(
    "explains a %s refusal of the charge",
    async (reason) => {
      const accountActions = makeAccountActions();
      accountActions.startPlusCheckout.mockResolvedValue({ ok: false, reason });
      renderApp({ path: "/plus", account: logged(), accountActions });
      chooseMonthly();
      fireEvent.change(cpfInput(), { target: { value: VALID_CPF } });
      generate();

      expect(await screen.findByText(texts.account.errors[reason])).toBeTruthy();
      expect(screen.queryByTestId("payment")).toBeNull();
    },
  );

  it("treats a thrown checkout as a generic error", async () => {
    const accountActions = makeAccountActions();
    accountActions.startPlusCheckout.mockRejectedValue(new Error("network"));
    renderApp({ path: "/plus", account: logged(), accountActions });
    chooseMonthly();
    fireEvent.change(cpfInput(), { target: { value: VALID_CPF } });
    generate();

    expect(await screen.findByText(texts.account.errors.error)).toBeTruthy();
  });

  it("cancels the subscription after a confirmation that says until when it is valid", async () => {
    const plan = makeActivePlan({ periodEnd });
    const { accountActions } = renderApp({ path: "/plus", account: logged(makeUser({ plan })) });
    const status = within(screen.getByTestId("plan-status"));

    fireEvent.click(status.getByRole("button", { name: texts.plus.cancel.start }));
    expect(status.getByText(texts.plus.cancel.explain(formatDate(periodEnd)))).toBeTruthy();
    expect(accountActions.cancelPlus).not.toHaveBeenCalled();

    fireEvent.click(status.getByRole("button", { name: texts.plus.cancel.confirm }));

    await waitFor(() => expect(accountActions.cancelPlus).toHaveBeenCalledTimes(1));
    expect(await status.findByText(/Assinatura cancelada/)).toBeTruthy();
    expect(status.queryByRole("button", { name: texts.plus.cancel.start })).toBeNull();
  });

  it("can keep the subscription, and has nothing to cancel on the annual plan", () => {
    const monthly = renderApp({ path: "/plus", account: logged(makeUser({ plan: makeActivePlan() })) });
    fireEvent.click(screen.getByRole("button", { name: texts.plus.cancel.start }));
    fireEvent.click(screen.getByRole("button", { name: texts.plus.cancel.keep }));
    expect(monthly.accountActions.cancelPlus).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: texts.plus.cancel.start })).toBeTruthy();
    monthly.unmount();

    const plan = makeActivePlan({ cycle: "annual", renews: false });
    renderApp({ path: "/plus", account: logged(makeUser({ plan })) });
    expect(screen.queryByRole("button", { name: texts.plus.cancel.start })).toBeNull();
  });
});

describe("legal pages", () => {
  it.each([
    ["/termos", texts.legal.terms],
    ["/privacidade", texts.legal.privacy],
  ] as const)("shows %s as plain text with its version", (path, copy) => {
    renderApp({ path });

    expect(heading()).toBe(copy.title);
    const [year, month, day] = TERMS_VERSION.split("-");
    expect(screen.getByTestId("legal-version").textContent).toBe(
      texts.legal.version(`${day}/${month}/${year}`),
    );
    for (const section of copy.sections) {
      expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeTruthy();
    }
    // Whoever accepts declares to be of age, in both documents.
    expect(document.body.textContent).toContain(`declara ter ${MINIMUM_AGE} anos ou mais`);
  });

  it("marks, in plain sight, what still depends on the operator", () => {
    renderApp({ path: "/termos" });
    const pending = screen.getAllByTestId("legal-pending");
    const expected = texts.legal.terms.sections.flatMap((section) =>
      section.blocks.filter((block) => typeof block !== "string"),
    );
    expect(pending).toHaveLength(expected.length);
    expect(pending.length).toBeGreaterThan(0);
    for (const block of pending) expect(block.textContent).toContain(texts.legal.pendingLabel);
  });
});

describe("home page with accounts", () => {
  const account = () => screen.getByTestId("home-account");
  const createButton = () => screen.getByRole("button", { name: texts.home.create });
  const isBefore = (first: Element, second: Element) =>
    Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("offers the login to a visitor as plain text right below the create button", () => {
    renderApp({ path: "/" });

    expect(account().textContent).toBe(`${texts.home.account.question}${texts.home.account.login}`);
    // Only "Entrar" is the link, and it is text, not a button.
    const links = within(account()).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]?.textContent).toBe(texts.home.account.login);
    expect(links[0]?.getAttribute("href")).toBe("/entrar");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    // Close under the button: same block, with no gap in it. The hint went up, above the button.
    expect(createButton().nextElementSibling).toBe(account());
    expect(createButton().parentElement?.className).not.toContain("gap-");
    expect(isBefore(screen.getByText(texts.home.hint), createButton())).toBe(true);
    // Nothing about the account at the top of the page.
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("has the legal pages in a minimal footer", () => {
    renderApp({ path: "/" });
    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: texts.nav.terms }).getAttribute("href")).toBe("/termos");
    expect(footer.getByRole("link", { name: texts.nav.privacy }).getAttribute("href")).toBe("/privacidade");
  });

  it("shows the nickname with a small picture, leading to the profile, in the same place", () => {
    renderApp({ path: "/", account: logged(makeUser({ avatarUrl: "https://example.test/a.png" })) });

    const profile = within(account()).getByRole("link", { name: texts.nav.profile("Marina") });
    expect(profile.getAttribute("href")).toBe("/perfil");
    expect(profile.textContent).toBe("Marina");
    expect(profile.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.png");
    expect(account().textContent).not.toContain(texts.home.account.question);
    expect(createButton().nextElementSibling).toBe(account());
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows nothing about the account while it is still loading", () => {
    renderApp({ path: "/", account: makeAccountState({ status: "loading" }) });
    expect(screen.queryByTestId("home-account")).toBeNull();
  });
});
