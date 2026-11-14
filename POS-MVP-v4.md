# Próximas etapas depois do MVP

Versão 4, de 2026-11-14. Substitui o `POS-MVP.md` (versão 3). Resultado da revisão adversarial feita pela
sessão que implementou as entregas 0 a 2, contra o código da `main` no commit `3af2508` e contra a
documentação atual dos navegadores e das plataformas. Complementa o `DECISOES.md`; **não o altera**: as
mudanças que ele precisa receber estão listadas em "Alterações a aplicar no `DECISOES.md`".

Fontes: `objecoes.md`, `analise-objecoes.md`, `features.md`, `analise-features.md` (mesmas da versão 3) e as
fontes técnicas listadas no fim.

## Situação em que este documento foi escrito

- Em produção: entregas 0, 1 e 2. As entregas 3 (carteira, loja, presentes) e 4 (sala no servidor, sala
  pública, moderação, imagens) **ainda não existem**. A versão 3 supunha o MVP pronto.
- Todas as decisões abaixo foram confirmadas pelo dono do produto em 2026-11-14, pergunta a pergunta. Itens
  marcados **[padrão]** são valores que a revisão propôs para fechar uma lacuna e que o dono ainda não
  confirmou um a um.

## Quando e como usar

1. **Agora, antes da entrega 3:** os itens da seção "Antes da entrega 3".
2. **Entregas 3 e 4**, como no `DECISOES.md`, com os acréscimos à entrega 4 descritos aqui.
3. **Grupo A:** condição para abrir ao público, na ordem dada.
4. **Lançamento público.**
5. **Grupo B**, na ordem dada.
6. **Grupo C**, na ordem dada.
7. **Etapas que já estavam no `DECISOES.md`** (Social, Fase 2, Doação), com os acréscimos daqui.

Para o agente que implementar:

- Antes de codar um item, confira a situação no código: a tabela daqui foi tirada em `3af2508`.
- Em conflito com o `DECISOES.md`, pare e pergunte. As alterações já aprovadas estão listadas adiante.
- Valores novos vão para `packages/config`. Continuam valendo: o servidor decide, nenhum segredo no front,
  nada gravado, nenhum código do concorrente, nenhuma API de navegador usada de memória.
- O dono não faz teste manual por entrega: a evidência é automatizada (testes e fumaça) e o uso em produção.

---

## Decisões finais

