#!/usr/bin/env node
// Testes ligados ao diff, para o pre-push.
//
// `turbo run test:related --affected` escolhe os pacotes afetados pelo diff contra a base, mas o
// `vitest related` de cada pacote só roda alguma coisa se receber os arquivos alterados. Este script
// calcula esses arquivos (a partir do merge-base com a base) e os repassa a todos os pacotes afetados.
//
// Base: TURBO_SCM_BASE (padrão `origin/main`). Usa `git fetch` antes se a base estiver desatualizada.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const CODE = /\.[cm]?[jt]sx?$/;
// Acima disso a linha de comando fica longa demais (Windows); roda a suíte dos pacotes afetados.
const MAX_FILES = 150;
// O cmd do Windows aceita cerca de 8191 caracteres por linha; com folga para o resto do comando.
const MAX_ARGS_LENGTH = 6000;

const base = process.env.TURBO_SCM_BASE || "origin/main";
const root = resolve(git(["rev-parse", "--show-toplevel"]));

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`test:related: falha em \`git ${args.join(" ")}\`\n${r.stderr}`);
    process.exit(1);
  }
  return r.stdout.trim();
}

function turbo(args) {
  const turboBin = createRequire(import.meta.url).resolve("turbo/bin/turbo");
  const r = spawnSync(process.execPath, [turboBin, ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, TURBO_SCM_BASE: base },
  });
  process.exit(r.status ?? 1);
}

const mergeBase = git(["merge-base", base, "HEAD"]);
// Contra a árvore de trabalho: inclui o que está commitado e o que ainda não está.
const changed = git(["diff", "--name-only", "--diff-filter=ACMR", mergeBase])
  .split("\n")
  .filter((file) => file && CODE.test(file))
  .map((file) => resolve(root, file))
  .filter((file) => existsSync(file));

if (changed.length === 0) {
  console.log(`test:related: nenhum arquivo de código alterado desde ${base}; nada a testar.`);
  process.exit(0);
}

console.log(`test:related: ${changed.length} arquivo(s) alterado(s) desde ${base}.`);
const argsLength = changed.reduce((total, file) => total + file.length + 1, 0);
if (changed.length > MAX_FILES || argsLength > MAX_ARGS_LENGTH) {
  turbo(["run", "test", "--affected", "--concurrency=1"]);
} else {
  turbo(["run", "test:related", "--affected", "--concurrency=1", "--", ...changed]);
}
