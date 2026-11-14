# Instruções para agentes de código

Resumo operacional de [DECISOES.md](DECISOES.md), que é a fonte de verdade do **que** construir. A
aparência está em [DESIGN.md](DESIGN.md). Em caso de dúvida ou de conflito entre regras, pare e pergunte;
não invente regra. Responda e escreva commits em português.

## Como trabalhar

- Uma entrega por vez, na ordem de `DECISOES.md`. O que não está no escopo da entrega em andamento não se
  constrói, mesmo que apareça numa entrega futura. Leia "O que não fazer" da entrega antes de começar.
- Itens marcados **[padrão]** podem ser implementados como estão; se parecerem errados, pergunte antes de
  mudar.
- Antes de usar uma API de biblioteca, confira a documentação da versão instalada (veja o lockfile). Não
  confie na memória.
- Dependência nova: última versão estável, travada no lockfile.

## Estrutura do monorepo

pnpm 12 + turbo, Node 22.

| Pasta | O que é |
|---|---|
| `apps/web` | React 19 + Vite + TypeScript (SPA), HeroUI 3 sobre Tailwind 4 com os tokens de `DESIGN.md` |
| `apps/api` | Worker da Cloudflare com Hono; serve a API (`/api/*`) e os arquivos do front (`apps/web/dist`). Durable Object `Room`, D1 com Drizzle |
| `packages/protocol` | Esquemas validados de todas as mensagens do WebSocket da sala. Front e API importam daqui |
| `packages/media` | A única parte do front que conhece WebRTC; interface única para os dois caminhos de mídia |
| `packages/config` | Único lugar para valores numéricos do produto (limites, preços, prazos) |
| `scripts/` | Scripts da esteira (`test-related.mjs`, `smoke.mjs`) |
| `e2e` | Teste de fumaça com Playwright contra o produto no simulador do Wrangler |

## Scripts padronizados

Os mesmos nomes na raiz e em todos os pacotes. Use-os em vez de inventar comandos.