| # | Decisão | Em relação à versão 3 |
|---|---|---|
| D1 | Áudio: a web faz o que o navegador permite; "só o som do jogo" é promessa do app desktop | Ajustada |
| D2 | Sem teste manual de áudio. O resultado se mede só pelo feedback (B17), que fica no Grupo B. **No lançamento nada é medido**: risco aceito | Mantida, com a consequência explícita |
| D3 | Som da tela e da placa de captura: sem processamento de voz, **sem editar o SDP** (sai em mono, cerca de 32 kbps). Estéreo a 128 kbps fica para o desktop | **Mudou** (era Opus estéreo 128 kbps) |
| D3a | Em conexão retransmitida (TURN), o áudio da tela tem teto de 64 kbps | **Nova** |
| D4 | Sem áudio (Firefox, Safari ou captura muda): avisar antes e depois de compartilhar | Mantida |
| D5 | Senha de sala opcional, grátis, guardada só como hash, de 4 a 64 caracteres, sem sala de espera | Mantida |
| D6 | Erros de senha: **bloqueio crescente** por sessão e por IP, contado no Durable Object da sala | **Mudou** (era 5 por sessão e 20 por IP a cada 10 min) |
| D7 | Sala com senha mostra só "sala com senha", sem número de pessoas. Vale para a rota de informações; a prévia do link já não revela nada | Ajustada |
| D8 | Link fixo do Plus: senha **gerada automaticamente** quando a conta vira Plus e mostrada ao dono, que troca ou desliga quando quiser. Senha e limite de pessoas ficam junto à conta, no D1 | **Mudou** (era "ligada por padrão", sem dizer como) |
| D9 | Link fixo sem senha até o Grupo A: risco aceito | Mantida |
| D10 | Turnstile: marca de 12 horas dispensa novas verificações, **para convidado e para conta** | Ajustada (a versão 3 só servia ao convidado) |
| D11 | Qualidade menor por quem transmite: Automática, 720p30, 480p30, 360p30 e "fluidez 15 fps"; Plus também 1080p30 e 1080p60 | Mantida |
| D12 | Ganho automático do microfone ligado, com opção de desligar | Mantida |
| D13 | Tela cheia com chat; no iPhone, modo "vídeo grande" | Mantida (confirmado que o iPhone segue sem tela cheia para elementos) |
| D14 | Grupo A com os 8 itens, na ordem deste documento; Grupo B depois | Fechada |
| D15 | Discord: a atividade é só um lançador da nossa sala; **última etapa do Grupo C**, e só começa com a verificação do app aprovada | Ajustada |
| D16 | Exceção "atividade do Discord" à regra de integrações de terceiros, registrada quando a etapa começar | Mantida |
| D17 | Grupo C: **Desktop, assistir junto, Android, Discord** | Fechada (era "a revisão propõe") |
| D18 | Console: botão "Transmitir console" na web, no Grupo B, depois do seletor de aparelhos, com som em mono; o desktop melhora para estéreo | Ajustada |
| D19 | Moderação da sala direta (denúncia e painel): manter como está e revisar a cada 3 meses | Mantida |
| D20 | Celular como câmera: o celular conecta **só ao computador da própria pessoa**, que repassa o vídeo à sala como um vídeo dela. Só câmera | **Mudou** (era aparelho extra na malha, fora do limite de pessoas) |
| D21 | Assistir junto: **YouTube sincronizado (com playlist); Twitch ao vivo aberta para todos, sem sincronia**. Sem arquivo local, sem música | Ajustada |
| D22 | Desfoque de fundo: **sai do plano** | **Mudou** (a função do navegador nunca foi lançada) |
| D23 | Instalar como app (PWA): Grupo B, sem cache offline | Mantida |
| D24 | Chat: links `http` e `https` clicáveis para quem pode escrever; menções escolhidas na lista de quem está na sala | Mantida |
| D25 | Moderador: entra **dentro da entrega 4**, junto com palco e plateia, e já vale na sala direta. Na sala de link fixo os moderadores são **permanentes** (guardados junto ao link fixo, só contas). Cargos configuráveis continuam na etapa Social | **Mudou** (era Grupo B, papel só na sala) |
| D26 | Limite de pessoas escolhido pelo dono na sala direta, de 2 a 6 | Mantida |
| D27 | Sons de aviso: entrada e início de transmissão só em salas de até 6 pessoas | Mantida |
| D28 | Feedback ao sair da sala, vinculado à conta de quem tem conta | Mantida, agora viável por causa da D32 |
| D29 | Qualidade grátis: manter 720p30 e medir nos 3 primeiros meses depois do lançamento | Mantida |
| D30 | Ligar para amigo: etapa Social, depois do Android e da notificação web | Mantida |
| D31 | Descrição e categoria da sala pública: Fase 2 | Mantida |
| D32 | **Guardar o e-mail** de quem entra com Google ou Discord, para contato e avisos de cobrança | **Nova** (muda a promessa "não guardamos e-mail") |
| D33 | Mudou a versão dos termos ou da política: quem tem conta **aceita de novo** na visita seguinte | **Nova** |
| D34 | O @nome é da conta para sempre (até trocar ou excluir a conta). Some a regra dos "30 dias de reserva" | **Nova** (alinha o texto ao que o código já faz) |
| D35 | Passar o dono (B7): **sai do plano**; o moderador cobre o caso | **Nova** |
| D36 | Ocultar o indicador de volume (B3): **sai do plano**; a sala não tem o elemento que incomodava no concorrente | **Nova** |
| D37 | Compartilhar tela no celular: liberar **onde o navegador deixa** (hoje, iPhone com iOS 27, só vídeo), com aviso de que vai sem som | **Nova** (muda a regra "no celular o botão não aparece") |
| D38 | Saída de áudio (fone ou caixa): seletor só no computador | **Nova** |
| D39 | Limite de frequência para reações, mão, microfone e chat por pessoa: entra na entrega 4 | **Nova** |
| D40 | Abrir a sala numa segunda aba: a aba derrubada mostra mensagem própria e o botão "Usar esta aba" | **Nova** |

---

## Antes da entrega 3

Itens pequenos que o dono mandou fazer já, para não conflitar com o que vem.

### P1. E-mail da conta (D32, D33)

- **Regra:** o login passa a pedir o e-mail ao Google e ao Discord e o guarda na conta. Contas antigas
  recebem o e-mail no login seguinte. A política de privacidade e os termos mudam de versão, e quem tem conta
  aceita de novo (D33).
- **Infra:** coluna nova e nula em `users` (migration só de adição); escopo de e-mail nos dois provedores;
  `isOnboarded` passa a comparar a versão aceita com `TERMS_VERSION`.
- **Aceite:** conta nova grava o e-mail; conta antiga grava no próximo login; mudar `TERMS_VERSION` leva
  quem já aceitou à tela de aceite; excluir a conta apaga o e-mail.

### P2. Segunda aba (D40)

- **Regra:** continua valendo uma conexão por pessoa. A aba derrubada mostra "Você abriu esta sala em outra
  aba" e o botão "Usar esta aba", em vez de "Algo deu errado".
- **Aceite:** teste do cliente da sala para o fechamento `replaced`.

---

## Acréscimos à entrega 4

A entrega 4 do `DECISOES.md` ganha, com aprovação do dono:

