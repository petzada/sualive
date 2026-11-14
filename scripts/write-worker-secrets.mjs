#!/usr/bin/env node
// Grava o arquivo de segredos do Worker para `wrangler deploy --secrets-file`.
// Uso: node scripts/write-worker-secrets.mjs <arquivo> NOME[=VARIAVEL_DE_AMBIENTE] ...
// Cada segredo é lido da variável de ambiente indicada (padrão: o próprio nome). Variável vazia é
// pulada. Nenhum valor é impresso.
import { writeFileSync } from "node:fs";

const [file, ...specs] = process.argv.slice(2);
if (!file || specs.length === 0) {
  console.error("uso: write-worker-secrets.mjs <arquivo> NOME[=VARIAVEL] ...");
  process.exit(1);
}

const secrets = {};
const missing = [];
for (const spec of specs) {
  const [name, source = name] = spec.split("=");
  const value = process.env[source];
  if (value) secrets[name] = value;
  else missing.push(name);
}

writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
console.log(`segredos gravados: ${Object.keys(secrets).join(", ") || "(nenhum)"}`);
if (missing.length > 0) console.log(`sem valor (pulados): ${missing.join(", ")}`);
