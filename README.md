# sualive

Sala de chamada com compartilhamento de tela que abre por um link, sem cadastro e sem anúncio.

Em andamento: entrega 0 (fundação) — monorepo, esteira de CI e deploy, e os dois ambientes no ar com uma
página provisória. Ainda não há funcionalidade de produto.

| Arquivo | Para quê |
|---|---|
| [DECISOES.md](DECISOES.md) | Especificação de implementação, dividida em entregas |
| [DESIGN.md](DESIGN.md) | Tokens, paleta e padrões visuais |
| [AGENTS.md](AGENTS.md) | Convenções para agentes de código (resumo de `DECISOES.md`) |
| [SEGREDOS.md](SEGREDOS.md) | Nomes das credenciais de cada entrega e onde consegui-las |

## Requisitos

- Node 22 (veja `.nvmrc`)
- pnpm 12 (a versão exata está em `packageManager` no `package.json`)

Não há banco local nem Docker: o Worker roda no simulador do Wrangler.

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/web` | Front: React 19, Vite, HeroUI 3 e Tailwind 4 |
| `apps/api` | Worker da Cloudflare (Hono, Durable Object, D1); também serve o front |
| `packages/protocol` | Mensagens do WebSocket da sala, com esquemas validados |
| `packages/media` | Camada de WebRTC do front |
| `packages/config` | Valores numéricos do produto (limites, preços, prazos) |
| `scripts/` | Scripts da esteira: testes ligados ao diff e verificação pós-deploy |

## Comandos

```bash
pnpm install                       # dependências
pnpm --filter @sualive/web dev     # front em modo de desenvolvimento (Vite)
pnpm --filter @sualive/api dev     # Worker no simulador do Wrangler (wrangler dev), com D1 e Durable Object locais
```

| Comando | O que faz |
|---|---|
| `pnpm typecheck` | Checagem de tipos de todos os pacotes |
| `pnpm lint` | ESLint |
| `pnpm test` | Testes (Vitest) |
| `pnpm test:related` | Só os testes ligados ao que mudou desde `origin/main` |
| `pnpm test:ci` | Suíte completa, como no CI |
| `pnpm e2e` | Teste de fumaça com Playwright (Chromium, mídia falsa) contra o Worker no simulador do Wrangler; faz o build antes. Na primeira vez: `pnpm --filter @sualive/e2e exec playwright install --only-shell chromium` |
| `pnpm build` | Build do front e verificação do bundle do Worker |
| `pnpm format` | Formata o repositório com o Prettier |

Para o Worker servir o front localmente, rode `pnpm build` antes do `dev` da API (ele lê `apps/web/dist`).

O lint, typecheck e testes completos, o build e o teste de fumaça rodam no CI. O `pnpm e2e` roda sob
demanda quando mexer na sala.

## CI, deploy e ambientes

| Ambiente | Worker | Banco D1 |
|---|---|---|
| Produção | `sualive` | `sualive` |
| Homologação | `sualive-staging` | `sualive-staging` |

- **Pull request** (`.github/workflows/ci.yml`): formatação, lint, typecheck e build, no check
  `verificar`; testes, no check `testes`; e o teste de fumaça no navegador, no check `e2e`. Não usa
  segredo.
- **Merge na main** (`.github/workflows/deploy.yml`): roda o mesmo CI e, só com ele verde, publica primeiro
  a homologação — build, migrations
  do D1, deploy do Worker e verificação (`scripts/smoke.mjs` espera `GET /api/health` responder com o
  commit publicado e confere a página inicial). Só se a homologação passar, repete a sequência em
  produção.
- Deploy só pelo CI; nunca da máquina de desenvolvimento. As credenciais ficam nos segredos do GitHub
  Actions (nomes em [SEGREDOS.md](SEGREDOS.md)).

## Licença

Código público sob a [PolyForm Noncommercial License 1.0.0](LICENSE.md): uso, estudo e modificação
liberados para fins não comerciais, mantendo o aviso em [NOTICE](NOTICE). Uso comercial exige acordo com
crédito e participação na receita; veja [COMERCIAL.md](COMERCIAL.md).