- **Moderador (D25, antigo B18).** O dono promove e rebaixa participantes. O moderador silencia, remove,
  bane e tira do palco; não chama ao palco, não promove e não encerra a sala. **[padrão]** não age sobre o
  dono nem sobre outros moderadores. Papel no protocolo e no Durable Object, verificado pelo servidor.
  - Sala comum e sala no servidor: o papel vale até a sala acabar e sobrevive a reconexão.
  - Sala de link fixo: os moderadores são permanentes, guardados junto ao link fixo no D1; **[padrão]** só
    contas podem ser moderadores permanentes; convidado promovido vale até a sala esvaziar.
- **Limites de frequência (D39).** Por pessoa, não por conexão: chat, reações, levantar a mão e
  ligar/desligar o microfone. Valores em `packages/config`.

---

## Grupo A: condição para abrir ao público

Ordem de implementação. Primeiro o áudio (maior queixa e mais barato), depois anti-robô, senha e tela cheia.

### 1. A3. Aviso de áudio ausente, antes e depois

- **Regra:** em navegador que não captura áudio de tela (Firefox, Safari), avisar ao clicar em
  compartilhar e sugerir Chrome ou Edge. Se a captura voltar sem faixa de áudio, avisar na hora.
- **Aceite:** teste com navegador sem áudio (aviso antes) e com captura sem faixa de áudio (aviso depois).

### 2. A2. Fim do eco da própria sala (reescrito)

- **O que o navegador faz de verdade:** o Chrome e o Edge 141 têm `restrictOwnAudio`, que tira do som
  capturado o áudio da própria página (a voz dos outros participantes da sala), **só no Windows e no macOS**
  e só quando a captura inclui som do sistema. O Chrome **não** tem áudio "só da janela": o valor `window`
  de `windowAudio` não existe nele; janela e tela levam o som do sistema todo.
- **Regra:**
  1. Pedir `restrictOwnAudio` sempre que `getSupportedConstraints()` o declarar. É dica: pode ser ignorada.
  2. Antes de abrir o seletor, a interface explica em uma linha: **aba** leva só o som da aba; **janela** e
     **tela inteira** levam o som do computador, sem a voz desta sala (no Windows e no macOS).
  3. Voz do Discord e de outros programas continua entrando ao compartilhar janela ou tela. A interface diz
     isso e indica a saída: compartilhar uma aba, ou falar pela voz da sala.
- **Aceite automatizado:** com a opção declarada, o pedido de captura a inclui; sem ela, não inclui. Depois
  da captura, `getSettings().restrictOwnAudio` e `displaySurface` definem o texto mostrado.
- **Sem medição no lançamento (D2).**

### 3. A8. Ganho automático do microfone desligável

- **Regra:** ligado por padrão; a pessoa desliga nas configurações de áudio da sala. Desligar **recaptura**
  o microfone (o navegador não troca isso com a faixa aberta); a troca é feita sem recriar as conexões.
- **Aceite:** desligar abre o microfone com `autoGainControl: false` e mantém o estado de mudo.

### 4. A7. Quem transmite escolhe qualidade menor

- **Regra:** Automática, 720p30, 480p30, 360p30 e "fluidez 15 fps", até o teto do plano; Plus vê também
  1080p30 e 1080p60. Sem escolha de codec e sem controle por espectador.
- **No código:** a qualidade hoje é fixa ao criar a sessão de mídia; falta um método para trocá-la com a
  sessão aberta.
- **Aceite:** conta gratuita escolhe 480p30 e o teto de envio muda sem derrubar as conexões.

### 5. A1. Som da tela sem processamento (reduzido)

- **Já feito:** a captura pede o áudio sem cancelamento de eco, sem supressão e sem ganho.
- **Regra nova:** sem editar o SDP (D3). O som da tela sai em mono, cerca de 32 kbps. Em conexão
  retransmitida, teto de 64 kbps na faixa de áudio da tela (D3a), como salvaguarda de banda.
- **Aceite:** o teto é aplicado ao sender de áudio da tela quando a conexão é retransmitida e removido quando
  deixa de ser; parâmetros de vídeo nunca vão para o áudio.

### 6. A6. Turnstile sem repetição

- **Regra:** depois de uma verificação aceita, 12 horas sem pedir de novo ao criar ou entrar. Convidado: a
  marca fica no cookie de sessão assinado. Conta: coluna nova na tabela de sessões (migration só de adição).
  O limite por IP continua.
- **Aceite:** entrar em 5 salas em 10 minutos pelo mesmo navegador pede uma única verificação, com e sem conta.

### 7. A4. Senha de sala