| Script | O que faz |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` em todos os pacotes (turbo, com cache) |
| `pnpm lint` | ESLint sem informação de tipos |
| `pnpm test` | Vitest (`--run`), suítes em série |
| `pnpm test:related` | Só os testes ligados ao diff contra `origin/main` (o pre-push usa este) |
| `pnpm test:ci` | Suíte completa, como no CI |
| `pnpm e2e` | Teste de fumaça com Playwright (`e2e/`): build, Worker no simulador do Wrangler e Chromium com mídia falsa. Só sob demanda e no CI, nunca nos hooks |
| `pnpm build` | Build do front e verificação do bundle do Worker (`wrangler deploy --dry-run`) |

Vitest sempre com `--run`; nunca em modo watch. Um job pesado por vez (não rode lint e testes juntos).

## Regras do código

- **O servidor decide, o cliente obedece.** Limites de pessoas e de vídeos, papéis, plano e saldo são
  verificados no Durable Object ou no Worker. Única exceção: a qualidade na sala direta, aplicada pelo
  navegador de quem transmite. Nunca confie em valor enviado pelo navegador para plano, saldo, papel,
  preço ou identidade.
- **Textos num arquivo único.** Código e identificadores em inglês; todo texto visível ao usuário em
  português, no arquivo de textos do front, nunca escrito direto no componente.
- **Tokens do tema.** Nenhum componente usa cor, fonte ou raio fora dos tokens de `DESIGN.md`. Fonte Inter;
  nomes de token neutros; nada de nome, logotipo ou fonte da marca que inspirou o design.
- **`packages/protocol`**: nenhuma mensagem do WebSocket é aceita sem validação pelo esquema.
- **`packages/media`**: o resto da interface não sabe qual caminho de mídia está em uso.
- **`packages/config`**: números do produto só ali, nunca espalhados pelo código.

## O que nunca fazer

- Copiar ou consultar código do Go Live.
- Rodar banco local, Docker ou qualquer servidor de banco. Desenvolvimento usa o simulador do Wrangler
  (`wrangler dev`); o que precisa de banco real roda só no CI.
- Fazer deploy a partir da máquina de desenvolvimento.
- Colocar segredo no front, em arquivo versionado ou em variável `VITE_*` (elas vão para o navegador).
- Creditar plano ou ouro por qualquer caminho que não seja a confirmação recebida da Woovi.
- Deixar saldo negativo ou alterar saldo sem a linha correspondente no livro-razão.
- Guardar gravação de áudio ou vídeo, ou o chat depois que a sala acaba (exceto a cópia anexada a uma
  denúncia).
- Adicionar anúncios, rastreadores além dos listados, ou recurso fora do escopo.

## Termos de Uso e Políticas de Privacidade

Os dois textos ficam em `apps/web/src/texts.ts` (`TERMS_SECTIONS` e `PRIVACY_SECTIONS`) e descrevem o que
o produto faz hoje. Sempre com esses nomes, com as maiúsculas, onde forem citados.

- Toda entrega que mudar algo descrito neles (dado coletado ou guardado, operador novo, pagamento,
  moderação, sala pública, denúncia, moeda, envio de arquivo) revisa os dois textos no mesmo PR e muda
  `TERMS_VERSION` em `packages/config`.
- Prometido no texto e ainda não implementado: guarda do registro de acesso (IP, data e hora) por 6 meses
  e a caixa de entrada de `contato@sualive.com.br` (depende do domínio, fim do MVP).
- O nome do produto aparece sempre em negrito nos textos: use o componente `Brand`
  (`apps/web/src/components/Brand.tsx`) ao renderizar um texto que cita o `APP_NAME`.

## Migrations do D1

Ficam em `apps/api/migrations` e são aplicadas pelo CI antes do deploy do código, em homologação e depois
em produção. Seguem **expand/contract**:

- **Expand** (pode ir em qualquer PR): só adiciona — tabela, índice, coluna nula ou com default.
- **Contract** (remover, renomear, mudar tipo): em PR separado, depois que nenhum código no ar usa mais a
  estrutura antiga.
- Problema em produção: reverta o código, nunca o banco.

## Fluxo de git

- Uma branch por alteração, a partir de `origin/main` atualizado (`git fetch` antes). **Nunca** commit na
  `main`.
- Conventional Commits em português (`feat: …`, `fix: …`, `chore: …`, `docs: …`).
- Enquanto trabalha: commit e push da branch (`git push -u origin <branch>`), sem abrir PR. Push sem PR não
  roda CI.
- Um PR único por entrega, aberto quando o trabalho está pronto; merge por squash.
- Os hooks do lefthook rodam no commit (prettier e eslint nos arquivos em stage) e no push (typecheck e
  testes relacionados). Nunca `--no-verify`, nunca `LEFTHOOK=0`, nunca force-push.

## Ambientes, CI e deploy

| Ambiente | Worker | D1 | Observação |
|---|---|---|---|
| Produção | `sualive` | `sualive` | nível de cima do `wrangler.jsonc` |
| Homologação | `sualive-staging` | `sualive-staging` | `--env staging`; usa o ambiente de teste da Woovi (entrega 2) |

- **PR** (`.github/workflows/ci.yml`): check `verificar` (prettier, lint, typecheck, testes e build) e
  check `e2e` (teste de fumaça com Playwright). Sem segredo.
- **Merge na main** (`.github/workflows/deploy.yml`): homologação (build → migrations do D1 → deploy →
  verificação com `scripts/smoke.mjs`) e, só se ela passar, produção na mesma ordem. A verificação espera
  `GET /api/health` responder `status: "ok"` com o commit publicado e `GET /` devolver HTML.
- Deploy só pelo CI. Nunca `wrangler deploy` da máquina.

## Segredos

Só por nome. Valores ficam nos segredos do GitHub Actions e nos segredos do Worker; nunca em arquivo, PR,
log ou conversa. A lista de nomes de cada entrega e onde consegui-los está em [SEGREDOS.md](SEGREDOS.md).
Variáveis `VITE_*` são públicas por natureza.

## Erro proposital (verificar o Sentry)

- Worker: `GET /api/debug/error` lança um erro, só quando `DEBUG_ROUTES=1` (ligado apenas em homologação).
- Front: o parâmetro `?debug=erro` na URL lança um erro, fora de produção.
