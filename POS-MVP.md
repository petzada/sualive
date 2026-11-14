# Próximas etapas depois do MVP

Versão 3, de 2026-11-14. Documento único de decisões pós-MVP. Junta e substitui o `POS-MVP-OBJECOES.md`
(versão 2) e o `POS-MVP-FEATURES.md` (versão 2). Complementa o `DECISOES.md`; **não o altera**.

Fontes deste documento:

| Arquivo | Conteúdo |
|---|---|
| `objecoes.md` | 78 comentários do público do concorrente (Go Live), de 18/ago a 29/out de 2026 |
| `analise-objecoes.md` | Objeções por tema, pedidos, reclamações e cruzamento com o `DECISOES.md` |
| `features.md` | 47 features anunciadas pelo desenvolvedor do concorrente no mesmo período |
| `analise-features.md` | Features por tema e por fase, as que responderam a objeções e cruzamento com o `DECISOES.md` |

Referências: `19.5` é o item 5 de 19/ago em `objecoes.md`; `F25.2` é o item 2 de 25/ago em `features.md`.

## Quando e como usar

1. **Fim do MVP:** entregas 0 a 4 concluídas, como está no `DECISOES.md`. Nada deste arquivo entra antes.
2. **Revisão pós-MVP:** a sessão que implementou o MVP revisa este documento contra o código, de forma
   adversarial, e propõe a ordem dos grupos B e C. As mudanças de decisão viram perguntas ao dono do produto.
3. **Grupo A:** condição para abrir ao público.
4. **Lançamento público.**
5. **Grupo B**, na ordem proposta pela revisão.
6. **Grupo C**, na ordem proposta pela revisão.
7. **Etapas que já estavam no `DECISOES.md`** (Social, Fase 2, Doação), com os acréscimos daqui.

Para o agente que implementar:

- Antes de codar um item, responda: situação no código (feito, parcial, falta), onde está e o esforço.
- Em conflito com o `DECISOES.md`, vale o `DECISOES.md`. Pare e pergunte.
- Valores novos vão para `packages/config`.
- Continuam valendo: o servidor decide, nenhum segredo no front, nada gravado, nenhum código do
  concorrente, nenhuma API de navegador usada de memória (confira a documentação da versão).
- Itens marcados **[padrão]** ainda não foram confirmados pelo dono do produto. Todos os outros foram.

## Estado observado na `main`

Commit `b1c809e` (entregas 0 a 2), só leitura:

| Item | Situação |
|---|---|
| A1 Som da tela sem processamento | **Quase pronto.** `packages/media/src/session.ts` captura sem cancelamento de eco, sem supressão e sem ganho, em estéreo, com `contentHint = "music"`. Falta fixar Opus estéreo a 128 kbps. |
| A2 `windowAudio`, `restrictOwnAudio`, `selfBrowserSurface` | Falta. Não aparecem no código. |
| A4 Senha de sala | Falta. |
| A6 Turnstile | Falta. Verificado a cada criação e entrada (`apps/api/src/rooms.ts`). |
| A8 Ganho do microfone | Ligado, sem opção de desligar. |
| B6 Microfone e câmera | A camada de mídia já aceita `deviceId`; falta a interface. Saída de áudio (`setSinkId`) não existe. |
| B12 Celular como câmera | Bloqueio: uma segunda conexão do mesmo participante derruba a primeira (`apps/api/src/room.ts`, "replaced"). |
| Link fixo do Plus | Existe (`apps/api/src/rooms.ts`, sala `fixed`), sem senha. |
| Tela cheia, sons, PWA, links clicáveis | Não existem. |

---

## Decisões

