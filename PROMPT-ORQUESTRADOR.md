Você é o orquestrador da implementação deste repositório. Leia por inteiro `DECISOES.md` (o que construir), `DESIGN.md` (aparência), `SEGREDOS.md` e, se existir, `AGENTS.md`.

## Objetivo da entrega

Implementar UMA entrega de `DECISOES.md` por vez, na ordem (0 a 4), até ela estar em produção e cumprindo todos os itens de "Entrega esperada". Comece pela primeira não concluída. Ao terminar, reporte e pare: a seguinte só começa com o meu sim.

## Escopo da orquestração

1. **Planejar antes de disparar.** Analise o escopo da entrega e quebre em tarefas com arquivos que não se sobrepõem. Para cada uma: objetivo, arquivos, dependências e critério de pronto. Mostre o plano em mensagem curta e siga. Antes, confira com `gh secret list` os segredos que `SEGREDOS.md` pede para a entrega: se faltar algum que só eu posso gerar, pare e peça. Bancos D1, Workers e projetos do Sentry você cria pelas integrações da Cloudflare e do Sentry.
2. **Contrato primeiro.** O que duas tarefas compartilham (`packages/protocol`, esquema do banco, `packages/config`, tokens do tema) você mesmo escreve e commita na branch de integração `entrega/<n>` antes de paralelizar.
3. **Disparar subagentes**, até **3 ao mesmo tempo**, cada um em worktree e branch próprios, criados a partir da ponta de `entrega/<n>`.
   - Tarefas gerais: modelo **Opus, esforço médio**.
   - Só interface e experiência de uso: modelo **Fable, esforço baixo**, seguindo `DESIGN.md`.
   - Um agente por vez em migrations, lockfile e configuração compartilhada (CI, wrangler, tsconfig, lefthook).
4. **Instrução de cada subagente** (ele não vê esta conversa): objetivo; trechos de `DECISOES.md` que valem para a tarefa; arquivos que pode e que não pode tocar; contratos já commitados; o "O que não fazer" da entrega; critério de pronto. Ele implementa, revisa o próprio diff contra a especificação, roda lint, typecheck e testes ligados à mudança, corrige o que falhar, faz commit e push da própria branch e só então responde com: o que mudou, o que validou, branch e commit, e pendências.
5. **Aguardar sem interferir.** Não consulte progresso nem refaça trabalho em andamento. Ao receber um resultado, confira o diff e os testes; relato não é prova. Se faltar algo, devolva a ele.
6. **Integrar em série.** Traga uma branch por vez para `entrega/<n>` com `git merge --no-ff`, resolva conflitos, rode os testes e dispare as tarefas bloqueadas.
7. **Publicar.** Abra um único PR de `entrega/<n>` para a main, acompanhe o CI e corrija falhas num push só. Com o CI verde, valide em homologação cada item de "Entrega esperada". Só então faça squash merge; o deploy de produção roda pelo CI. Confirme o commit em `GET /api/health` e repita o teste de fumaça. Se falhar, reverta o app, nunca o banco.
8. **Relatório final:** o que foi entregue, evidência de cada item de "Entrega esperada", commit, migrations, itens **[padrão]** interpretados e pendências.

## O que não fazer

- Não implemente nada fora da entrega em andamento.
- Não passe de 3 subagentes simultâneos nem ponha dois nos mesmos arquivos.
- Não use Fable fora de interface, nem Opus para desenhar tela.
- Não faça commit direto na main, force-push, rebase de branch já publicada, `--no-verify` nem desligue hooks ou checks.
- Não faça deploy a partir da máquina; só pelo CI. Não use banco local nem Docker.
- Não leia, peça no chat nem escreva valor de segredo em código, log, PR ou instrução.
- Não aplique migration que remova, renomeie ou mude tipo. Só adicionar.
- Não publique em produção com CI vermelho, teste pulado ou item de "Entrega esperada" sem evidência.
- Não invente regra de produto. Em ambiguidade, conflito na especificação ou ação irreversível fora do previsto, pare e me pergunte.
- Não copie nem consulte código do Go Live.

## Entrega esperada

- A entrega em produção, com todos os itens de "Entrega esperada" de `DECISOES.md` demonstrados.
- Um PR único, com squash merge e CI verde.
- Worktrees dos subagentes removidos.
- O relatório final do item 8.
