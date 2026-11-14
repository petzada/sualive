import {
  FREE_VIDEO_QUALITY,
  PLUS_GIFT_DAYS,
  PLUS_GIFT_PRICE_GOLD,
  PLUS_VIDEO_QUALITY,
  PROTECTED_ROOM_GOLD_PER_HOUR,
  VIDEOS_PER_PERSON,
} from "@sualive/config";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { texts } from "../../apps/web/src/texts";
import { ACCOUNT_COOKIE, account, type AccountName } from "../accounts";

/**
 * Fumaça da conta, do perfil e do Plus contra o produto real no simulador do Wrangler. As contas e
 * as sessões já estão no D1 local (`accounts.ts`, gravado pelo `playwright.config.ts`); cada pessoa
 * é um contexto com cookies próprios e câmera e microfone falsos. O Google e a Woovi nunca são
 * chamados: o login fica no cookie de sessão e o Plus na linha de assinatura que o webhook gravaria.
 */

declare global {
  interface Window {
    /** Conexões WebRTC criadas pela página (anotadas pelo teste). */
    __sualivePeers?: RTCPeerConnection[];
  }
}

/** Roda na página antes do app: guarda cada RTCPeerConnection para o teste ler os envios. */
function trackPeerConnections() {
  const Native = window.RTCPeerConnection;
  const peers: RTCPeerConnection[] = [];
  window.__sualivePeers = peers;
  window.RTCPeerConnection = class extends Native {
    constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
      super(...args);
      peers.push(this);
    }
  };
}

/**
 * Teto de quadros por segundo que o navegador aplica aos vídeos que envia (o maior entre todos),
 * ou 0 se ainda não envia vídeo. É onde a qualidade de cada plano é aplicada.
 */
function sentFrameRateCap(page: Page) {
  return page.evaluate(() =>
    Math.max(
      0,
      ...(window.__sualivePeers ?? []).flatMap((pc) =>
        pc
          .getSenders()
          .filter((sender) => sender.track?.kind === "video")
          .flatMap((sender) =>
            sender.getParameters().encodings.map((encoding) => encoding.maxFramerate ?? 0),
          ),
      ),
    ),
  );
}

interface Person {
  context: BrowserContext;
  page: Page;
}

const people: Person[] = [];
/** Exceções não tratadas em qualquer página: o teste falha mesmo que a tela pareça certa. */
const pageErrors: string[] = [];
let personCount = 0;

/**
 * Um navegador independente; com `who`, já logado naquela conta. Nas chamadas à API cada pessoa
 * finge estar numa rede diferente (o limite por IP vale por pessoa, como em produção).
 */
async function newPerson(browser: Browser, who?: AccountName): Promise<Person> {
  personCount += 1;
  const ip = `203.0.113.${(personCount % 250) + 1}`;
  const context = await browser.newContext();
  if (who) {
    // Sem `Domain` (exigência do prefixo `__Host-`): o cookie fica só no host do Worker.
    await context.addCookies([
      {
        name: ACCOUNT_COOKIE,
        value: account(who).token,
        domain: new URL(test.info().project.use.baseURL!).hostname,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
  }
  await context.route("**/api/**", (route) =>
    route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }),
  );
  await context.addInitScript(trackPeerConnections);
  const person = { context, page: await context.newPage() };
  person.page.on("pageerror", (error) => pageErrors.push(error.message));
  people.push(person);
  return person;
}

test.afterEach(async () => {
  await Promise.all(people.splice(0).map(({ context }) => context.close()));
  expect(pageErrors.splice(0), "exceções não tratadas nas páginas").toEqual([]);
});

const handleOf = (who: AccountName) => account(who).handle!;

/** O que `/api/me` diz desta pessoa agora (com os cookies do contexto dela). */
async function me(page: Page): Promise<{ user: { handle: string | null } | null }> {
  const response = await page.request.get("/api/me");
  expect(response.ok()).toBe(true);
  return response.json();
}

async function createRoom(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: texts.home.create }).click();
  await page.waitForURL(/\/s\/[a-z0-9]{10}$/);
  return new URL(page.url()).pathname;
}

function controls(page: Page) {
  return page.getByRole("toolbar", { name: texts.controls.label });
}

function peopleList(page: Page) {
  return page.getByRole("list", { name: texts.people.label });
}