| # | Decisão | Origem |
|---|---|---|
| D1 | Áudio: a **web resolve primeiro**, com as opções do Chrome 141 | Objeções |
| D2 | **Sem spike manual de áudio.** Pedir as opções sempre que o navegador declarar suporte e medir pelo feedback (B17) | Revisão v3 |
| D3 | Som da tela e da placa de captura: sem processamento, Opus estéreo a 128 kbps | Objeções |
| D4 | Sem áudio (Firefox, Safari ou captura muda): avisar antes e depois de compartilhar | Objeções |
| D5 | Senha de sala opcional, grátis, guardada só como hash, de 4 a 64 caracteres, sem sala de espera | Objeções |
| D6 | Tentativas de senha: 5 por sessão e 20 por IP, a cada 10 minutos | Objeções |
| D7 | Sala com senha mostra só "sala com senha", sem número de pessoas, também na prévia do link | Objeções |
| D8 | Link fixo do Plus: endereço `/@nome` mantido, senha ligada por padrão. Senha e limite de pessoas ficam guardados junto ao link fixo | Objeções e revisão v3 |
| D9 | Link fixo sem senha entre a entrega 2 e o fim do MVP: risco aceito, porque ninguém usa antes | Objeções |
| D10 | Turnstile: marca de 12 horas no cookie de sessão assinado dispensa novas verificações | Objeções |
| D11 | Qualidade menor por quem transmite: Automática, 720p30, 480p30, 360p30 e "fluidez 15 fps"; Plus também 1080p30 e 1080p60 | Objeções |
| D12 | Ganho automático do microfone ligado, com opção de desligar | Objeções |
| D13 | Tela cheia com chat; no iPhone, modo "vídeo grande" | Objeções |
| D14 | Grupo A antes de abrir ao público, com os 8 itens; Grupo B depois. A ordem interna de cada grupo é proposta pela revisão pós-MVP | Revisão v3 |
| D15 | Discord: a atividade é só um **lançador** da nossa sala | Objeções |
| D16 | Exceção "atividade do Discord" à regra "fora do produto: integrações de terceiros", registrada só quando a etapa começar | Objeções |
| D17 | Grupo C sem ordem fixa: a revisão pós-MVP propõe. Se o feedback mostrar eco ou falta de áudio frequentes, o Desktop sobe | Revisão v3 |
| D18 | Console: botão "Transmitir console" com placa de captura, no Grupo B, só no computador | Objeções |
| D19 | Moderação da sala direta (denúncia e painel): manter como está e revisar a cada 3 meses | Objeções |
| D20 | Celular como câmera por QR Code, só câmera; o aparelho extra **não** conta no limite de pessoas | Features e revisão v3 |
| D21 | Assistir junto: só YouTube e Twitch. Sem arquivo local, sem música sincronizada, sem música ambiente | Objeções e features |
| D22 | Câmera: desfoque de fundo só onde o navegador deixa o site ligar e desligar | Features |
| D23 | Instalar como app (PWA): Grupo B, sem cache offline, com teste de login no iPhone | Features e revisão v3 |
| D24 | Chat: links `http` e `https` clicáveis para quem pode escrever; menções escolhidas na lista de quem está na sala | Features e revisão v3 |
| D25 | Moderador com papel fixo em **todas** as salas; cargos configuráveis na etapa Social | Features e revisão v3 |
| D26 | Limite de pessoas escolhido pelo dono na sala direta, de 2 a 6 | Features |
| D27 | Sons de aviso: entrada e início de transmissão só em salas de até 6 pessoas | Features |
| D28 | Feedback ao sair da sala; vinculado à conta de quem tem conta | Features e revisão v3 |
| D29 | Qualidade grátis: manter 720p30 e medir nos 3 primeiros meses depois do lançamento | Features |
| D30 | Ligar para amigo: etapa Social, depois do Android e da notificação web | Features |
| D31 | Descrição e categoria da sala pública: Fase 2, junto do destaque na vitrine | Features |

---

## Grupo A: condição para abrir ao público

### A1. Som da tela sem processamento