- **Regra:**
  - O dono liga, troca ou desliga a senha a qualquer momento. Grátis, em todos os níveis. 4 a 64 caracteres.
  - Com senha, quem abre o link digita a senha antes da prévia de microfone e câmera.
  - O servidor valida. O erro não dá pista. Só hash com sal.
  - Sala comum: senha no Durable Object. Sala de link fixo: senha junto à conta, no D1 (D8).
  - **Link fixo:** ao virar Plus, a conta recebe uma senha gerada, mostrada ao dono uma vez (só o hash é
    guardado). O dono gera outra, define a sua ou desliga, com aviso.
  - **Erros (D6):** bloqueio crescente por sessão e por IP, contado no Durable Object. **[padrão]** espera de
    5 s depois do primeiro erro, dobrando a cada erro, com teto de 15 minutos; zera depois de 10 minutos sem erro.
  - **Dono:** o navegador do dono envia o token já no pedido de entrada e o servidor dispensa a senha; na sala
    fixa, o dono é reconhecido pela conta.
  - **Rota de informações:** sala com senha responde "sala com senha", sem número de pessoas; a rota ganha
    limite por IP. Corrige o achado de que `GET /api/rooms/@nome` revelava contagem sem limite.
  - Trocar a senha não derruba ninguém. Sem sala de espera.
- **Aceite:** testes no Durable Object: sem senha recusa; a espera cresce a cada erro e bloqueia a tentativa
  antes do prazo; senha certa entra; dono entra sem senha; troca não derruba ninguém; a rota de informações não
  revela a contagem; conta que vira Plus recebe a senha gerada.

### 8. A5. Tela cheia com chat

- **Regra:** o vídeo em destaque tem botão de tela cheia, com o chat por cima, legível e com envio. No
  iPhone, o mesmo botão ativa o modo "vídeo grande".
- **Aceite:** ler e enviar mensagem em tela cheia no computador e no Android, e no modo vídeo grande no iPhone.

---

## Grupo B: depois do lançamento

Ordem de implementação. Primeiro o que é pequeno e visível; depois o seletor de aparelhos, que destrava o
console; por último o que é grande.

| Ordem | # | Item | Regra | Esforço |
|---|---|---|---|---|
| 1 | B10 | Expiração explicada | Texto na sala comum: "a sala fecha 5 minutos depois que todos saem". Na sala fixa, o texto diz que ela não fecha | P |
| 2 | B2 | Esconder painéis | Botão para esconder o painel lateral | P |
| 3 | B9 | Vídeo em pé no celular | Proporção do vídeo pelo tamanho real da imagem, sem bordas pretas | P |
| 4 | B5 | Tapar a própria prévia | Botão para não ver a própria transmissão; pedir `selfBrowserSurface: "exclude"` por garantia | P |
| 5 | B4 | Volume por espectador | Cada pessoa ajusta o volume de cada transmissão na própria tela | P |
| 6 | B14a | Links no chat | Só `http` e `https`; abrem em aba nova com `rel="noopener noreferrer"`; sem prévia | P |
| 7 | B17 | Feedback ao sair | Ver abaixo | M |
| 8 | B6 | Microfone, câmera e saída | Seletor na prévia e na sala. Saída (`setSinkId`) só no computador (D38) | M |
| 9 | B11 | Transmitir console | Ver abaixo | M |
| 10 | B1 | Organização do vídeo | Grade que se ajusta com 2 a 4 vídeos; focar numa tela sem tela cheia | P–M |
| 11 | B8 | Sons de aviso | Mensagem (aba fora de foco), menção, entrada e início de transmissão, cada um ligável; entrada e transmissão só em salas de até 6 | P–M |
| 12 | B15 | Limite de pessoas pelo dono | 2 a 6 na sala direta; o Durable Object recusa acima; baixar não expulsa; na sala fixa, junto à conta | P–M |
| 13 | B19 | Tela no celular (D37) | Botão de compartilhar tela no celular quando o navegador suporta, com aviso de que vai sem som | P–M |
| 14 | B16 | Instalar como app (PWA) | Ver abaixo | P–M |
| 15 | B14b | Menções no chat | `@` abre a lista de quem está na sala; a mensagem guarda o identificador e mostra o apelido guardado | M |
| 16 | B12 | Celular como câmera | Ver abaixo | M |

Saíram do Grupo B: **B3** (D36), **B7** (D35), **B13** (D22) e **B18**, que foi para a entrega 4 (D25).

### B17. Feedback ao sair da sala

- Ao sair de uma sala em que ficou ao menos 2 minutos, pergunta opcional de 1 a 5, com texto de até 500 caracteres.
- Guardar: nota, texto, tipo de sala, plano, navegador, sistema, data e, para quem tem conta, o vínculo com a
  conta (D28). O contato é feito pelo e-mail da conta (D32). Sem conta: anônimo.
- Tabela nova no D1 com chave estrangeira que **zera o vínculo** quando a conta é excluída.
- Limite de envios: **[padrão]** 5 por IP por minuto, pelo limitador existente (ele não conta janelas de 10 minutos).
- A política de privacidade cita a coleta; a versão muda e pede novo aceite (D33).
- **Aceite:** responder grava uma linha; ignorar não grava nada; excluir a conta zera o vínculo; o envio acima
  do limite é recusado.