/** Linha de uma pessoa na lista de quem está na sala. */
function personRow(page: Page, nickname: string) {
  return peopleList(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(nickname, { exact: true }) });
}

/** Lobby sem conta: digita o apelido e entra. */
async function joinAsGuest(page: Page, nickname: string) {
  await page.getByLabel(texts.lobby.nicknameLabel).fill(nickname);
  await page.getByRole("button", { name: texts.lobby.join }).click();
  await expect(controls(page)).toBeVisible();
}

/** Lobby com conta: não há apelido para digitar, só "Entrando como …". */
async function joinWithAccount(page: Page, nickname: string) {
  const joiningAs = page.getByTestId("joining-as");
  await expect(joiningAs).toContainText(texts.lobby.joiningAs);
  await expect(joiningAs).toContainText(nickname);
  await expect(page.getByLabel(texts.lobby.nicknameLabel)).toHaveCount(0);
  await page.getByRole("button", { name: texts.lobby.join }).click();
  await expect(controls(page)).toBeVisible();
}

/** O vídeo de `nickname` (de outra pessoa), já com imagem chegando pela conexão direta. */
async function expectRemoteVideo(page: Page, nickname: string, kind: "camera" | "screen") {
  const video = page.locator("video").and(page.getByLabel(texts.stage.videoLabel(nickname, kind, false)));
  await expect(video).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth), { timeout: 30_000 })
    .toBeGreaterThan(0);
}

function startVideo(page: Page, kind: "camera" | "screen") {
  const name = kind === "camera" ? texts.controls.cameraOn : texts.controls.screenOn;
  return controls(page).getByRole("button", { name }).click();
}

test("visitante: entrada da conta, login, páginas legais e Plus sem cobrança", async ({ browser }) => {
  const { page } = await newPerson(browser);

  await page.goto("/");
  const create = page.getByRole("button", { name: texts.home.create });
  const homeAccount = page.getByTestId("home-account");
  await expect(homeAccount).toContainText(texts.home.account.question);
  const loginLink = homeAccount.getByRole("link", { name: texts.home.account.login, exact: true });
  // Logo abaixo do botão de criar sala.
  const [createBox, loginBox] = [await create.boundingBox(), await loginLink.boundingBox()];
  expect(loginBox!.y).toBeGreaterThan(createBox!.y + createBox!.height - 1);
  await loginLink.click();
  await expect(page).toHaveURL(/\/entrar$/);

  await expect(page.getByRole("heading", { name: texts.login.title })).toBeVisible();
  const google = page.getByRole("link", { name: texts.login.providers.google });
  await expect(google).toHaveAttribute("href", "/api/auth/google/start");
  // O Discord não está configurado: o botão aparece desligado, sem endereço, com "Em breve".
  const discord = page.getByRole("link", { name: texts.login.providers.discord });
  await expect(discord).toBeVisible();
  await expect(discord).toBeDisabled();
  await expect(discord).not.toHaveAttribute("href");
  await expect(discord).toContainText(texts.login.soon);

  await page.goto("/termos");
  await expect(page.getByRole("heading", { name: texts.legal.terms.title, level: 1 })).toBeVisible();
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { name: texts.legal.privacy.title, level: 1 })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Nós não guardamos o CPF");

  await page.goto("/plus");
  await expect(page.getByRole("heading", { name: texts.plus.title, level: 1 })).toBeVisible();
  await expect(page.getByTestId("payments-note")).toHaveText(texts.plus.paymentsNote);
  for (const name of [texts.plus.cycles.monthly.choose, texts.plus.cycles.annual.choose]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
});

