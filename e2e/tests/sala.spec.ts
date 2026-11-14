import { AUTO_WATCH_MAX_PEOPLE, ROOM_MAX_PEOPLE } from "@sualive/config";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { texts } from "../../apps/web/src/texts";

/**
 * Fumaça da sala direta: navegadores independentes (contextos com cookies separados), câmera e
 * microfone falsos, contra o produto real no simulador do Wrangler.
 */

declare global {
  interface Window {
    /** Conexões WebRTC criadas pela página (anotadas pelo teste). */
    __sualivePeers?: RTCPeerConnection[];
  }
}

/** Roda na página antes do app: guarda cada RTCPeerConnection para o teste ler o estado. */
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

interface Person {
  context: BrowserContext;
  page: Page;
}

const people: Person[] = [];
/** Exceções não tratadas em qualquer página: o teste falha mesmo que a tela pareça certa. */
const pageErrors: string[] = [];

let personCount = 0;

/**
 * Um navegador independente (contexto com cookies próprios). Nas chamadas à API cada um finge
 * estar numa rede diferente (o simulador do Wrangler respeita o `CF-Connecting-IP` recebido): o
 * limite de requisições por IP vale por pessoa, como em produção, e não por máquina.
 */
async function newPerson(browser: Browser): Promise<Person> {
  personCount += 1;
  const ip = `198.51.100.${(personCount % 250) + 1}`;
  const context = await browser.newContext();
  // Só nas chamadas à API (cabeçalho extra em todas as requisições quebraria o CORS do Turnstile).
  // O WebSocket não passa por aqui e chega com o IP real da máquina.
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

/** Abre o início, cria a sala e devolve o link para onde a página foi levada. */
async function createRoom(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: texts.home.create }).click();
  await page.waitForURL(/\/s\/[a-z0-9]{10}$/);
  return page.url();
}

function controls(page: Page) {
  return page.getByRole("toolbar", { name: texts.controls.label });
}

/** No lobby: escolhe o apelido e entra (o Turnstile de teste passa sozinho). */
async function join(page: Page, nickname: string) {
  await page.getByLabel(texts.lobby.nicknameLabel).fill(nickname);
  await page.getByRole("button", { name: texts.lobby.join }).click();
  await expect(controls(page)).toBeVisible();
}

/**
 * Tenta entrar e espera a tela de recusa. A recusa pode vir já ao abrir o link ou só ao pedir
 * para entrar; as duas valem.
 */
async function expectRefused(page: Page, nickname: string, title: string) {
  const field = page.getByLabel(texts.lobby.nicknameLabel);
  const refused = page.getByRole("heading", { name: title });
  await expect(field.or(refused)).toBeVisible();
  if (await field.isVisible()) {
    await field.fill(nickname);
    await page.getByRole("button", { name: texts.lobby.join }).click();
  }
  await expect(refused).toBeVisible();
  await expect(controls(page)).toHaveCount(0);
}

function peopleList(page: Page) {
  return page.getByRole("list", { name: texts.people.label });
}

function chatLog(page: Page) {
  return page.getByRole("log", { name: texts.chat.label });
}

async function sendChat(page: Page, text: string) {
  await page.getByLabel(texts.chat.inputLabel, { exact: true }).fill(text);
  await page.getByRole("button", { name: texts.chat.send }).click();
}

/** A cria a sala e entra; B abre o link e entra. */
async function twoInRoom(browser: Browser) {
  const a = await newPerson(browser);
  const link = await createRoom(a.page);
  await join(a.page, "Ana");
  const b = await newPerson(browser);
  await b.page.goto(link);
  await join(b.page, "Bia");
  for (const { page } of [a, b]) {
    await expect(peopleList(page).getByText("Ana", { exact: true })).toBeVisible();
    await expect(peopleList(page).getByText("Bia", { exact: true })).toBeVisible();
  }
  return { a, b, link };
}

function connectedPeers(page: Page) {
  return page.evaluate(
    () => (window.__sualivePeers ?? []).filter((pc) => pc.connectionState === "connected").length,
  );
}

test("dois navegadores entram na sala, se veem e trocam mensagens", async ({ browser }) => {
  const { a, b } = await twoInRoom(browser);

  await sendChat(a.page, "Oi, Bia!");
  await expect(chatLog(b.page)).toContainText("Oi, Bia!");

  await sendChat(b.page, "Oi, Ana! Tudo certo?");
  await expect(chatLog(a.page)).toContainText("Oi, Ana! Tudo certo?");
});