### B11. Transmitir console

- Depende do B6. Botão "Transmitir console", só no computador.
- A pessoa escolhe a placa de captura. O vídeo entra como um vídeo dela, com perfil de fluidez.
- O som da placa vai numa faixa separada, sem processamento de voz, em mono (D3); a voz continua no microfone.
- Conta como 1 vídeo e segue a qualidade do plano. Recomendar fone de ouvido.
- No desktop, o mesmo recurso ganha som estéreo.
- **Aceite automatizado:** a captura da placa abre áudio com eco, supressão e ganho desligados, em faixa
  própria; a voz segue em outra faixa.

### B12. Celular como câmera (redesenhado)

- No computador, "usar o celular como câmera" mostra um QR Code com token de uso único, válido por 5 minutos,
  ligado à sala e à pessoa. Rota própria, que consome o token e dispensa o Turnstile no celular.
- O celular abre **uma conexão, só com o computador da própria pessoa**, e envia só a câmera (sem microfone).
- O computador repassa esse vídeo à sala como um vídeo da pessoa. Valem os limites que já existem: vídeos por
  pessoa e 4 por sala. A sala não ganha conexões novas, e o celular não ocupa vaga.
- Custo: o computador recodifica o vídeo; o celular envia uma vez, na qualidade do plano.
- Sair da sala no computador desconecta o celular. 1 celular por pessoa.
- **Aceite:** o vídeo do celular aparece como da pessoa; QR usado ou vencido não entra; o segundo celular da
  mesma pessoa é recusado; com 4 vídeos na sala, o do celular é recusado como qualquer outro.

### B16. Instalar como app (PWA)

- Manifesto com nome, ícones (192 e 512), `start_url`, `display: standalone` e cores dos tokens. Sem cache
  offline e sem service worker: instala pelo menu do Chrome e do Edge; no iPhone e no Mac, o Safari instala
  qualquer site.
- **Risco aceito:** no iPhone, o app instalado tem cookies separados do Safari e o retorno do login pode abrir
  o Safari. Sem teste manual, isso só aparece no feedback; se aparecer, o app do iPhone orienta entrar pelo Safari.
- **Aceite automatizado:** o manifesto é servido com os campos exigidos e os ícones existem.

---

## Grupo C: etapas depois do lançamento

Ordem fechada (D17):

1. **Desktop (Electron).** O único caminho para enviar só o som de um programa, sem eco, inclusive para quem
   usa Firefox ou Safari. Leva junto: console em estéreo, som da tela em estéreo a 128 kbps (no app a versão do
   navegador embutido é nossa, então editar a negociação deixa de ser risco), sobreposição, atalhos globais e
   atualização automática.
2. **Assistir junto.** YouTube com sincronia (tocar, pausar, pular) e playlist; Twitch ao vivo aberta para
   todos, sem sincronia. Só os players oficiais, sem sobreposição nossa sobre o player. Sem Crunchyroll nem
   serviço com DRM. Antes de começar: registrar no `DECISOES.md` a exceção "players oficiais incorporados".
3. **Android (Capacitor).** Transmitir a tela do celular e manter a chamada em segundo plano.
4. **Atividade do Discord (lançador).** Só abre a nossa sala no navegador (o Discord documenta que WebRTC não
   funciona dentro de atividade). Começa só com a verificação do app aprovada; sem ela, a atividade só funciona
   em servidores com menos de 25 membros. Antes de começar: registrar a exceção no `DECISOES.md` (D16).

## Acréscimos às etapas que já estavam no `DECISOES.md`

| Etapa | Acréscimo |
|---|---|
| Social | Lista de amigos e "app para sair do Discord" reforçam a etapa |
| Social | Cargos e permissões configuráveis; o moderador da entrega 4 vira um dos cargos |
| Social | Ligar para amigo, depois do Android e da notificação web. No iPhone, só para quem instalou o app |
| Fase 2 | Descrição curta e categoria de lista fixa na sala pública, junto do destaque na vitrine |

---

## Alterações a aplicar no `DECISOES.md`

Aprovadas pelo dono; cada uma entra no `DECISOES.md` quando o item correspondente for implementado.

| Onde | De | Para |
|---|---|---|
| Entrega 2, conta | Não guardamos e-mail (implícito; está nos termos e na política) | Guardamos o e-mail do Google ou do Discord (D32) |
| Entrega 2, primeiro acesso | Aceite único no primeiro acesso | Idem, e novo aceite quando a versão dos termos mudar (D33) |
| Entrega 2, Plus | "O link fixo fica reservado por 30 dias" | O @nome é da conta até ela trocar ou ser excluída (D34) |
| Entrega 1, celular | "O botão de compartilhar tela não aparece" | Aparece onde o navegador suporta, com aviso de que vai sem som (D37) |
| Entrega 4, escopo | Dono chama para o palco e tira dele | Acrescentar moderador e limites de frequência (D25, D39) |
| Fora do produto | "Bots e integrações de terceiros" | Exceções registradas quando as etapas começarem: players oficiais do YouTube e da Twitch; atividade do Discord |
| Mídia | "Não escrever escolha manual de codec" | Sem mudança: o SDP não é editado na web (D3) |

