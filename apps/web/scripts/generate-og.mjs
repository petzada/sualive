/**
 * Generates `public/og.png` (1200x630), the image shown when a room link is pasted in a chat app.
 *
 * Reproducible and dependency-free: renders an HTML page with the theme tokens and the Inter font
 * already in the repository and takes a screenshot with a Chromium-based browser installed on the
 * machine (Chrome, Edge or Chromium), in headless mode.
 *
 *   node apps/web/scripts/generate-og.mjs
 *
 * Set BROWSER_PATH to point at a specific browser executable.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WIDTH = 1200;
const HEIGHT = 630;

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(webRoot, "public", "og.png");

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error("No Chromium-based browser found. Set BROWSER_PATH to its executable.");
  return found;
}

/** Single source of truth: the copy comes from the texts file and the colors from the tokens. */
function readSource(file, pattern, what) {
  const match = readFileSync(join(webRoot, file), "utf8").match(pattern);
  if (!match) throw new Error(`Could not read ${what} from ${file}`);
  return match[1];
}

const name = readSource("../../packages/config/src/index.ts", /APP_NAME = "([^"]+)"/, "the product name");
const tagline = readSource("src/texts.ts", /const TAGLINE =\s*"([^"]+)"/, "the tagline");
const token = (tokenName) =>
  readSource("src/styles/tokens.css", new RegExp(`--${tokenName}:\\s*([^;]+);`), `the token ${tokenName}`);

const require = createRequire(import.meta.url);
const fontFile = join(
  dirname(require.resolve("@fontsource-variable/inter/package.json")),
  "files",
  "inter-latin-wght-normal.woff2",
);

const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: "Inter Variable";
        font-weight: 100 900;
        src: url("${pathToFileURL(fontFile).href}") format("woff2-variations");
      }
      * { margin: 0; box-sizing: border-box; }
      html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
      body {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 36px;
        padding: 0 120px;
        background: ${token("color-canvas")};
        color: ${token("color-ink")};
        font-family: "Inter Variable", sans-serif;
        text-align: center;
        -webkit-font-smoothing: antialiased;
      }
      h1 { font-size: 144px; font-weight: 600; line-height: 1.05; letter-spacing: -2.4px; }
      p { max-width: 860px; font-size: 36px; line-height: 1.3; letter-spacing: -0.6px; color: ${token("color-muted")}; }
    </style>
  </head>
  <body>
    <h1>${name}</h1>
    <p>${tagline}</p>
  </body>
</html>`;

const workDir = mkdtempSync(join(tmpdir(), "sualive-og-"));
try {
  const page = join(workDir, "og.html");
  writeFileSync(page, html, "utf8");
  execFileSync(
    findBrowser(),
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--force-device-scale-factor=1",
      `--user-data-dir=${join(workDir, "profile")}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      "--virtual-time-budget=3000",
      `--screenshot=${output}`,
      pathToFileURL(page).href,
    ],
    { stdio: "ignore", timeout: 60_000 },
  );
} finally {
  rmSync(workDir, { recursive: true, force: true, maxRetries: 5 });
}

// PNG header: 8-byte signature, then the IHDR chunk with width and height (big-endian).
const png = readFileSync(output);
const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
if (width !== WIDTH || height !== HEIGHT) {
  throw new Error(`og.png is ${width}x${height}, expected ${WIDTH}x${HEIGHT}`);
}
console.log(`og.png written (${width}x${height}, ${png.length} bytes)`);