test("conta nova: o primeiro acesso vem antes de tudo e devolve ao destino", async ({ browser }) => {
  const host = await newPerson(browser);
  const roomPath = await createRoom(host.page);

  const { page } = await newPerson(browser, "newcomer");
  await page.goto("/perfil");
  await expect(page).toHaveURL(/\/boas-vindas\?returnTo=%2Fperfil$/);

  await page.goto(roomPath);
  await expect(page).toHaveURL(`/boas-vindas?returnTo=${encodeURIComponent(roomPath)}`);
  await expect(page.getByRole("heading", { name: texts.onboarding.title })).toBeVisible();

  // Um único aceite: maior de 18 anos, Termos de Uso e Políticas de Privacidade.
  const consent = page.getByRole("checkbox");
  await expect(consent).toHaveCount(1);
  const { before, terms, and, privacy, after } = texts.onboarding.consent;
  await expect(consent).toHaveAccessibleName(`${before}${terms}${and}${privacy}${after}`);

  const handle = page.getByLabel(texts.handle.label);
  const handleStatus = page.locator("[data-status]");
  // A regra só aparece como erro, embaixo do campo, enquanto o que foi digitado não a cumpre.
  await expect(page.getByText(texts.handle.invalid)).toHaveCount(0);
  await handle.fill("a-b");
  await expect(page.getByRole("alert").filter({ hasText: texts.handle.invalid })).toBeVisible();
  await handle.fill("admin");
  await expect(handleStatus).toHaveText(texts.handle.reserved);

  // Sem o aceite, nada é enviado.
  await handle.fill("e2e_nova");
  await expect(handleStatus).toHaveText(texts.handle.available);
  await page.getByRole("button", { name: texts.onboarding.submit }).click();
  await expect(page.getByText(texts.onboarding.consentRequired)).toBeVisible();
  await expect(page).toHaveURL(/\/boas-vindas/);

  await consent.check();
  await page.getByRole("button", { name: texts.onboarding.submit }).click();
  await expect(page).toHaveURL(roomPath);
  await joinWithAccount(page, account("newcomer").nickname);
  await joinAsGuest(host.page, "Ana");
  await expect(personRow(host.page, account("newcomer").nickname)).toContainText(
    texts.handle.display("e2e_nova"),
  );

  await page.goto("/perfil");
  await expect(page.getByTestId("profile-nickname")).toHaveText(account("newcomer").nickname);
  await expect(page.getByText(texts.handle.display("e2e_nova"), { exact: true })).toBeVisible();
});

test(`conta gratuita: apelido do perfil na sala de um visitante, com ${VIDEOS_PER_PERSON} vídeos`, async ({
  browser,
}) => {
  const nickname = "Gil Editado";
  const member = await newPerson(browser, "free");
  await member.page.goto("/perfil");
  const nicknameField = member.page.getByLabel(texts.profile.nicknameLabel);
  await expect(nicknameField).toHaveValue(account("free").nickname);
  await nicknameField.fill(nickname);
  await member.page.getByRole("button", { name: texts.common.save, exact: true }).click();
  await expect(member.page.getByText(texts.common.saved, { exact: true })).toBeVisible();
  await expect(member.page.getByTestId("profile-nickname")).toHaveText(nickname);

  const guest = await newPerson(browser);
  const roomPath = await createRoom(guest.page);
  await joinAsGuest(guest.page, "Ana");

  await member.page.goto(roomPath);
  await joinWithAccount(member.page, nickname);

  const row = personRow(guest.page, nickname);
  await expect(row).toContainText(texts.handle.display(handleOf("free")));
  await expect(row.getByRole("img", { name: texts.badges.plus.name })).toHaveCount(0);

  await startVideo(member.page, "camera");
  await expect(controls(member.page).getByRole("button", { name: texts.controls.cameraOff })).toBeVisible();
  await expectRemoteVideo(guest.page, nickname, "camera");

  // Sem Plus, câmera e tela juntas (o limite por pessoa fica com os testes da API).
  expect(VIDEOS_PER_PERSON).toBeGreaterThanOrEqual(2);
  await startVideo(member.page, "screen");
  await expect(controls(member.page).getByRole("button", { name: texts.controls.screenOff })).toBeVisible();
  await expectRemoteVideo(guest.page, nickname, "screen");
  await expect(member.page.getByText(texts.notices.videoPersonLimit)).toHaveCount(0);
});