---

## Situação no código (`3af2508`)

Esforço: P = até 1 dia de um agente; M = alguns dias; G = uma entrega.

| Item | Situação | Onde a mudança entra | Esforço |
|---|---|---|---|
| A1 | Captura pronta; nenhum parâmetro de envio de áudio | `packages/media/src/session.ts` (`applySenderParams`) | P |
| A2 | Falta | `packages/media/src/env.ts` (expor `getSupportedConstraints`), `session.ts` (captura), textos | P |
| A3 | Falta | `packages/media/src/capabilities.ts`, `session.ts`, aviso na sala | P |
| A4 | Falta | `apps/api/src/rooms.ts` (entrada e informações), `room.ts`, colunas em `users`, lobby | M |
| A5 | Falta | `apps/web/src/components/room/Stage.tsx`, `RoomView.tsx` | M |
| A6 | Falta | `apps/api/src/session.ts` (convidado), tabela `sessions` (conta), `rooms.ts` | P–M |
| A7 | Falta | `packages/media/src/types.ts` (método novo), `session.ts`, `packages/config` | P–M |
| A8 | Falta | `packages/media/src/session.ts` (`enableMicrophone`), `preview.ts` | P |
| B1 | Parcial | `Stage.tsx` | P–M |
| B6 | Parcial: a mídia aceita `deviceId`, o cliente nunca passa | `env.ts`, `client.ts`, lobby e sala | M |
| B12 | Falta; a segunda conexão da mesma pessoa derruba a primeira | rota nova, `packages/media` (par único de repasse), sala | M |
| B15 | Falta; capacidade fixa em três pontos | `room.ts`, `rooms.ts`, `client.ts`, textos | P–M |
| B16 | Falta; não há manifesto nem ícones | `apps/web/public`, `index.html` | P–M |
| Demais itens B | Falta | componentes da sala | P cada |
| Grupo C | Falta | pacotes novos | G cada (Discord: M) |

## Achados da revisão

1. **A versão 3 prometia áudio "só da janela", que o Chrome não tem.** Evidência: tabela de compatibilidade do
   MDN (`windowAudio`: só `exclude` e `system`). O que resolve o eco da própria sala é `restrictOwnAudio`, só
   no Windows e no macOS.
2. **Não havia como medir o áudio no lançamento**: a medição dependia do feedback, que estava no Grupo B. O
   dono manteve assim (D2); o risco está em R2.
3. **Celular como câmera custava uma entrega e até 9 Mbps de envio no 4G**: até 11 conexões por computador e 51
   na sala, não 12. Redesenhado (D20).
4. **A1 "quase pronto" era otimista**: estéreo e 128 kbps exigem editar o SDP, técnica marcada para bloqueio
   futuro. O dono optou por não editar (D3).
5. **A versão 3 contava como "já atende" o que não existe**: o aviso de IP (removido pelo dono na entrega 1) e
   a senha no link fixo.
6. **Desfoque de fundo não existe em nenhum navegador** (D22).
7. **A marca de 12 horas só cabia no cookie do convidado** (D10).
8. **Janelas de 10 minutos não cabem no limitador por IP**, que conta 10 ou 60 segundos (D6, B17).
9. **O dono não era reconhecido antes da senha na sala comum**: o token só ia depois da entrada (A4).
10. **Feedback "para contatar" não contatava ninguém**: a conta não guardava contato (D32).
11. **Moderador dependia do palco da entrega 4**, que não existe (D25).
12. **Achados do MVP fora do plano:** rota de informações da sala revelando Plus e contagem sem limite (corrigido
    no A4); reações, mão e microfone sem limite de frequência e limite do chat por conexão (D39); segunda aba
    com erro genérico (D40); reserva de 30 dias não aplicada em código (D34).

## Riscos