- **Evidência:** som "abafado" (19.5, 28.1); supressão de ruído do concorrente (F19.4).
- **Regra:** a faixa de áudio da tela sai sem cancelamento de eco, supressão de ruído e ganho automático,
  em Opus estéreo a 128 kbps. O microfone continua com os três ligados.
- **No código:** só falta fixar estéreo e 128 kbps na negociação.
- **Custo:** numa sala de 6, quem transmite envia 5 × 128 kbps = 640 kbps de áudio, na malha, sem custo nosso.
- **Aceite:** música tocada no computador chega estéreo e sem o efeito abafado.

### A2. Fim do eco e áudio só da janela

- **Evidência:** 26 comentários, a maior objeção (15 pedem só a janela, 18 relatam eco). O concorrente só
  resolveu no app desktop (F27.1), e a queixa continuou no navegador até 29/out.
- **Regra:**
  1. Pedir `windowAudio: "window"` e `restrictOwnAudio` sempre que `getSupportedConstraints()` declarar
     suporte. Os dois são dicas: o navegador pode ignorar.
  2. Antes de confirmar, a interface explica em uma linha: **janela** leva só o som dela (onde o
     navegador permite), **aba** leva só o som da aba, **tela inteira** pode levar o sistema todo.
  3. Onde a separação não estiver disponível e a conversa for no Discord, dizer isso e indicar a saída:
     transmitir uma janela ou uma aba, ou falar pela voz da sala.
- **Sem spike manual (D2):** o resultado real se mede pelo feedback (B17), por navegador.
- **Aceite automatizado:** com as opções declaradas, o pedido de captura as inclui; sem elas, não inclui
  e a interface mostra o aviso do passo 3.

### A3. Aviso de áudio ausente, antes e depois

- **Evidência:** 20.4, 24.5, 25.6, 30.5.
- **Regra:** em Firefox e Safari, ao clicar em compartilhar, avisar que não haverá som e sugerir Chrome
  ou Edge. Se a captura voltar sem faixa de áudio, avisar na hora, com o que tentar.
- **Aceite:** no Firefox, o aviso aparece antes; no Chrome, compartilhar sem marcar o áudio mostra o aviso depois.

### A4. Senha de sala

- **Evidência:** 6 pedidos (18.1, 18.2, 19.4, 20.3, 22.1, 25.1), auditoria do código do concorrente (24.1)
  e relatos de insegurança (21.1, 21.2). No concorrente, as invasões vinham da sala por nome livre (F18.2)
  e pararam com o código (F25.2).
- **Regra:**
  - O dono liga, troca ou desliga a senha a qualquer momento. Grátis, em todos os níveis.
  - Com senha, quem abre o link digita a senha antes da prévia de microfone e câmera.
  - O servidor valida. O erro não dá pista da senha. Só hash com sal.
  - Sala comum: senha no Durable Object. Sala de link fixo: senha guardada junto ao link fixo, no D1 (D8).
  - 5 erros por sessão e 20 por IP a cada 10 minutos. Senha de 4 a 64 caracteres.
  - A rota de informações e a prévia do link dizem só "sala com senha", sem número de pessoas.
  - Trocar a senha não derruba ninguém. O dono que volta com o token não digita a senha. Sem sala de espera.
  - Link fixo do Plus nasce com senha ligada; o dono pode desligar, com aviso.
- **Aceite:** testes no Durable Object: sem senha recusa, 6ª tentativa errada recusa, senha certa entra,
  troca não derruba ninguém, a rota de informações não revela a contagem.

### A5. Tela cheia com chat

- **Evidência:** 27.2, 30.2, 30.3, 18.6; foco e hiperfoco do concorrente (F25.3).
- **Regra:** o vídeo em destaque tem botão de tela cheia, com o chat por cima, legível e com envio. No
  iPhone, o mesmo botão ativa o modo "vídeo grande": o vídeo ocupa a página e o chat fica por cima.
