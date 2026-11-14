import {
  GOLD_GIFT_DAILY_LIMIT,
  PLUS_GIFT_DAYS,
  PLUS_GIFT_PRICE_GOLD,
  PLUS_GOLD_AMOUNT,
  WELCOME_SILVER,
} from "@sualive/config";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatAmount } from "../components/format";
import { makeAccountState, makeUser } from "../test/account";
import { renderApp } from "../test/room";
import { makeLoadedWalletState } from "../test/wallet";
import { texts } from "../texts";

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const logged = () => makeAccountState({ user: makeUser() });
const links = () => within(screen.getByRole("group", { name: texts.nav.walletLabel }));

describe("ways into the wallet and the shop", () => {
  it.each(["/", "/perfil"])("shows both to who is logged, on %s", (path) => {
    renderApp({ path, account: logged() });
    expect(links().getByRole("link", { name: texts.nav.wallet }).getAttribute("href")).toBe("/carteira");
    expect(links().getByRole("link", { name: texts.nav.shop }).getAttribute("href")).toBe("/loja");
  });

  it("sits with the shortcut to the profile on the home page", () => {
    renderApp({ path: "/", account: logged() });
    const account = screen.getByTestId("home-account");
    expect(account.contains(screen.getByTestId("wallet-links"))).toBe(true);
  });

  it("shows neither to a visitor", () => {
    renderApp({ path: "/" });
    expect(screen.queryByTestId("wallet-links")).toBeNull();
    expect(screen.queryByRole("link", { name: texts.nav.wallet })).toBeNull();
    expect(screen.queryByRole("link", { name: texts.nav.shop })).toBeNull();
  });

  it("shows neither while the account is still loading", () => {
    renderApp({ path: "/", account: makeAccountState({ status: "loading" }) });
    expect(screen.queryByTestId("wallet-links")).toBeNull();
  });

  it("opens the wallet and the shop from the home page, and each leads to the other", () => {
    renderApp({ path: "/", account: logged(), wallet: makeLoadedWalletState() });
    fireEvent.click(links().getByRole("link", { name: texts.nav.wallet }));
    expect(heading()).toBe(texts.wallet.title);

    fireEvent.click(screen.getByRole("link", { name: texts.wallet.balances.shopLink }));
    expect(heading()).toBe(texts.shop.title);

    fireEvent.click(screen.getByRole("link", { name: texts.shop.walletLink }));
    expect(heading()).toBe(texts.wallet.title);
  });
});

describe("legal texts of the wallet", () => {
  const copy = (kind: "terms" | "privacy") =>
    texts.legal[kind].sections.flatMap((section) => section.blocks).join("\n");

  it("has the currencies in the Termos de Uso: what they are, how they come and what they never do", () => {
    const terms = copy("terms");
    expect(terms).toMatch(/Prata e ouro são moedas de uso exclusivo dentro do/);
    expect(terms).toMatch(/O ouro se compra por Pix, em pacotes, ou vem com o Plus pago/);
    expect(terms).toContain(`${formatAmount(PLUS_GOLD_AMOUNT)} de ouro`);
    expect(terms).toContain(`${formatAmount(WELCOME_SILVER)} de prata`);
    expect(terms).toMatch(/A compra de ouro é um Pix único.*pede o CPF/);
    expect(terms).toMatch(/não existe saque, reembolso em dinheiro nem conversão de ouro em prata/);
    expect(terms).toMatch(/Prata e ouro não expiram/);
    expect(terms).toMatch(/Item comprado é permanente e pessoal/);
    expect(terms).toContain(`até ${formatAmount(GOLD_GIFT_DAILY_LIMIT)} de ouro por dia`);
    expect(terms).toMatch(/O envio não se desfaz/);
    expect(terms).toContain(
      `${PLUS_GIFT_DAYS} dias de Plus por ${formatAmount(PLUS_GIFT_PRICE_GOLD)} de ouro`,
    );
    expect(terms).toMatch(/Excluir a conta apaga o saldo de prata e de ouro e os itens comprados/);
  });

  it("has the wallet in the Políticas de Privacidade: what is kept, the CPF, what others see, the deletion", () => {
    const privacy = copy("privacy");
    expect(privacy).toMatch(/saldos de prata e de ouro, o extrato/);
    expect(privacy).toMatch(/com a outra conta envolvida/);
    expect(privacy).toMatch(/itens que você comprou e os que estão equipados/);
    expect(privacy).toMatch(/registro das compras de ouro/);
    expect(privacy).toMatch(/O Plus e os pacotes de ouro são pagos por Pix.*pedimos o seu CPF/);
    expect(privacy).toMatch(/não guardamos o CPF/);
    expect(privacy).toMatch(/cosméticos que você equipa.*são vistos pelos outros participantes/);
    expect(privacy).toMatch(/A exclusão apaga também a carteira/);
    expect(privacy).toMatch(/compras de ouro já pagas ficam como registro contábil, sem ligação com a conta/);
  });

  it("keeps the names of the two texts with their capitals in what was added", () => {
    for (const kind of ["terms", "privacy"] as const) {
      expect(copy(kind)).not.toMatch(/[Tt]ermos de uso|olítica de [Pp]rivacidade|olíticas de privacidade/);
    }
  });

  it.each([
    ["/termos", "Prata, ouro e loja"],
    ["/privacidade", "Carteira e loja"],
  ])("shows the new section on %s", (path, title) => {
    renderApp({ path });
    expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
  });

  it("tells, where the account is deleted, that balance and items go with it", () => {
    expect(texts.profile.deleteExplain).toMatch(/saldo de prata e de ouro e os itens da loja/);
  });
});
