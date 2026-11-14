import type { AppEnv } from "./env";
import { serverTexts } from "./texts";

/** Imagem da prévia, servida pelos arquivos do front (`apps/web/public/og.png`). */
export const OG_IMAGE_PATH = "/og.png";

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function metaTags(pageUrl: string, imageUrl: string): string {
  const { siteName, title, description, imageAlt } = serverTexts.linkPreview;
  const tags: [attribute: "property" | "name", key: string, content: string][] = [
    ["property", "og:type", "website"],
    ["property", "og:site_name", siteName],
    ["property", "og:locale", "pt_BR"],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", pageUrl],
    ["property", "og:image", imageUrl],
    ["property", "og:image:type", "image/png"],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", imageAlt],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", imageUrl],
    ["name", "description", description],
  ];
  return tags
    .map(
      ([attribute, key, content]) => `<meta ${attribute}="${key}" content="${escapeAttribute(content)}" />`,
    )
    .join("");
}

/**
 * Página da sala (`/s/<código>`): o `index.html` do front com as tags Open Graph e Twitter, para
 * o link mostrar título e imagem nos aplicativos de mensagem. Textos fixos: não revela se a sala
 * existe. URLs absolutas com a origem da requisição.
 */
export async function roomPagePreview(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new Request(new URL("/", url), { method: "GET" }));
  if (!page.ok || !page.headers.get("content-type")?.includes("text/html")) return page;

  const pageUrl = `${url.origin}${url.pathname}`;
  const imageUrl = `${url.origin}${OG_IMAGE_PATH}`;
  const tags = metaTags(pageUrl, imageUrl);
  const { title } = serverTexts.linkPreview;

  const rewritten = new HTMLRewriter()
    .on("head > title", {
      element(element) {
        element.setInnerContent(title);
      },
    })
    // O index.html já traz tags genéricas (para o início); na sala valem só as injetadas abaixo,
    // senão os aplicativos de mensagem leem a primeira (título genérico e imagem relativa).
    .on('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]', {
      element(element) {
        element.remove();
      },
    })
    .on("head", {
      element(element) {
        element.append(tags, { html: true });
      },
    })
    .transform(page);

  const response = new Response(rewritten.body, rewritten);
  // A página varia só pela origem; não deixa caches intermediários guardarem a versão errada.
  response.headers.set("Cache-Control", "no-cache");
  return response;
}