- **Aceite:** ler e enviar mensagem em tela cheia no computador e no Android, e no modo vídeo grande no iPhone.

### A6. Turnstile sem repetição

- **Evidência:** 22.6 ("pediu 5 vezes em 10 minutos").
- **Regra:** o token do Turnstile vale 5 minutos e só uma vez. Depois que passa, o servidor grava no cookie
  de sessão assinado uma marca "verificado até", de 12 horas. Com a marca válida, criar ou entrar não pede
  verificação. O limite de requisições por IP continua.
- **Aceite:** entrar em 5 salas em 10 minutos pelo mesmo navegador pede uma única verificação.

### A7. Quem transmite escolhe qualidade menor

- **Evidência:** 24.2 (FPS do jogo cai), 18.5; seletor do concorrente (F19.7).
- **Regra:** Automática, 720p30, 480p30, 360p30 e "fluidez 15 fps", sempre até o teto do plano. O Plus vê
  também 1080p30 e 1080p60. Sem escolha de codec e sem controle por espectador.
- **Aceite:** conta gratuita escolhe 480p30 e o outro lado recebe nessa qualidade.

### A8. Ganho automático do microfone desligável

- **Evidência:** 07/09.2 ("abaixando o volume do microfone do nada").
- **Regra:** ligado por padrão; a pessoa desliga nas configurações de áudio da sala. A ajuda explica quando.
- **Aceite:** desligar faz o microfone parar de mudar de volume sozinho.

---

## Grupo B: depois do lançamento

Sem ordem fixa: a revisão pós-MVP propõe (D14).

| # | Item | Evidência | Regra |
|---|---|---|---|
| B1 | Organização do vídeo | 18.7, 25.7, 27.1; F25.3 | Testar a sala com 2, 3 e 4 vídeos; se o destaque desperdiçar espaço, a grade se ajusta. Focar numa tela sem tela cheia. |
| B2 | Esconder painéis | 13/09.1 | Botão para esconder as barras laterais. |
| B3 | Ocultar o indicador de volume | 21.7 | Opção para esconder a barra de volume. |
| B4 | Volume por espectador | 18.4; F19.2 | Cada pessoa ajusta o volume de cada transmissão na própria tela. |
| B5 | Tapar a própria prévia | 22.4 | Botão para esconder a própria transmissão, mais `selfBrowserSurface: "exclude"`, para o navegador não oferecer a própria aba. |
| B6 | Escolher microfone, câmera e saída de áudio | 20.2; F22.4 | Seletor na prévia de entrada e dentro da sala. Saída com `setSinkId`, mostrada só onde o navegador tiver a função (Safari incerto). |
| B7 | Passar o dono | 07/09.1 | O dono transfere o papel a outro participante. |
| B8 | Sons de aviso | 30.4; F20.7 | Mensagem (só com a aba fora de foco), menção, entrada na sala e início de transmissão, cada um ligável. Entrada e transmissão só em salas de até 6 pessoas; na grande e na pública, menção e, para dono e moderadores, mão levantada. |
| B9 | Vídeo em pé no celular | 29/10.2 | Na vertical, o vídeo ocupa a tela toda, sem bordas pretas. |
| B10 | Expiração explicada | 19.8 | Texto na sala: "a sala fecha 5 minutos depois que todos saem". |
| B11 | Transmitir console | 27.5 | Ver abaixo. |
| B12 | Celular como câmera | F29/10.1 | Ver abaixo. |
| B13 | Desfoque de fundo | F29/10.2 | Botão só quando a capacidade `backgroundBlur` da câmera tem os dois valores (o site liga e desliga; pela documentação de 2023, só no Windows). Nenhum processamento nosso. A API saiu como teste de origem no Chrome 114 a 117: confirme o estado atual; se não existir, o item sai. |
| B14 | Links e menções no chat | F20.5, F25.4 | Ver abaixo. |
| B15 | Limite de pessoas na sala direta | F30.4 | O dono escolhe de 2 a 6, ao criar ou dentro da sala. O Durable Object recusa acima do limite. Baixar não expulsa ninguém. Na sala de link fixo, guardado junto ao link fixo (D8). |
| B16 | Instalar como app (PWA) | F20.4; 28.2, 28.3 | Ver abaixo. |
| B17 | Feedback ao sair da sala | D2, D29 | Ver abaixo. |
| B18 | Moderador | F26.2; 03/09.3 | Em todas as salas, o dono promove participantes a moderador. O moderador silencia, remove, bane e, onde há palco, tira do palco. Não chama ao palco, não promove outros e não encerra a sala. Papel guardado no Durable Object e verificado pelo servidor. |