test("assinante: selo de Plus e qualidade do Plus; quem não tem Plus transmite na gratuita", async ({
  browser,
}) => {
  const guest = await newPerson(browser);
  const roomPath = await createRoom(guest.page);
  await joinAsGuest(guest.page, "Ana");

  const plus = account("plus");
  const subscriber = await newPerson(browser, "plus");
  await subscriber.page.goto(roomPath);
  await joinWithAccount(subscriber.page, plus.nickname);

  const row = personRow(guest.page, plus.nickname);
  await expect(row.getByRole("img", { name: texts.badges.plus.name })).toBeVisible();
  await expect(row).toContainText(texts.handle.display(plus.handle!));

  await startVideo(subscriber.page, "camera");
  await expect(
    controls(subscriber.page).getByRole("button", { name: texts.controls.cameraOff }),
  ).toBeVisible();
  await startVideo(subscriber.page, "screen");
  await expect(
    controls(subscriber.page).getByRole("button", { name: texts.controls.screenOff }),
  ).toBeVisible();
  await expectRemoteVideo(guest.page, plus.nickname, "camera");
  await expectRemoteVideo(guest.page, plus.nickname, "screen");

  await startVideo(guest.page, "camera");
  await expect(controls(guest.page).getByRole("button", { name: texts.controls.cameraOff })).toBeVisible();
  await expectRemoteVideo(subscriber.page, "Ana", "camera");
  await startVideo(guest.page, "screen");
  await expect(controls(guest.page).getByRole("button", { name: texts.controls.screenOff })).toBeVisible();
  await expectRemoteVideo(subscriber.page, "Ana", "screen");

  // Qualidade de envio de cada um: a do Plus para quem assina, a gratuita para quem não.
  await expect.poll(() => sentFrameRateCap(subscriber.page)).toBe(PLUS_VIDEO_QUALITY.frameRate);
  await expect.poll(() => sentFrameRateCap(guest.page)).toBe(FREE_VIDEO_QUALITY.frameRate);
});

test("assinante: link fixo com dono reconhecido, tema para todos e sala que não expira", async ({
  browser,
  request,
}) => {
  const plus = account("plus");
  const fixedPath = `/@${plus.handle}`;
  const owner = await newPerson(browser, "plus");
  await owner.page.goto(fixedPath);
  await joinWithAccount(owner.page, plus.nickname);
  await expect(owner.page.getByTestId("room-code")).toContainText(texts.handle.display(plus.handle!));
  // Dono sem token de dono: a conta basta.
  await expect(personRow(owner.page, plus.nickname)).toContainText(texts.people.owner);
  await expect(owner.page.getByRole("button", { name: texts.room.roomTheme.open })).toBeVisible();

  const guest = await newPerson(browser);
  await guest.page.goto(fixedPath);
  await joinAsGuest(guest.page, "Bia");
  await expect(guest.page.getByRole("button", { name: texts.room.roomTheme.open })).toHaveCount(0);
  await expect(
    peopleList(owner.page).getByRole("button", { name: texts.people.moderate("Bia") }),
  ).toBeVisible();

  await owner.page.getByRole("button", { name: texts.room.roomTheme.open }).click();
  await owner.page
    .getByRole("group", { name: texts.room.roomTheme.label })
    .getByRole("button", { name: texts.room.roomTheme.names.ocean })
    .click();
  await expect(guest.page.locator("html")).toHaveAttribute("data-room-theme", "ocean");
  await expect(owner.page.locator("html")).toHaveAttribute("data-room-theme", "ocean");
  // Quem chega depois também recebe o tema escolhido.
  const late = await newPerson(browser);
  await late.page.goto(fixedPath);
  await joinAsGuest(late.page, "Caio");
  await expect(late.page.locator("html")).toHaveAttribute("data-room-theme", "ocean");

  // Todos saem: a sala de link fixo continua aberta.
  for (const { page } of [late, guest, owner]) {
    // Sair pede confirmação antes.
    await page.getByRole("button", { name: texts.controls.leave }).click();
    await page
      .getByTestId("leave-confirm")
      .getByRole("button", { name: texts.controls.leaveConfirm.confirm, exact: true })
      .click();
    await expect(page).toHaveURL("/");
  }
  await expect
    .poll(async () => (await request.get(`/api/rooms/@${plus.handle}`)).json())
    .toEqual(expect.objectContaining({ status: "open", fixed: true, participants: 0 }));

  // O link fixo de quem não é Plus não abre.
  await guest.page.goto(`/@${handleOf("free")}`);
  await expect(guest.page.getByRole("heading", { name: texts.roomEnd.ended.title })).toBeVisible();
});

