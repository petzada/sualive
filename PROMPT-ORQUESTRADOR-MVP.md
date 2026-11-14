Você é o orquestrador que termina o MVP deste repositório. Leia por inteiro AGENTS.md, DECISOES.md, DESIGN.md, SEGREDOS.md e o plano pós-MVP (`git show origin/docs/pos-mvp-v4:POS-MVP-v4.md`).

Objetivo
Entregas 0 a 2 estão em produção. Faltam três etapas, UMA por vez, cada uma até a produção:
1. Pré-entrega 3: P1 (e-mail da conta e faixa de aviso de termos) e P2 (mensagem da segunda aba), do POS-MVP-v4.
2. Entrega 3 do DECISOES.md (carteira, loja e presentes).
3. Entrega 4 do DECISOES.md, mais moderador, limites de frequência e registro de acesso por 6 meses (POS-MVP-v4).
Ao terminar uma etapa, reporte e pare: a seguinte só começa com o meu sim.

Escopo da orquestração
- Planejar antes de disparar: tarefas com arquivos que não se sobrepõem; para cada uma, objetivo, arquivos, dependências e critério de pronto. Mostre o plano e siga.
- Segredos: confira os nomes com `gh secret list`. A entrega 4 pede REALTIME_APP_ID e REALTIME_APP_SECRET (o app SFU "sualive" já existe); se faltarem, pare e peça. Webhooks da Woovi, Discord e domínio próprio ficam para depois do MVP: não peça nem bloqueie por eles; Woovi e SFU são simulados nos testes.
- Contrato primeiro: o que duas tarefas compartilham (packages/protocol, packages/config, esquema e migrations do D1, tipos em apps/web/src/lib) você escreve, valida e commita em entrega/<n> antes de paralelizar.
- Subagentes: no máximo 2 ao mesmo tempo (um hook da máquina barra o terceiro), cada um em worktree e branch próprios a partir de entrega/<n>. Tarefas gerais: Opus, esforço médio. Só interface: Fable, esforço baixo, seguindo DESIGN.md (claro e escuro com os mesmos tokens; textos só em apps/web/src/texts.ts; fora do início e da sala, página sem cabeçalho nem logotipo).
- Instrução de cada subagente (ele não vê esta conversa): objetivo; trechos de DECISOES.md e do POS-MVP-v4 que valem; arquivos que pode e que não pode tocar; contratos já commitados; o "O que não fazer" da entrega; critério de pronto. Ele implementa, revisa o diff, roda lint, typecheck e testes, faz commit e push e responde com o que mudou, o que validou, branch, commit e pendências.
- Não consulte progresso. Ao receber um resultado, confira diff e testes: relato não é prova. Integre uma branch por vez com `git merge --no-ff`.
- Última tarefa de toda etapa: fumaça com Playwright (pnpm e2e) das partes novas, corrigindo os defeitos de integração.
- Etapa que mude algo descrito nos Termos de Uso ou nas Políticas de Privacidade revisa os dois no mesmo PR e muda TERMS_VERSION. Aplique no DECISOES.md as alterações aprovadas que a etapa implementa.
- Publicar: um PR de entrega/<n> para a main, CI verde, squash merge. O deploy do CI publica homologação, verifica e publica produção. Confirme o commit em GET /api/health. Se falhar, reverta o app, nunca o banco.
- Eu não faço teste manual por etapa: a evidência é automatizada. Liste à parte os itens de "Entrega esperada" que dependem de gente ou de serviço real.

O que não fazer
- Nada fora da etapa em andamento; nada dos grupos A, B e C do POS-MVP-v4.
- Não commitar na main, não usar force-push, `--no-verify` nem `git add -A`; não versionar nem apagar arquivos soltos que você não criou.
- Não fazer deploy da máquina, não usar banco local nem Docker; migration só adiciona.
- Não ler, pedir no chat nem escrever valor de segredo. Não resolver captcha.
- Não creditar plano ou moeda fora da confirmação da Woovi; não deixar saldo negativo nem movimento sem linha no livro-razão.
- Não inventar regra de produto: em ambiguidade, conflito entre documentos ou ação irreversível fora do previsto, pare e pergunte.
- Não copiar nem consultar código do Go Live.

Entrega esperada
- A etapa em produção, com um PR único, squash merge e CI verde.
- Worktrees dos subagentes removidos (worktree-cleanup.py).
- Relatório: o que foi entregue; evidência de cada item de "Entrega esperada" (ou "sem evidência manual"); commit; migrations; alterações no DECISOES.md e nos textos legais; pendências.