### B11. Transmitir console

- Botão "Transmitir console" na sala, só no computador.
- A pessoa escolhe a placa de captura. O vídeo entra como um vídeo dela, com perfil de fluidez.
- O áudio da placa vai numa faixa separada, com a regra do A1. A voz continua no microfone normal.
- Conta como 1 vídeo e segue a qualidade do plano. O Plus pode ter console e webcam ao mesmo tempo.
- Recomendar fone de ouvido. Sem guia para PS Remote Play ou app do Xbox.
- **Aceite:** com uma placa USB comum, o outro participante vê o jogo e ouve o som do jogo e a voz,
  separados e sem eco.

### B12. Celular como câmera

- No computador, "usar o celular como câmera" mostra um QR Code com token de uso único, válido por
  5 minutos, ligado à sessão e à sala. Gerado e validado pelo servidor. O token dispensa o Turnstile no celular.
- **Só câmera.** O microfone do celular reabriria o eco.
- **Identidade de aparelho:** hoje a segunda conexão do mesmo participante derruba a primeira. O celular
  entra como aparelho extra, com identificador próprio em `packages/protocol`, no Durable Object e em
  `packages/media`. Esforço M a G.
- O aparelho extra só envia vídeo: não recebe mídia, não aparece na lista de pessoas e não tem chat.
- Limites: o vídeo conta nos vídeos da pessoa e no teto de 4 da sala; **1 aparelho extra por pessoa**; o
  aparelho **não** conta no limite de pessoas (D20; ver risco R7).
- Qualidade do plano da pessoa, não 4K. Aviso de consumo de dados no 4G; recomendar Wi-Fi.
- Sair da sala no computador desconecta o celular.
- **Aceite:** o vídeo do celular aparece como da pessoa; o computador continua conectado; QR usado ou
  vencido não entra; o 2º aparelho extra da mesma pessoa é recusado.

### B14. Links e menções no chat

- Só `http` e `https` viram link; abrem em aba nova com `rel="noopener noreferrer"`; sem prévia.
- Clicáveis para todos que podem escrever. Em sala grande e pública, o domínio aparece ao lado.
- Digitar `@` abre a lista de quem está na sala; a mensagem guarda o identificador do participante e
  mostra o apelido. Validado pelo esquema de `packages/protocol`: só vale menção a quem está na sala.
- Quem é mencionado vê a mensagem destacada e ouve o som de menção (B8).

### B16. Instalar como app (PWA)

- Manifesto com nome, ícones e cores dos tokens do `DESIGN.md`; o navegador oferece "instalar".
- Sem cache offline: o app sempre carrega a versão publicada. O Chrome não exige service worker para
  instalar pelo menu desde a versão 108 (celular) e 112 (computador); confira os critérios atuais.
- **Risco:** no iPhone, o app instalado tem cookies separados dos do Safari, e o login com Google ou
  Discord pode não voltar ao app. Sem correção simples, o app do iPhone orienta entrar pelo Safari.
- **Aceite:** no Chrome do Windows e do Android e no Safari do iPhone, instala, abre em janela própria com
  a versão do último deploy, e o login com Google e com Discord termina dentro do app.