test("excluir a conta pelo perfil desloga e apaga a conta", async ({ browser }) => {
  const { page } = await newPerson(browser, "deleter");
  const handle = handleOf("deleter");
  await page.goto("/perfil");
  await expect(page.getByText(texts.handle.display(handle), { exact: true })).toBeVisible();

  await page.getByRole("button", { name: texts.profile.deleteStart }).click();
  const confirm = page.getByRole("button", { name: texts.profile.deleteConfirm });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(texts.profile.deleteConfirmLabel(handle)).fill(`@${handle}`);
  await confirm.click();

  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("home-account")).toContainText(texts.home.account.question);
  expect((await me(page)).user).toBeNull();
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === ACCOUNT_COOKIE)).toBeUndefined();
});

test("sair da conta volta ao início como visitante", async ({ browser }) => {
  const { page } = await newPerson(browser, "leaver");
  await page.goto("/perfil");
  await expect(page.getByTestId("profile-nickname")).toHaveText(account("leaver").nickname);

  await page.getByRole("button", { name: texts.profile.logout }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("home-account")).toContainText(texts.home.account.question);
  expect((await me(page)).user).toBeNull();

  await page.goto("/perfil");
  await expect(page).toHaveURL(/\/entrar\?returnTo=%2Fperfil$/);
});

// ---------- Pré-entrega 3: faixa de aviso de termos ----------

function termsBanner(page: Page) {
  return page.getByRole("region", { name: texts.termsBanner.label });
}

test("termos mudaram: a faixa aparece para a conta, fecha no x e não volta", async ({ browser }) => {
  const { page } = await newPerson(browser, "termsCloser");
  await page.goto("/perfil");
  await expect(termsBanner(page)).toBeVisible();
  await expect(termsBanner(page)).toContainText(texts.termsBanner.link);

  await termsBanner(page).getByRole("button", { name: texts.termsBanner.close }).click();
  await expect(termsBanner(page)).toHaveCount(0);

  // O servidor gravou a versão vista: recarregar não traz a faixa de volta.
  await expect
    .poll(async () => ((await me(page)).user as { termsUpdate?: string | null } | null)?.termsUpdate)
    .toBeNull();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(termsBanner(page)).toHaveCount(0);
});

test("termos mudaram: abrir o link leva aos Termos de Uso e a faixa some", async ({ browser }) => {
  const { page } = await newPerson(browser, "termsReader");
  await page.goto("/");
  await termsBanner(page).getByRole("link", { name: texts.termsBanner.link }).click();
  await expect(page.getByRole("heading", { name: texts.legal.terms.title, level: 1 })).toBeVisible();
  await expect(termsBanner(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: texts.legal.terms.title, level: 1 })).toBeVisible();
  await expect(termsBanner(page)).toHaveCount(0);
});

