import { FIXED_ROOM_PATH_PREFIX } from "@sualive/config";
import { env as workerEnv } from "cloudflare:workers";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../src/env";
import { roomPagePreview } from "../src/preview";
import { serverTexts } from "../src/texts";
import { fetchWithEnv } from "./helpers";

const INDEX_HTML =
  '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8" /><title>sualive</title><meta name="description" content="genérica" /><meta property="og:title" content="sualive" /><meta property="og:image" content="/og.png" /><meta name="twitter:card" content="summary" /></head><body><div id="root"></div></body></html>';

function fakeAssets(requested: string[]): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL) => {
      requested.push(input instanceof Request ? input.url : String(input));
      return new Response(INDEX_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    },
    connect: () => {
      throw new Error("não usado");
    },
  } as unknown as Fetcher;
}

function metaContent(html: string, key: string): string | undefined {
  const match = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html);
  return match?.[1];
}

describe("prévia do link da sala", () => {
  it("injeta Open Graph e Twitter com URLs absolutas da origem da requisição", async () => {
    const requested: string[] = [];
    const response = await fetchWithEnv(new Request("https://sala.exemplo.com/s/abcdefghij"), {
      ASSETS: fakeAssets(requested),
    });

    expect(response.status).toBe(200);
    expect(requested).toEqual(["https://sala.exemplo.com/"]);
    const html = await response.text();
    const { title, description } = serverTexts.linkPreview;
    expect(metaContent(html, "og:title")).toBe(title);
    expect(metaContent(html, "og:description")).toBe(description);
    expect(metaContent(html, "og:url")).toBe("https://sala.exemplo.com/s/abcdefghij");
    expect(metaContent(html, "og:image")).toBe("https://sala.exemplo.com/og.png");
    expect(metaContent(html, "twitter:card")).toBe("summary_large_image");
    expect(metaContent(html, "twitter:image")).toBe("https://sala.exemplo.com/og.png");
    expect(html).toContain('<div id="root"></div>');
  });

  it("não revela se a sala existe: o mesmo conteúdo para qualquer código", async () => {
    const pages = await Promise.all(
      ["/s/abcdefghij", "/s/zzzzzzzzzz"].map(async (path) => {
        const response = await fetchWithEnv(new Request(`https://sualive.test${path}`), {
          ASSETS: fakeAssets([]),
        });
        return (await response.text()).replace(path, "");
      }),
    );
    expect(pages[0]).toBe(pages[1]);
  });

  it("link fixo (/@nome): mesma prévia genérica, sem revelar se a conta existe", async () => {
    // A rota `/@*` é montada no app.ts na integração; aqui o mesmo handler, num app com a mesma rota.
    const app = new Hono<{ Bindings: AppEnv }>();
    app.get(`${FIXED_ROOM_PATH_PREFIX}*`, (c) => roomPagePreview(c.req.raw, c.env));
    const env = { ...(workerEnv as unknown as AppEnv), ASSETS: fakeAssets([]) };
    const pages = await Promise.all(
      ["/@ana_existe", "/@ninguem"].map(async (path) => {
        const response = await app.fetch(new Request(`https://sualive.test${path}`), env);
        expect(response.status).toBe(200);
        const html = await response.text();
        expect(metaContent(html, "og:url")).toBe(`https://sualive.test${path}`);
        expect(metaContent(html, "og:title")).toBe(serverTexts.linkPreview.title);
        return html.replace(path, "");
      }),
    );
    expect(pages[0]).toBe(pages[1]);
  });

  it("escapa a URL nos atributos", async () => {
    const response = await fetchWithEnv(new Request('https://sualive.test/s/a"b<c'), {
      ASSETS: fakeAssets([]),
    });
    const html = await response.text();
    expect(html).not.toContain('a"b<c');
  });
});
