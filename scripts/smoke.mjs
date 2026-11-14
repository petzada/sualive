#!/usr/bin/env node
// Verificação pós-deploy. Node puro, sem dependências.
//
// Uso: node scripts/smoke.mjs <url-base> <sha-esperado>
//
// 1. GET /api/health com novas tentativas até `status === "ok"` e `commit === <sha>`
//    (o deploy leva alguns segundos para chegar a todas as regiões).
// 2. GET / devolve 200 com HTML.
//
// SMOKE_TIMEOUT_MS (padrão 120000) e SMOKE_INTERVAL_MS (padrão 5000) ajustam a espera.

const [baseArg, expectedSha] = process.argv.slice(2);
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 120_000);
const INTERVAL_MS = Number(process.env.SMOKE_INTERVAL_MS ?? 5_000);
const REQUEST_TIMEOUT_MS = 10_000;

function fail(message) {
  console.error(`smoke: FALHOU — ${message}`);
  process.exit(1);
}

if (!baseArg || !expectedSha) {
  fail("uso: node scripts/smoke.mjs <url-base> <sha-esperado>");
}

let base;
try {
  base = new URL(baseArg);
} catch {
  fail(`URL base inválida: ${JSON.stringify(baseArg)}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path) {
  const url = new URL(path, base);
  url.searchParams.set("smoke", Date.now().toString()); // fura cache intermediário
  return fetch(url, {
    headers: { "cache-control": "no-cache" },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function checkHealth() {
  const deadline = Date.now() + TIMEOUT_MS;
  let last;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await get("/api/health");
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      if (res.ok && body?.status === "ok" && body?.commit === expectedSha) {
        console.log(`smoke: /api/health ok com o commit ${expectedSha} (tentativa ${attempt}).`);
        return;
      }
      last = body
        ? `HTTP ${res.status}, status=${JSON.stringify(body.status)}, commit=${JSON.stringify(body.commit)}`
        : `HTTP ${res.status}, corpo não é JSON: ${text.slice(0, 120)}`;
    } catch (error) {
      last = `erro de rede: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (Date.now() + INTERVAL_MS > deadline) break;
    console.log(`smoke: tentativa ${attempt} — ${last}; nova tentativa em ${INTERVAL_MS / 1000}s.`);
    await sleep(INTERVAL_MS);
  }
  fail(
    `/api/health em ${base.origin} não respondeu status "ok" com o commit ${expectedSha} ` +
      `em ${TIMEOUT_MS / 1000}s. Última resposta: ${last}`,
  );
}

async function checkHome() {
  let res;
  try {
    res = await get("/");
  } catch (error) {
    fail(`GET / em ${base.origin}: erro de rede: ${error instanceof Error ? error.message : String(error)}`);
  }
  const type = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (res.status !== 200) fail(`GET / em ${base.origin} devolveu HTTP ${res.status}, esperado 200.`);
  if (!type.includes("text/html") || !/<html[\s>]/i.test(text)) {
    fail(`GET / em ${base.origin} não devolveu HTML (content-type: ${type || "ausente"}).`);
  }
  console.log("smoke: / devolveu 200 com HTML.");
}

await checkHealth();
await checkHome();
console.log(`smoke: ${base.origin} ok.`);