test("sem conta e com os termos em dia não há faixa", async ({ browser }) => {
  const guest = await newPerson(browser);
  await guest.page.goto("/");
  await expect(guest.page.getByRole("button", { name: texts.home.create })).toBeVisible();
  await expect(termsBanner(guest.page)).toHaveCount(0);

  const current = await newPerson(browser, "free");
  await current.page.goto("/perfil");
  await expect(current.page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(termsBanner(current.page)).toHaveCount(0);
});

// ---------- Entrega 3: carteira, loja e presentes ----------

/** Saldos que `/api/wallet` devolve para esta pessoa agora. */
async function walletOf(page: Page): Promise<{ silver: number; gold: number; goldSentToday: number }> {
  const response = await page.request.get("/api/wallet");
  expect(response.ok()).toBe(true);
  return response.json();
}

test("ouro enviado na sala: sai de quem envia, chega a quem recebe e a sala inteira vê o aviso", async ({
  browser,
}) => {
  const giver = await newPerson(browser, "roomGiver");
  const receiver = await newPerson(browser, "roomReceiver");
  const guest = await newPerson(browser);
  const room = await createRoom(giver.page);
  await joinWithAccount(giver.page, account("roomGiver").nickname);
  await receiver.page.goto(room);
  await joinWithAccount(receiver.page, account("roomReceiver").nickname);
  await guest.page.goto(room);
  await joinAsGuest(guest.page, "Visita");

  const to = account("roomReceiver").nickname;
  const from = account("roomGiver").nickname;
  await expect(personRow(giver.page, to)).toBeVisible();

  // Quem não tem conta não envia nem recebe.
  await expect(guest.page.getByRole("button", { name: texts.gifts.send(to) })).toHaveCount(0);
  await expect(giver.page.getByRole("button", { name: texts.gifts.send("Visita") })).toHaveCount(0);

  await giver.page.getByRole("button", { name: texts.gifts.send(to) }).click();
  await giver.page.getByLabel(texts.gifts.amountLabel).fill("250");
  await giver.page.getByRole("button", { name: texts.gifts.next }).click();
  await expect(giver.page.getByText(texts.gifts.confirmQuestion("250", to))).toBeVisible();
  await giver.page.getByRole("button", { name: texts.gifts.confirm }).click();

  const notice = texts.gifts.notice(from, "250", to);
  for (const { page } of [giver, receiver, guest]) {
    await expect(page.getByTestId("gift-notices")).toContainText(notice);
  }
  expect(await walletOf(giver.page)).toMatchObject({ gold: 750, goldSentToday: 250 });
  expect(await walletOf(receiver.page)).toMatchObject({ gold: 250 });

  // Mais do que o saldo: recusado, e nada muda.
  await giver.page.getByRole("button", { name: texts.gifts.send(to) }).click();
  await giver.page.getByLabel(texts.gifts.amountLabel).fill("900");
  await giver.page.getByRole("button", { name: texts.gifts.next }).click();
  await giver.page.getByRole("button", { name: texts.gifts.confirm }).click();
  await expect(giver.page.getByRole("alert")).toContainText(texts.gifts.errors.insufficient_funds);
  expect(await walletOf(giver.page)).toMatchObject({ gold: 750, goldSentToday: 250 });
});

interface ShopEntry {
  id: string;
  price: number;
  owned: boolean;
  equipped: boolean;
}

async function shopItem(page: Page, id: string): Promise<ShopEntry | undefined> {
  const response = await page.request.get("/api/shop");
  expect(response.ok()).toBe(true);
  const { items } = (await response.json()) as { items: ShopEntry[] };
  return items.find((item) => item.id === id);
}

test("loja: compra com prata e com ouro, equipa, e a sala mostra o nome colorido", async ({ browser }) => {
  const shopper = await newPerson(browser, "shopper");
  const { page } = shopper;
  await page.goto("/");
  await page.getByRole("link", { name: texts.nav.shop, exact: true }).click();
  await expect(page.getByRole("heading", { name: texts.shop.title, level: 1 })).toBeVisible();

  // Preços do catálogo (cor 70, moldura e degradê 200 desde a migration 0006), lidos da API.
  const priceOf = async (id: string) => (await shopItem(page, id))!.price;
  const [redPrice, framePrice, gradientPrice] = [
    await priceOf("color_red"),
    await priceOf("frame_sky"),
    await priceOf("gradient_ocean"),
  ];
  const seed = account("shopper");
  const silver = seed.silver! - redPrice;
  const gold = seed.gold! - framePrice;
  // A conta da fumaça só faz sentido se a prata pagar a cor e não pagar o degradê depois dela.
  expect(silver).toBeGreaterThanOrEqual(0);
  expect(silver).toBeLessThan(gradientPrice);
  expect(gold).toBeGreaterThanOrEqual(0);

  // Cor paga com prata.
  const red = page.getByTestId("shop-item-color_red");
  await red.getByRole("button", { name: texts.shop.buyLabel("Vermelho") }).click();
  await red.getByRole("button", { name: texts.shop.payWith.silver }).click();
  await expect(red).toHaveAttribute("data-owned", "true");
  expect(await walletOf(page)).toMatchObject({ silver, gold: seed.gold });

  // Moldura paga com ouro.
  const frame = page.getByTestId("shop-item-frame_sky");
  await frame.getByRole("button", { name: texts.shop.buyLabel("Céu") }).click();
  await frame.getByRole("button", { name: texts.shop.payWith.gold }).click();
  await expect(frame).toHaveAttribute("data-owned", "true");
  expect(await walletOf(page)).toMatchObject({ silver, gold });

  // Degradê com a prata que sobrou: recusado, e nada é entregue.
  const gradient = page.getByTestId("shop-item-gradient_ocean");
  await gradient.getByRole("button", { name: texts.shop.buyLabel("Oceano") }).click();
  await gradient.getByRole("button", { name: texts.shop.payWith.silver }).click();
  await expect(gradient.getByRole("alert")).toContainText(texts.wallet.errors.insufficientFunds);
  expect((await shopItem(page, "gradient_ocean"))?.owned).toBe(false);
  expect(await walletOf(page)).toMatchObject({ silver, gold });

  await red.getByRole("button", { name: texts.shop.equipLabel("Vermelho") }).click();
  await expect(red).toHaveAttribute("data-equipped", "true");
  await frame.getByRole("button", { name: texts.shop.equipLabel("Céu") }).click();
  await expect(frame).toHaveAttribute("data-equipped", "true");

  // Na sala, todos veem o nome na cor e o avatar com a moldura.
  const guest = await newPerson(browser);
  const room = await createRoom(guest.page);
  await joinAsGuest(guest.page, "Visita");
  await page.goto(room);
  await joinWithAccount(page, account("shopper").nickname);
  for (const viewer of [guest.page, page]) {
    const row = personRow(viewer, account("shopper").nickname);
    await expect(row.locator('[data-cosmetic="name"]')).toHaveText(account("shopper").nickname);
    await expect(row.locator('[data-cosmetic="frame"]')).toBeVisible();
  }
  await expect(personRow(page, "Visita").locator("[data-cosmetic]")).toHaveCount(0);
});

test("carteira: saldos e extrato, envio de ouro por @nome com limite diário", async ({ browser }) => {
  const giver = await newPerson(browser, "giver");
  const receiver = await newPerson(browser, "receiver");
  const { page } = giver;
  const to = handleOf("receiver");

  await page.goto("/carteira");
  await expect(page.getByRole("heading", { name: texts.wallet.title, level: 1 })).toBeVisible();
  await expect(page.getByTestId("balance-gold")).toContainText("2.400");
  await expect(page.getByTestId("balance-silver")).toContainText("300");
  await expect(page.getByTestId("wallet-notice")).toBeVisible();
  // Sem a Woovi neste ambiente, a compra de ouro fica indisponível (nada é creditado sem ela).
  await expect(page.getByTestId("gold-unavailable")).toBeVisible();

  const send = page.getByTestId("send-gold");
  async function sendGold(handle: string, amount: string) {
    await send.getByLabel(texts.wallet.send.handleLabel).fill(handle);
    await send.getByLabel(texts.wallet.send.amountLabel).fill(amount);
    await send.getByRole("button", { name: texts.wallet.send.submit }).click();
    await send.getByRole("button", { name: texts.wallet.send.confirm }).click();
  }

  // @nome com "@" e maiúsculas chega certo.
  await sendGold(`@${to.toUpperCase()}`, "1500");
  await expect.poll(async () => (await walletOf(receiver.page)).gold).toBe(1500);
  const left = account("giver").gold! - 1500;
  expect(await walletOf(page)).toMatchObject({ gold: left, goldSentToday: 1500 });

  // 1.500 + 600 passaria de 2.000 no dia (o saldo cobriria): recusado.
  expect(left).toBeGreaterThanOrEqual(600);
  await sendGold(to, "600");
  await expect(send.getByRole("alert")).toContainText(texts.wallet.errors.dailyLimit);
  expect(await walletOf(page)).toMatchObject({ gold: left, goldSentToday: 1500 });
  expect((await walletOf(receiver.page)).gold).toBe(1500);

  // Presente de Plus com menos ouro do que ele custa: recusado, e quem receberia continua sem Plus.
  expect(left).toBeLessThan(PLUS_GIFT_PRICE_GOLD);
  const gift = page.getByTestId("gift-plus");
  await gift.getByLabel(texts.wallet.giftPlus.handleLabel).fill(to);
  await gift.getByRole("button", { name: texts.wallet.giftPlus.submit }).click();
  await gift.getByRole("button", { name: texts.wallet.giftPlus.confirm }).click();
  await expect(gift.getByRole("alert")).toContainText(texts.wallet.errors.insufficientFunds);
  const receiverUser = (await me(receiver.page)).user as unknown as { plan: { plus: boolean } };
  expect(receiverUser.plan.plus).toBe(false);

  // O extrato de quem recebeu mostra o ouro e de quem veio.
  await receiver.page.goto("/carteira");
  const entries = receiver.page.getByTestId("ledger-entry");
  await expect(entries.filter({ hasText: `@${handleOf("giver")}` })).toHaveCount(1);
});

test(`presente de Plus: debita ${PLUS_GIFT_PRICE_GOLD} de ouro e dá ${PLUS_GIFT_DAYS} dias de Plus a outra conta`, async ({
  browser,
}) => {
  const giver = await newPerson(browser, "plusGiver");
  const receiver = await newPerson(browser, "plusReceiver");
  await giver.page.goto("/carteira");
  const gift = giver.page.getByTestId("gift-plus");
  await gift.getByLabel(texts.wallet.giftPlus.handleLabel).fill(handleOf("plusReceiver"));
  await gift.getByRole("button", { name: texts.wallet.giftPlus.submit }).click();
  await gift.getByRole("button", { name: texts.wallet.giftPlus.confirm }).click();
  await expect(giver.page.getByText(texts.wallet.giftPlus.done(handleOf("plusReceiver")))).toBeVisible();
  expect(await walletOf(giver.page)).toMatchObject({
    gold: account("plusGiver").gold! - PLUS_GIFT_PRICE_GOLD,
    goldSentToday: 0,
  });

  const user = (await me(receiver.page)).user as unknown as {
    plan: { plus: boolean; cycle: string | null; renews: boolean };
    badges: string[];
  };
  expect(user.plan).toMatchObject({ plus: true, cycle: "gift", renews: false });
  expect(user.badges).toEqual(["plus"]);
  // Plus de presente não rende ouro.
  expect((await walletOf(receiver.page)).gold).toBe(0);
});

// ---------- Entrega 4: sala protegida, franquia em horas e Plus novo ----------

test("sala protegida: o assinante vê preço e horas do saldo; sem retransmissão no ambiente, não cria", async ({
  browser,
}) => {
  const { page } = await newPerson(browser, "protector");
  await page.goto("/");
  await page.getByTestId("protected-room-open").click();
  const panel = page.getByTestId("protected-room-panel");
  await expect(panel.getByTestId("protected-room-price")).toContainText(String(PROTECTED_ROOM_GOLD_PER_HOUR));
  // 2 × o preço por hora de saldo: cobre 2 horas.
  await expect(panel.getByTestId("protected-room-balance")).toContainText("2 h");
  await panel.getByTestId("protected-room-confirm").click();
  // O simulador roda sem a chave de retransmissão: a sala protegida nunca abre como sala direta.
  await expect(page.getByRole("alert")).toContainText(texts.home.errors.protectedUnavailable);
  await expect(page).toHaveURL(/\/$/);
  expect(await walletOf(page)).toMatchObject({ gold: PROTECTED_ROOM_GOLD_PER_HOUR * 2 });

  // A carteira mostra o mesmo ouro em tempo de sala protegida.
  await page.goto("/carteira");
  await expect(page.getByTestId("gold-protected-time")).toContainText("2 h");

  // No plano, o link fixo pode abrir como sala protegida (a sala está vazia).
  await page.goto("/plano");
  const fixed = page.getByTestId("fixed-room-protected");
  await expect(fixed).toHaveAttribute("data-state", "off");
  await fixed.getByTestId("fixed-room-protected-toggle").click();
  await expect(fixed).toHaveAttribute("data-state", "on");
  const user = (await me(page)).user as unknown as { fixedRoomProtected: boolean };
  expect(user.fixedRoomProtected).toBe(true);
});

test("quem não é Plus não cria sala protegida; a sala comum continua a um clique", async ({ browser }) => {
  const free = await newPerson(browser, "free");
  await free.page.goto("/");
  await expect(free.page.getByTestId("protected-room-open")).toHaveCount(0);
  await expect(free.page.getByTestId("protected-room-plus-only")).toBeVisible();
  // Direto na API também não: o servidor decide.
  const refused = await free.page.request.post("/api/rooms", {
    data: { turnstileToken: "XXXX.DUMMY.TOKEN.XXXX", protected: true },
    headers: { Origin: new URL(free.page.url()).origin },
  });
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toEqual({ error: "plus_required" });

  const guest = await newPerson(browser);
  await guest.page.goto("/");
  await expect(guest.page.getByTestId("protected-room-open")).toHaveCount(0);
  await createRoom(guest.page);
  await joinAsGuest(guest.page, "Visita");
});