### B17. Feedback ao sair da sala

- Ao sair de uma sala em que ficou ao menos 2 minutos, pergunta opcional "Como foi a qualidade?", de 1 a 5,
  com texto de até 500 caracteres. Fechar sem responder não pergunta de novo na mesma sessão.
- Guardar: nota, texto, tipo de sala, plano, navegador, data e, **para quem tem conta, o vínculo com a
  conta**, para poder contatar. Sem conta: anônimo. O IP serve só ao limite, em hash temporário.
- Uma tabela nova no D1 (só adiciona) e uma rota com limite de 5 envios por IP a cada 10 minutos.
- A política de privacidade passa a citar a coleta e a finalidade. Excluir a conta apaga o vínculo.
- **Aceite:** responder grava uma linha; ignorar não grava nada; o 6º envio em 10 minutos é recusado.

---

## Grupo C: etapas do pós-MVP

Sem ordem fixa (D17). A revisão pós-MVP propõe a ordem; se o feedback dos 3 primeiros meses mostrar eco
ou falta de áudio frequentes, o Desktop sobe.

### Desktop (Electron)

- Áudio só do processo ou da janela, sem eco, inclusive no macOS e para quem usa Firefox ou Safari.
- Sobreposição (13/09.5), atalhos globais e atualização automática, como já está no `DECISOES.md`.

### Atividade do Discord (lançador)

- **O que é:** uma atividade que, de dentro de um canal de voz do Discord, cria ou abre uma sala nossa e
  leva os participantes ao navegador com um clique. A conversa pode continuar no Discord.
- **O que não é:** voz, vídeo ou tela rodando dentro do Discord: registrado como **inviável**, porque o
  proxy das atividades não suporta WebRTC e o iframe deve bloquear a captura de tela (fontes de terceiros;
  confirme na documentação atual antes da etapa).
- **Infra:** registro do app no Discord e um endpoint para criar e abrir a sala. Reaproveita o login com
  Discord da entrega 2. Nenhuma mudança na mídia.
- **Antes de começar:** alterar no `DECISOES.md` a regra de integrações de terceiros, com aprovação do dono.
- **Risco:** se a regra que bloqueou as transmissões do Discord no Brasil alcançar atividades, a
  publicação pode ser recusada.

### Android (Capacitor)

- Transmitir a tela do celular e manter a chamada em segundo plano (19.7, 13/09.2, 13/09.3; F01/09.1).

### YouTube e Twitch, assistir junto

- Sincroniza o player oficial de cada plataforma para todos na sala; não retransmite (F24.1, F25.1).
- Playlist do YouTube (27.4). Sem Crunchyroll nem outro serviço com DRM.

## Acréscimos às etapas que já estavam no `DECISOES.md`

| Etapa | Acréscimo |
|---|---|
| Social | Lista de amigos (30.6) e "app para sair do Discord" (28.2, 28.3) reforçam a etapa |
| Social | Cargos e permissões configuráveis, junto dos grupos permanentes; o moderador do B18 vira um dos cargos (D25) |
| Social | Ligar para amigo, depois do Android e da notificação web do PWA. Infra: Web Push, com as chaves nos segredos do Worker (D30) |
| Fase 2 | Descrição curta e categoria de lista fixa na sala pública, junto do destaque na vitrine, passando pelo filtro e pelo classificador (D31) |

## Métricas dos 3 primeiros meses depois do lançamento

| Métrica | Fonte | Decide |
|---|---|---|
| Conversão de conta gratuita em Plus | D1 | Qualidade grátis (D29) |
| Nota e texto do feedback por plano | B17 | Qualidade grátis (D29) |
| Nota e texto do feedback por navegador, citando eco ou falta de som | B17 | Posição do Desktop (D17) |

Ao fim do período, levar os números ao dono do produto. Nada muda antes.

---

## Fora, com o motivo