test("a câmera de A chega a B pela conexão direta", async ({ browser }) => {
  const { a, b } = await twoInRoom(browser);

  await expect.poll(() => connectedPeers(a.page), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => connectedPeers(b.page), { timeout: 30_000 }).toBeGreaterThan(0);

  await controls(a.page).getByRole("button", { name: texts.controls.cameraOn }).click();
  await expect(controls(a.page).getByRole("button", { name: texts.controls.cameraOff })).toBeVisible();

  const remote = b.page
    .locator("video")
    .and(b.page.getByLabel(texts.stage.videoLabel("Ana", "camera", false)));
  await expect(remote).toBeVisible();
  await expect
    .poll(() => remote.evaluate((video: HTMLVideoElement) => video.videoWidth), { timeout: 30_000 })
    .toBeGreaterThan(0);
});

test("o dono remove e bane, e o banido não volta pelo mesmo navegador", async ({ browser }) => {
  const { a, b } = await twoInRoom(browser);

  async function moderate(action: "kick" | "ban") {
    await peopleList(a.page)
      .getByRole("button", { name: texts.people.moderate("Bia") })
      .click();
    await peopleList(a.page).getByRole("button", { name: texts.people[action], exact: true }).click();
    const confirmLabel = action === "kick" ? texts.people.confirmKickAction : texts.people.confirmBanAction;
    await peopleList(a.page)
      .getByRole("group", { name: texts.people[action] })
      .getByRole("button", { name: confirmLabel, exact: true })
      .click();
  }

  await moderate("kick");
  await expect(b.page.getByRole("heading", { name: texts.roomEnd.kicked.title })).toBeVisible();
  await expect(peopleList(a.page).getByText("Bia", { exact: true })).toHaveCount(0);

  // Removido pode voltar pelo link.
  await b.page.getByRole("button", { name: texts.roomEnd.kicked.action }).click();
  await join(b.page, "Bia");
  await expect(peopleList(a.page).getByText("Bia", { exact: true })).toBeVisible();

  await moderate("ban");
  await expect(b.page.getByRole("heading", { name: texts.roomEnd.banned.title })).toBeVisible();
  await expect(peopleList(a.page).getByText("Bia", { exact: true })).toHaveCount(0);

  // Banido: recarregar e tentar entrar de novo termina na mesma tela.
  await b.page.reload();
  await expectRefused(b.page, "Bia", texts.roomEnd.banned.title);

  // A sala segue normal para quem ficou.
  await sendChat(a.page, "Ainda aqui");
  await expect(chatLog(a.page)).toContainText("Ainda aqui");
});

test("segunda aba derruba a primeira, que mostra a mensagem própria e volta com 'Usar esta aba'", async ({
  browser,
}) => {
  const { a, b } = await twoInRoom(browser);

  // A mesma pessoa (mesmos cookies) abre a sala em outra aba e entra.
  const secondTab = await b.context.newPage();
  secondTab.on("pageerror", (error) => pageErrors.push(error.message));
  await secondTab.goto(b.page.url());
  await join(secondTab, "Bia");

  const replaced = texts.roomEnd.replaced;
  await expect(b.page.getByRole("heading", { name: replaced.title })).toBeVisible();
  await expect(b.page.getByRole("heading", { name: texts.roomEnd.error.title })).toHaveCount(0);
  // Continua sendo uma pessoa só na sala.
  await expect(peopleList(a.page).getByRole("listitem")).toHaveCount(2);

  // "Usar esta aba" traz a sala de volta à primeira aba, sem passar pelo lobby, e derruba a outra.
  await b.page.getByRole("button", { name: replaced.action }).click();
  await expect(controls(b.page)).toBeVisible();
  await expect(secondTab.getByRole("heading", { name: replaced.title })).toBeVisible();
  await expect(peopleList(a.page).getByRole("listitem")).toHaveCount(2);

  await sendChat(b.page, "Voltei nesta aba");
  await expect(chatLog(a.page)).toContainText("Voltei nesta aba");
});

test("link de sala inexistente diz que a sala acabou e tem prévia para mensageiros", async ({
  browser,
  request,
}) => {
  const html = await (await request.get("/s/aaaaaaaaaa")).text();
  expect(html).toContain('property="og:title"');
  expect(html).toContain('property="og:image"');

  const { page } = await newPerson(browser);
  await page.goto("/s/aaaaaaaaaa");
  await expect(page.getByRole("heading", { name: texts.roomEnd.ended.title })).toBeVisible();
});