| # | Risco | Tratamento |
|---|---|---|
| R1 | Link fixo sem senha até o Grupo A | Aceito (D9) |
| R2 | `restrictOwnAudio` é dica, só existe no Windows e no macOS, e nada mede o resultado no lançamento | Aceito (D2); a interface explica; o feedback mede depois; o Desktop é a saída definitiva |
| R3 | Firefox e Safari sem áudio de tela | A3 avisa; o Desktop cobre |
| R4 | FPS do jogo cai em quem transmite | A7 dá a saída |
| R5 | Windows travando depois de horas compartilhando | Sem teste manual; acompanhar pelo Sentry e pelo feedback |
| R6 | Política do Discord e verificação do app | Só se descobre ao publicar; por isso a etapa é a última |
| R7 | Celular como câmera recodificado no computador pesa em máquina fraca | Vídeo do celular conta no limite da pessoa; medir pelo feedback |
| R8 | Login no app instalado no iPhone | Aceito; orientar o Safari se aparecer no feedback |
| R9 | Som da tela em mono a 32 kbps: música e jogo soam pobres na web | Aceito (D3); o Desktop entrega estéreo |
| R10 | Guardar e-mail aumenta a obrigação de LGPD e muda a promessa pública | Política e termos atualizados, novo aceite (D33), exclusão apaga |
| R11 | Senha gerada do link fixo é mostrada uma vez; quem perde precisa gerar outra | Botão de gerar nova na página do plano |
| R12 | Limites de frequência só na entrega 4: até lá uma pessoa pode encher uma sala direta de reações | Aceito (D39); o dono pode remover |
| R13 | Compartilhar tela no iPhone sem som pode frustrar | Aviso antes de compartilhar (D37) |

## Fora, com o motivo

| Pedido ou feature | Motivo |
|---|---|
| Transcrição ou gravação | O `DECISOES.md` proíbe |
| Plugins e temas da comunidade | Integrações de terceiros e moderação; o Plus mantém 6 temas |
| Crunchyroll e serviços com DRM | O DRM impede captura e retransmissão legítimas |
| Atividade do Discord completa | O Discord documenta que WebRTC não é suportado em atividades |
| Bot do Discord | Escopo e outra exceção à regra de integrações |
| Música ambiente, música sincronizada, arquivo local | Escopo e licença de música |
| 2K a 120 fps grátis | Acima de 1080p60 está fora do produto |
| Sala por nome livre | Gerou as invasões no concorrente |
| Mapa de salas com localização | Expõe a localização de quem cria a sala |
| Ferramentas na sala | Fora do problema central |
| Efeitos de rosto, troca e **desfoque** de fundo, reações por gesto | Pesam no computador de quem transmite; não há função nativa de desfoque (D22) |
| Microfone do celular | Reabre o eco |
| Passar o dono | O moderador cobre (D35) |
| Ocultar o indicador de volume | A sala não tem esse elemento (D36) |
| Estéreo e 128 kbps no som da tela, na web | Exige editar o SDP (D3); fica para o desktop |
| Denúncia e painel na sala direta | Revisar a cada 3 meses (D19) |

## O que já atende e não pode se perder (conferido no código)

| Queixa ou feature do concorrente | O que cobre hoje |
|---|---|
| Sala privada adivinhada pelo nome | Código de 10 caracteres aleatórios |
| "Faz a live ser P2P" | Sala direta em malha |
| Foto de perfil paga | Avatar do Google ou do Discord (foto própria só na entrega 4) |
| Sala fixa tipo canal | Link fixo do Plus, **sem senha** até o A4 |
| Celular: assistir, falar, chat | Entrega 1 |
| Sem login, chat, expulsar e banir | Entrega 1 |
| Conta para reservar o nome, login Google e Discord | Entrega 2 |

Não existe mais: o aviso de IP ao criar e ao entrar (removido pelo dono). O IP é citado nos termos e na
política; o modo protegido é da entrega 4.

## Parâmetros

| Parâmetro | Valor |
|---|---|
| Som da tela e da placa de captura | Sem processamento de voz; SDP não editado (mono, cerca de 32 kbps) |
| Teto do áudio da tela em conexão retransmitida | 64 kbps |
| Tamanho da senha | 4 a 64 caracteres |
| Erros de senha **[padrão]** | Espera de 5 s, dobrando a cada erro, teto de 15 min; zera após 10 min sem erro |
| Validade da marca anti-robô | 12 horas, para convidado e conta |
| Qualidades de quem transmite | Automática, 720p30, 480p30, 360p30, fluidez 15 fps; Plus também 1080p30 e 1080p60 |
| Limite de pessoas escolhido pelo dono na sala direta | 2 a 6 |
| QR do celular como câmera | 5 minutos, uso único; 1 celular por pessoa |
| Feedback | Após 2 minutos na sala; texto até 500 caracteres; **[padrão]** 5 envios por IP por minuto |
| Revisão da moderação na sala direta | A cada 3 meses |
| Período de medição | 3 meses depois do lançamento |

## O que mudou em relação à versão 3