| Pedido ou feature | Ref. | Motivo |
|---|---|---|
| Transcrição ou gravação | 03/09.1 | O `DECISOES.md` proíbe gravar e transcrever |
| Plugins e temas da comunidade | 03/09.2; F13/09.3 | Integrações de terceiros e moderação; o Plus mantém 6 temas |
| Crunchyroll e serviços com DRM | 26.1 | O DRM impede captura e retransmissão legítimas |
| Atividade do Discord completa | 19.3, 21.8, 22.5 | Proxy sem WebRTC e iframe sem captura; vira lançador |
| Bot do Discord | F22.1 | Escopo e outra exceção à regra de integrações. É viável: um Durable Object manteria a conexão com o Discord |
| Música ambiente, música sincronizada, arquivo local | 25.9; F30.1, F30.3 | Escopo e licença de música. Tocar um vídeo numa aba e compartilhar a aba já funciona |
| 2K a 120 fps grátis | F20.1 | Acima de 1080p60 está fora do produto; o grátis segue 720p30 e se mede (D29) |
| Sala por nome livre | F18.2 | Gerou as invasões no concorrente; nós usamos código aleatório |
| Mapa de salas com localização | F26.1, F30.6 | Expõe a localização de quem cria a sala, inclusive de quem não tem conta |
| Ferramentas na sala | F17/10.1 | Fora do problema central; nenhuma objeção pediu |
| Efeitos de rosto, troca de fundo própria, reações por gesto | F29/10.2, F29/10.3 | Pesam no computador de quem transmite (risco 2 do `DECISOES.md`) |
| Microfone do celular | F29/10.1 | Reabre o eco |
| Guia de PS Remote Play / Xbox | — | Decidido não documentar |
| Denúncia e painel na sala direta | 03/09.3 | Revisar a cada 3 meses (D19); o moderador do B18 já ajuda |

## Riscos

| # | Risco | Tratamento |
|---|---|---|
| R1 | Link fixo sem senha da entrega 2 ao fim do MVP | Aceito: ninguém usa antes (D9) |
| R2 | `windowAudio` e `restrictOwnAudio` são dicas e podem não funcionar em algum sistema, sem teste manual (D2) | A interface explica; o feedback mede; o Desktop sobe se preciso (D17) |
| R3 | Firefox e Safari sem áudio de tela | A3 avisa antes; o Desktop cobre depois |
| R4 | FPS do jogo cai em quem transmite (24.2, 22.2) | Risco 2 do `DECISOES.md`; A7 dá a saída |
| R5 | Windows travando depois de horas compartilhando (22.2) | Sem teste manual; acompanhar pelo feedback e pelo Sentry |
| R6 | Política do Discord para atividades | Descobre-se ao publicar o lançador |
| R7 | Celular-câmera fora do limite de pessoas: a malha pode chegar a 12 conexões (6 pessoas e 6 celulares), acima do testado na entrega 1 | Aceito pelo dono; o aparelho só envia e o vídeo segue no teto de 4; medir pelo feedback |
| R8 | Login com Google e Discord no PWA do iPhone | Aceite do B16; orientar o Safari se falhar |
| R9 | API de desfoque pode não existir mais | B13 sai se não existir |

## O que já atende e não pode se perder

| Queixa ou feature do concorrente | O que já cobre |
|---|---|
| Sala privada adivinhada pelo nome (F18.2) | Código de 10 caracteres aleatórios (entrega 1) |
| IP exposto | Aviso ao criar e entrar; modo protegido (entrega 4) |
| "Faz a live ser P2P" | Sala direta em malha (entrega 1) |
| Foto de perfil paga | Avatar do Google ou do Discord; foto própria para quem tem conta (entrega 4) |
| Sala fixa tipo canal | Link fixo Plus (entrega 2), com senha por padrão (A4) |
| Celular: assistir, falar, chat | Entrega 1 |
| Sem login, chat, expulsar e banir (F18.1, F19.1, F30.2) | Entrega 1 |
| Conta para reservar o nome, login Google e Discord (F19.5, F22.3) | Entrega 2 |
| Lista de salas públicas, mais de 20 pessoas (F19.6, F22.2) | Entrega 4 |