test(`a sala aceita ${ROOM_MAX_PEOPLE} pessoas e recusa a seguinte`, async ({ browser }) => {
  // Cerca de 25 s por pessoa que entra.
  test.setTimeout(25_000 * (ROOM_MAX_PEOPLE + 1));
  const owner = await newPerson(browser);
  const link = await createRoom(owner.page);
  await join(owner.page, "Pessoa 1");

  for (let index = 2; index <= ROOM_MAX_PEOPLE; index += 1) {
    const guest = await newPerson(browser);
    await guest.page.goto(link);
    await join(guest.page, `Pessoa ${index}`);
  }
  await expect(peopleList(owner.page).getByRole("listitem")).toHaveCount(ROOM_MAX_PEOPLE);

  const extra = await newPerson(browser);
  await extra.page.goto(link);
  await expectRefused(extra.page, `Pessoa ${ROOM_MAX_PEOPLE + 1}`, texts.roomEnd.full.title);
});

// ---------- Entrega 4: vídeo sob demanda e moderador ----------

/** O vídeo da câmera de `nickname` na página de outra pessoa. */
function remoteCamera(page: Page, nickname: string) {
  return page.locator("video").and(page.getByLabel(texts.stage.videoLabel(nickname, "camera", false)));
}

test("com 7 pessoas o vídeo vira cartão: só quem clica em Assistir recebe, e parar deixa de receber", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const people = AUTO_WATCH_MAX_PEOPLE + 1;
  const owner = await newPerson(browser);
  const link = await createRoom(owner.page);
  await join(owner.page, "Ana");
  const guests: Person[] = [];
  for (let index = 2; index <= people; index += 1) {
    const guest = await newPerson(browser);
    await guest.page.goto(link);
    await join(guest.page, `Pessoa ${index}`);
    guests.push(guest);
  }
  await expect(peopleList(owner.page).getByRole("listitem")).toHaveCount(people);
  const [watcher, bystander] = guests as [Person, Person];

  await controls(owner.page).getByRole("button", { name: texts.controls.cameraOn }).click();
  await expect(controls(owner.page).getByRole("button", { name: texts.controls.cameraOff })).toBeVisible();

  // Anunciado para todos como cartão; ninguém recebe o vídeo sozinho.
  for (const { page } of [watcher, bystander]) {
    await expect(page.getByTestId("watch-card")).toHaveCount(1);
    await expect(remoteCamera(page, "Ana")).toHaveCount(0);
  }

  await watcher.page.getByTestId("watch-video").click();
  const video = remoteCamera(watcher.page, "Ana");
  await expect(video).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth), { timeout: 30_000 })
    .toBeGreaterThan(0);
  // Quem não clicou continua só com o cartão.
  await expect(remoteCamera(bystander.page, "Ana")).toHaveCount(0);
  await expect(bystander.page.getByTestId("watch-card")).toHaveCount(1);

  // Parar de assistir: o vídeo some e o cartão volta.
  await watcher.page.getByTestId("unwatch-video").click();
  await expect(remoteCamera(watcher.page, "Ana")).toHaveCount(0);
  await expect(watcher.page.getByTestId("watch-card")).toHaveCount(1);
});

test("moderador: o dono promove, o moderador remove um participante comum e não age sobre o dono", async ({
  browser,
}) => {
  const { a, b, link } = await twoInRoom(browser);
  const c = await newPerson(browser);
  await c.page.goto(link);
  await join(c.page, "Caio");
  await expect(peopleList(a.page).getByText("Caio", { exact: true })).toBeVisible();

  // Antes de ser promovida, Bia não modera ninguém.
  await expect(peopleList(b.page).getByRole("button", { name: texts.people.moderate("Caio") })).toHaveCount(
    0,
  );

  await peopleList(a.page)
    .getByRole("button", { name: texts.people.moderate("Bia") })
    .click();
  await peopleList(a.page).getByTestId("set-moderator").click();
  for (const { page } of [a, b, c]) {
    await expect(peopleList(page).getByTestId("moderator-badge")).toHaveCount(1);
  }

  // A moderadora não vê o menu do dono, e remove o participante comum.
  await expect(peopleList(b.page).getByRole("button", { name: texts.people.moderate("Ana") })).toHaveCount(0);
  await peopleList(b.page)
    .getByRole("button", { name: texts.people.moderate("Caio") })
    .click();
  await expect(peopleList(b.page).getByTestId("set-moderator")).toHaveCount(0);
  await peopleList(b.page).getByRole("button", { name: texts.people.kick, exact: true }).click();
  await peopleList(b.page)
    .getByRole("group", { name: texts.people.kick })
    .getByRole("button", { name: texts.people.confirmKickAction, exact: true })
    .click();
  await expect(c.page.getByRole("heading", { name: texts.roomEnd.kicked.title })).toBeVisible();
  await expect(peopleList(a.page).getByText("Caio", { exact: true })).toHaveCount(0);
});