| Item | Versão 3 | Versão 4 |
|---|---|---|
| Base | MVP pronto (entregas 0 a 4) | Escrito com as entregas 0 a 2 em produção |
| A2 | Áudio só da janela com `windowAudio` | `restrictOwnAudio` contra o eco da própria sala; "só o som do jogo" é do desktop |
| A1 e D3 | Opus estéreo a 128 kbps | Sem editar o SDP: mono, cerca de 32 kbps; teto de 64 kbps no TURN |
| D6 | 5 por sessão e 20 por IP a cada 10 min | Bloqueio crescente no Durable Object |
| D8 | Senha "ligada por padrão" no link fixo | Senha gerada ao virar Plus e mostrada ao dono |
| A4 | Dono volta com o token | Token enviado já na entrada; rota de informações com resposta neutra e limite |
| D10 | Marca no cookie assinado | Marca para convidado (cookie) e conta (tabela de sessões) |
| B17 | Vínculo com a conta "para contatar", sem contato guardado | Idem, com o e-mail guardado (D32) |
| B12 e D20 | Aparelho extra na malha, fora do limite de pessoas | Celular conecta só ao computador da pessoa, que repassa |
| B18 e D25 | Grupo B, papel só na sala | Dentro da entrega 4; permanente na sala de link fixo |
| B13 | Condicional à função do navegador | Fora |
| B3 e B7 | No Grupo B | Fora |
| B19 | Não existia | Compartilhar tela no celular onde o navegador deixa |
| Ordem do Grupo A | A propor | A3, A2, A8, A7, A1, A6, A4, A5 |
| Ordem do Grupo B | A propor | Tabela deste documento |
| Ordem do Grupo C | A propor; Desktop sobe se houver eco | Desktop, assistir junto, Android, Discord |
| Antes da entrega 3 | Nada entrava antes do fim do MVP | E-mail da conta com novo aceite; mensagem da segunda aba |
| Regras novas | — | Novo aceite a cada versão dos termos; @nome da conta para sempre; limites de frequência na entrega 4 |

## Fontes técnicas consultadas (2026-11-14)

- `getDisplayMedia`, `windowAudio`, `systemAudio`, `selfBrowserSurface`: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [dados de compatibilidade do MDN](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/MediaDevices.json), [notas do Chrome 141](https://developer.chrome.com/release-notes/141), [controles de compartilhamento do Chrome](https://developer.chrome.com/docs/web-platform/screen-sharing-controls), [especificação](https://w3c.github.io/mediacapture-screen-share/).
- `restrictOwnAudio`: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/restrictOwnAudio), [Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/5SZfg29iwPc).
- Áudio de tela no Firefox e no Safari: [Bugzilla 1541425](https://bugzilla.mozilla.org/show_bug.cgi?id=1541425), [caniuse](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support).
- Opus no WebRTC: [código do libwebrtc](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_coding/codecs/opus/audio_encoder_opus.cc), [remoção de edição de SDP](https://searchfox.org/firefox-main/source/third_party/libwebrtc/g3doc/todo/sdp-munging.md), [w3c/webrtc-extensions #63](https://github.com/w3c/webrtc-extensions/issues/63).
- Ganho automático e `applyConstraints`: [código do Blink](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/modules/mediastream/apply_constraints_processor.cc).
- `setSinkId`: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId), [Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/), [WebKit 320087](https://bugs.webkit.org/show_bug.cgi?id=320087).
- Desfoque de fundo: [chromestatus](https://chromestatus.com/api/v0/features/5077577782263808), [blog do Chrome](https://developer.chrome.com/blog/background-blur).
- Tela cheia no iPhone: [dados de compatibilidade do MDN](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Element.json), [WebKit 212934](https://bugs.webkit.org/show_bug.cgi?id=212934).
- Instalação de PWA: [web.dev](https://web.dev/articles/install-criteria), [Chrome](https://developer.chrome.com/blog/update-install-criteria), [Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).
- Turnstile: [validação no servidor](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [configurações do widget](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/), [pre-clearance](https://developers.cloudflare.com/turnstile/concepts/pre-clearance-support/).
- Atividades do Discord: [rede](https://docs.discord.com/developers/activities/development-guides/networking), [como funcionam](https://docs.discord.com/developers/activities/how-activities-work); medida da ANPD de 12/08/2026: [Agência Gov](https://agenciagov.ebc.com.br/noticias/202608/em-medida-preventiva-anpd-determina-que-discord-suspenda-transmissoes-ao-vivo).
- YouTube e Twitch: [IFrame API](https://developers.google.com/youtube/iframe_api_reference), [funcionalidade mínima exigida](https://developers.google.com/youtube/terms/required-minimum-functionality), [Twitch Embed](https://dev.twitch.tv/docs/embed/everything/).
- Limites da malha: [código do Chromium](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/modules/peerconnection/rtc_peer_connection.cc), [BlogGeek](https://bloggeek.me/webrtc-p2p-mesh/).

Não confirmado em fonte primária: áudio de sistema no Chrome do macOS (só teste de terceiros); se o Chrome
respeita teto de taxa em áudio (relato indireto; o aceite do A1 testa isso com dublê); comportamento atual do
login em app instalado no iPhone; placas de captura nos navegadores.