## Parâmetros novos

| Parâmetro | Valor |
|---|---|
| Som da tela e da placa de captura | Opus estéreo, 128 kbps, sem processamento |
| Tentativas erradas de senha | 5 por sessão e 20 por IP, a cada 10 minutos |
| Tamanho da senha | 4 a 64 caracteres |
| Validade da marca anti-robô | 12 horas, no cookie de sessão assinado |
| Qualidades de quem transmite | Automática, 720p30, 480p30, 360p30, fluidez 15 fps; Plus também 1080p30 e 1080p60 |
| Limite de pessoas escolhido pelo dono na sala direta | 2 a 6 |
| QR do celular como câmera | 5 minutos, uso único |
| Aparelhos extras | 1 por pessoa; não contam no limite de pessoas |
| Feedback | após 2 minutos na sala; texto até 500 caracteres; 5 envios por IP a cada 10 minutos |
| Revisão da moderação na sala direta | A cada 3 meses |
| Período de medição | 3 meses depois do lançamento |

## O que mudou em relação às versões 2

| Item | Antes | Agora |
|---|---|---|
| Documentos | `POS-MVP-OBJECOES.md` e `POS-MVP-FEATURES.md` | Um só, este |
| Spike de áudio S1 | Teste manual em Windows e macOS, decidia a ordem do Grupo C | Removido; opções pedidas quando declaradas, resultado medido pelo feedback (D2) |
| Ordem do Grupo C | Duas ordens fixas, conforme o S1 | Proposta pela revisão pós-MVP; o Desktop sobe se o feedback mostrar eco (D17) |
| Ordem dos grupos A e B | Fixa por número de comentários | Proposta pela revisão pós-MVP (D14) |
| A1 | Falta | Quase pronto na `main`; falta 128 kbps |
| Celular-câmera | Contava no limite de pessoas | Não conta; 1 por pessoa; risco R7 |
| Moderador | Só nas salas no servidor | Em todas as salas |
| Links no chat | Em sala pública, só de quem tem conta | Para todos que podem escrever; domínio visível em sala grande e pública |
| Feedback | Anônimo | Vinculado à conta de quem tem conta |
| Senha e limite da sala fixa | Senha no link fixo; limite **[padrão]** | Os dois guardados junto ao link fixo, confirmado |
| Valores **[padrão]** | QR, aparelho extra, cache do PWA, feedback, moderador, sala fixa | Todos confirmados ou trocados pelo dono |

## Fontes técnicas consultadas

- [Chrome 141, notas de versão](https://developer.chrome.com/release-notes/141): `restrictOwnAudio` e `windowAudio`.
- [MDN, getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia): `windowAudio`, `systemAudio`, `selfBrowserSurface`.
- [caniuse, áudio no getDisplayMedia](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support): sem suporte em Firefox e Safari.
- [Turnstile, validação no servidor](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/): token de 300 segundos e uso único.
- [Discord, como as atividades funcionam](https://discord.com/developers/docs/activities/how-activities-work) e [guia do proxy (Robo.js)](https://robojs.dev/discord-activities/proxy).
- [Chrome, critérios de instalação](https://developer.chrome.com/blog/update-install-criteria) e [MDN, PWAs instaláveis](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Installable_PWAs).
- [Chrome, desfoque do fundo da câmera](https://developer.chrome.com/blog/background-blur).
- [MDN, setSinkId](https://developer.mozilla.org/docs/Web/API/HTMLMediaElement/setSinkId) e [caniuse](https://caniuse.com/mdn-api_htmlmediaelement_setsinkid).
