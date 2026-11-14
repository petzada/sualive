# Pós-MVP guiado pelas objeções do público

Versão 2, de 2026-11-14, revisada de forma adversarial. Complementa o `DECISOES.md`, **não o substitui
nem o altera**. Origem: `analise-objecoes.md`, que conta 78 comentários de usuários do concorrente
(Go Live) entre 18/agosto e 29/outubro de 2026 (`objecoes.md`).

## Quando e como usar

Ninguém usa o produto antes de o MVP (entregas 0 a 4) terminar. A sequência é:

1. **Fim do MVP:** entrega 4 concluída, como está no `DECISOES.md`. Nada deste arquivo entra antes.
2. **Spike de áudio (S1):** meio dia, em branch própria. Define o A2 e a posição do desktop.
3. **Grupo A:** condição para abrir ao público.
4. **Lançamento público.**
5. **Grupo B**, depois as **etapas do Grupo C** na ordem definida pelo spike.

Para o agente que implementar:

- Antes de codar, responda numa tabela, para cada item de S1 e do Grupo A: situação no código (feito,
  parcial, falta), onde está e o esforço estimado. Não implemente nada antes dessa resposta.
- Em conflito entre este arquivo e o `DECISOES.md`, vale o `DECISOES.md`. Pare e pergunte.
- Valores novos vão para `packages/config`, como manda o documento principal.
- As regras gerais continuam: o servidor decide, nenhum segredo no front, nada gravado, nenhum código
  do concorrente, nenhuma API de navegador usada de memória (confira a documentação da versão).

## Decisões

| # | Decisão |
|---|---|
| D1 | Áudio: a **web resolve primeiro** com as opções novas do Chrome 141; o spike decide a posição do desktop |
| D2 | Spike de áudio logo após o MVP, antes do resto do Grupo A |
| D3 | Áudio da tela e da placa de captura: sem processamento, Opus estéreo a 128 kbps |
| D4 | Sem áudio (Firefox, Safari ou captura muda): avisar antes e depois de compartilhar |
| D5 | Senha de sala opcional, grátis, guardada no Durable Object, de 4 a 64 caracteres, sem sala de espera |
| D6 | Tentativas de senha: 5 por sessão e 20 por IP, a cada 10 minutos |
| D7 | Sala com senha mostra só "sala com senha", sem número de pessoas, também na prévia do link |
| D8 | Link fixo do Plus: endereço `/@nome` mantido, **senha ligada por padrão** |
| D9 | Link fixo sem senha entre a entrega 2 e o fim do MVP: risco aceito, porque ninguém usa antes |
| D10 | Turnstile: depois de passar, uma marca de 12 horas no cookie de sessão assinado dispensa novas verificações |
| D11 | Qualidade menor por quem transmite: Automática, 720p30, 480p30, 360p30 e "fluidez 15 fps", sempre até o teto do plano |
| D12 | Ganho automático do microfone continua ligado, com opção de desligar |
| D13 | Tela cheia com chat; no iPhone, modo "vídeo grande" que ocupa a página com o chat por cima |
| D14 | Grupo A antes de abrir ao público; Grupo B depois |
| D15 | Discord: o problema a resolver é conversar no Discord e transmitir pelo nosso site sem eco; a atividade é só um **lançador** |
| D16 | Exceção "atividade do Discord" ao "fora do produto: integrações de terceiros", registrada só quando a etapa começar |
| D17 | YouTube e Twitch "assistir junto" desvinculado do desktop |
| D18 | Console: botão "Transmitir console" com placa de captura, no Grupo B, só no computador |
| D19 | Moderação na sala direta: manter como está e revisar a cada 3 meses |
| D20 | Música ambiente: fora |

## O que o código em andamento já mostra

Observado na branch `entrega/1` (commit `04e9e31`), só leitura:

- A captura de tela é `getDisplayMedia({ video, audio: true })`, sem `windowAudio`, `restrictOwnAudio`,
  `selfBrowserSurface` nem regra para a faixa de áudio (`packages/media/src/session.ts`). Do jeito que
  está, reproduz a queixa nº 1. A correção é o A1 e o A2.
- O microfone usa cancelamento de eco, supressão de ruído e ganho automático ligados. O ganho
  automático é o provável motivo do "microfone abaixando sozinho" (07/09.2).
- A entrada na sala valida o Turnstile a cada vez (`apps/api/src/rooms.ts`). A sessão de quem não tem
  conta já é um cookie assinado de 30 dias, onde a marca do D10 cabe.
- A camada de mídia já aceita escolher microfone e câmera (`deviceId`). O B6 é provavelmente só interface.
- Código de 10 caracteres, limites e qualidades já estão em `packages/config`, como o documento pede.

---

## S1. Spike de áudio (logo após o MVP)

**Por quê:** o Chrome 141 trouxe duas opções que mudam a premissa anterior de que "a web só entrega aba
ou sistema inteiro":

- `windowAudio: "window"` pede só o áudio da janela escolhida. É uma dica: o navegador pode ignorar.
- `restrictOwnAudio` tira da captura de sistema o som tocado pela própria página, ou seja, a voz da chamada.

Firefox e Safari não capturam áudio de tela em nenhuma versão listada.

**O que testar**, em Chrome, Edge e Opera GX atualizados, no Windows 10, no Windows 11 e no macOS 14.2+:

1. Janela de jogo com `windowAudio: "window"`: sai só o som do jogo? A voz do Discord fica de fora?
2. Tela inteira com `restrictOwnAudio`: a voz da nossa sala some da transmissão?
3. Aba com áudio: continua isolada?
4. As três opções via `getSupportedConstraints()`: o navegador declara suporte?

**Resultado e consequência:**

| Resultado | Ordem do Grupo C |
|---|---|
| Itens 1 e 2 funcionam em Chrome e Edge no Windows | Discord lançador, Android, YouTube/Twitch, **Desktop** |
| Não funcionam | **Desktop**, Discord lançador, Android, YouTube/Twitch |

Registrar a matriz de resultados neste arquivo, numa seção nova "Resultado do S1".

---

## Grupo A: condição para abrir ao público

### A1. Áudio da tela sem processamento

- **Evidência:** áudio "abafado, como se tivesse supressão de ruído na transmissão" (19.5, 28.1).
- **Regra:** a faixa de áudio da tela compartilhada sai com cancelamento de eco, supressão de ruído e
  ganho automático desligados, em Opus estéreo a 128 kbps. O microfone continua com os três ligados.
- **Custo de banda:** numa sala de 6, quem transmite envia 5 × 128 kbps = 640 kbps de áudio, na malha,
  sem custo nosso.
- **Aceite:** música tocada no computador chega estéreo e sem o efeito abafado.
- **Coerência:** "não escrever supressão de ruído própria" fica respeitado; aqui se desliga o nativo.

### A2. Fim do eco e áudio só da janela

- **Evidência:** 26 comentários, a maior objeção (15 pedem áudio só da janela, 18 relatam eco).
- **Regra:**
  1. Pedir `windowAudio: "window"` e `restrictOwnAudio` sempre que o navegador declarar suporte. O
     resultado do S1 diz o que de fato funciona.
  2. Antes de confirmar, a interface explica em uma linha: **janela** leva só o som dela (onde o
     navegador permite), **aba** leva só o som da aba, **tela inteira** pode levar o sistema todo.
  3. Onde a separação não funcionar e a conversa estiver no Discord, dizer isso e indicar a saída:
     transmitir uma janela ou uma aba, ou falar pela voz da sala.
- **Aceite:** em Chrome e Edge no Windows, com voz na sala e tela inteira compartilhada, nenhum
  participante ouve a própria voz; com uma janela de jogo, a call do Discord não aparece na transmissão,
  se o S1 confirmar.

### A3. Aviso de áudio ausente, antes e depois

- **Evidência:** 4 comentários (20.4, 24.5, 25.6, 30.5).
- **Regra:**
  - **Antes:** em Firefox e Safari, ao clicar em compartilhar, avisar que não haverá som e sugerir
    Chrome ou Edge.
  - **Depois:** se a captura voltar sem faixa de áudio, avisar na hora, com o que tentar.
- **Aceite:** no Firefox, o aviso aparece antes; no Chrome, compartilhar sem marcar o áudio mostra o aviso depois.

### A4. Senha de sala

- **Evidência:** 6 pedidos (18.1, 18.2, 19.4, 20.3, 22.1, 25.1), 1 auditoria do código do concorrente
  (24.1) e 2 relatos de insegurança (21.1, 21.2).
- **Regra:**
  - O dono liga, troca ou desliga a senha a qualquer momento. Grátis, em todos os níveis.
  - Com senha, quem abre o link digita a senha antes da prévia de microfone e câmera.
  - O **servidor** valida. A resposta de erro não dá pista da senha.
  - Guardar só hash com sal, no Durable Object. Sem tabela nova, exceto no link fixo (abaixo).
  - Limite de erros: 5 por sessão e 20 por IP a cada 10 minutos.
  - Senha de 4 a 64 caracteres.
  - A rota de informações e a prévia do link de uma sala com senha dizem só "sala com senha", sem número
    de pessoas.
  - Trocar a senha não derruba quem já está dentro. O dono que volta com o token não digita a senha.
  - Sem sala de espera.
  - **Link fixo do Plus:** nasce com senha ligada. O dono pode desligar, com aviso de que qualquer pessoa
    que adivinhar o @nome entra. Como a sala fixa é permanente, a senha dela fica guardada junto ao link
    fixo, também só como hash.
- **Aceite:** testes no Durable Object para: sem senha recusa, 6ª tentativa errada da sessão recusa,
  senha certa entra, troca de senha não derruba ninguém, rota de informações não revela a contagem.
- **Risco aceito (D9):** de a entrega 2 ao fim do MVP, o link fixo existe sem senha.

### A5. Tela cheia com chat

- **Evidência:** 3 pedidos de chat em tela cheia (27.2, 30.2, 30.3) e 1 de tela cheia (18.6).
- **Regra:** o vídeo em destaque tem botão de tela cheia, com o chat por cima, legível e com envio. No
  iPhone, onde o site não consegue tela cheia além do próprio vídeo, o mesmo botão ativa o modo "vídeo
  grande": o vídeo ocupa a página e o chat fica por cima.
- **Aceite:** ler e enviar mensagem em tela cheia no computador e no Android, e no modo vídeo grande no iPhone.

### A6. Turnstile sem repetição

- **Evidência:** 22.6 ("pediu 5 vezes em 10 minutos").
- **Regra:** o token do Turnstile vale 5 minutos e só uma vez. Depois que ele passa, o servidor grava no
  cookie de sessão assinado uma marca "verificado até", de 12 horas. Criar ou entrar em sala com a marca
  válida não pede verificação. O limite de requisições por IP continua.
- **Aceite:** entrar em 5 salas em 10 minutos pelo mesmo navegador pede uma única verificação.
- **Coerência:** muda o comportamento "passa pelo Turnstile" da entrega 1 para "passa pelo Turnstile
  quando não tem verificação válida". A defesa contra robôs continua.

### A7. Quem transmite escolhe qualidade menor

- **Evidência:** 24.2 (FPS do jogo cai de 30 a 40), 18.5 (pede seletor de qualidade).
- **Regra:** opções Automática, 720p30, 480p30, 360p30 e "fluidez 15 fps", sempre até o teto do plano.
  O Plus vê também 1080p30 e 1080p60. Sem escolha de codec e sem controle por espectador.
- **Aceite:** conta gratuita escolhe 480p30 e o outro lado recebe nessa qualidade.
- **Coerência:** o risco 2 do `DECISOES.md` fica como está; isso só dá uma saída ao usuário.

### A8. Ganho automático do microfone desligável

- **Evidência:** 07/09.2 ("abaixando o volume do microfone do nada").
- **Regra:** o ganho automático continua ligado por padrão. Nas configurações de áudio da sala, a pessoa
  desliga. A central de ajuda explica quando desligar.
- **Aceite:** desligar faz o microfone parar de mudar de volume sozinho.

---

## Grupo B: depois do lançamento

Ordenados pelo número de comentários.

| # | Item | Evidência | Regra |
|---|---|---|---|
| B1 | Organização do vídeo | 18.7, 25.7, 27.1 | Testar a sala com 2, 3 e 4 vídeos; se o destaque com miniaturas desperdiçar espaço, a grade se ajusta. Focar numa tela sem tela cheia. |
| B2 | Esconder painéis | 13/09.1 | Botão para esconder as barras laterais. |
| B3 | Ocultar o indicador de volume | 21.7 | Opção para esconder a barra de volume. |
| B4 | Volume por espectador | 18.4 | Cada pessoa ajusta o volume de cada transmissão na própria tela. |
| B5 | Tapar a própria prévia | 22.4 | Botão para esconder a própria transmissão da tela de quem transmite, mais `selfBrowserSurface: "exclude"` para o navegador não oferecer a própria aba e evitar o espelho infinito. |
| B6 | Escolher microfone e câmera | 20.2 | Seletor na prévia de entrada e dentro da sala. A camada de mídia já aceita o dispositivo. |
| B7 | Passar o dono | 07/09.1 | O dono transfere o papel a outro participante. |
| B8 | Som de aviso no chat | 30.4 | Ligado só quando a aba está fora de foco; dá para desligar. |
| B9 | Vídeo em pé no celular | 29/10.2 | Na vertical, o vídeo ocupa a tela toda, sem bordas pretas. |
| B10 | Expiração explicada | 19.8 | Texto na sala: "a sala fecha 5 minutos depois que todos saem". |
| B11 | **Transmitir console** | 27.5 | Ver abaixo. |

### B11. Transmitir console

- Botão "Transmitir console" na sala, **só no computador**.
- A pessoa escolhe a placa de captura. O vídeo entra como um vídeo dela, com perfil de fluidez.
- O áudio da placa vai numa **faixa separada**, com a mesma regra do A1: sem processamento, estéreo a
  128 kbps. A voz continua no microfone normal, com cancelamento de eco.
- Conta como 1 vídeo e segue a qualidade do plano: gratuito 720p30, Plus 1080p60. O Plus pode ter
  console e webcam ao mesmo tempo.
- Recomendar fone de ouvido, para o microfone não captar o som da TV.
- Sem guia para PS Remote Play ou app do Xbox.
- **Aceite:** com uma placa USB comum, o outro participante vê o jogo e ouve o som do jogo e a voz,
  separados e sem eco.

---

## Grupo C: etapas do pós-MVP

A ordem depende do S1. Fase 2, Social e Doação em Pix **não mudam**.

| Se o S1 confirmar a web | Se o S1 não confirmar |
|---|---|
| 1. Atividade do Discord (lançador) | 1. **Desktop (Electron)** |
| 2. Android (Capacitor) | 2. Atividade do Discord (lançador) |
| 3. YouTube e Twitch | 3. Android (Capacitor) |
| 4. **Desktop (Electron)** | 4. YouTube e Twitch |

### Desktop (Electron)

- Áudio só do processo ou da janela, sem eco, inclusive no macOS e para quem usa Firefox ou Safari.
- Sobreposição (13/09.5), atalhos globais e atualização automática, como já está no `DECISOES.md`.

### Atividade do Discord (lançador)

- **O que é:** uma atividade que, de dentro de um canal de voz do Discord, cria ou abre uma sala nossa e
  leva os participantes ao navegador com um clique. A conversa pode continuar no Discord; a transmissão
  é nossa, sem eco (A2 e desktop).
- **O que não é:** voz, vídeo ou tela rodando dentro do Discord. Essa versão é registrada como
  **inviável**: o proxy das atividades não suporta WebRTC e o iframe deve bloquear a captura de tela.
  Reabrir só se o Discord mudar isso.
- **Infra:** registro do app no Discord e um endpoint para criar e abrir a sala. Reaproveita o login com
  Discord da entrega 2. Nenhuma mudança na mídia.
- **Antes de começar:** alterar no `DECISOES.md` a linha "bots e integrações de terceiros: fora do
  produto" para "exceto a atividade do Discord", com aprovação do dono do produto.
- **Risco registrado:** se a regra que bloqueou as transmissões do Discord no Brasil alcançar
  atividades, a publicação pode ser recusada.

### Android (Capacitor)

- Transmitir a tela do celular e manter a chamada em segundo plano (19.7, 13/09.2, 13/09.3). Já previsto.

### YouTube e Twitch, assistir junto

- Sincroniza o player oficial de cada plataforma para todos na sala; não retransmite o vídeo.
- Playlist do YouTube (27.4).
- Sem Crunchyroll nem outro serviço com DRM.

### Social (sem mudança)

- Lista de amigos (30.6) e "app para sair do Discord" (28.2, 28.3) reforçam a etapa Social já prevista.

---

## Fora, com o motivo

| Pedido | Itens | Motivo |
|---|---|---|
| Transcrição ou gravação | 03/09.1 | O `DECISOES.md` proíbe gravar e transcrever |
| Plugins e temas da comunidade | 03/09.2 | Integrações de terceiros fora do produto; tema de sala Plus continua com 6 temas |
| Crunchyroll e serviços com DRM | 26.1 | O DRM impede captura e retransmissão legítimas |
| Atividade do Discord completa | 19.3, 21.8, 22.5 | Proxy sem WebRTC e iframe sem captura de tela; vira lançador |
| Música ambiente, clima de cinema | 25.9 | Um comentário, licença de música, fora do problema central |
| Guia de PS Remote Play / Xbox | — | Decidido não documentar |
| Moderação e denúncia na sala direta | 03/09.3 | Manter como está e **revisar a cada 3 meses**; denúncia e painel continuam na sala pública (entrega 4) |

## Riscos

| # | Risco | Tratamento |
|---|---|---|
| R1 | Link fixo sem senha da entrega 2 ao fim do MVP | Aceito: ninguém usa antes do fim do MVP (D9) |
| R2 | `windowAudio` e `restrictOwnAudio` podem não funcionar em algum sistema | S1 decide; onde falhar, a interface diz e o desktop sobe na ordem |
| R3 | Firefox e Safari sem áudio de tela | A3 avisa antes; o desktop cobre depois |
| R4 | FPS do jogo cai em quem transmite (24.2) | Já é o risco 2 do `DECISOES.md`; o A7 dá uma saída |
| R5 | Windows travando depois de horas compartilhando (22.2) | Teste manual de 2 horas com tela compartilhada antes do lançamento |
| R6 | Política do Discord para atividades | Registrado; descobre-se ao publicar o lançador |

## O que já atende e não pode se perder

| Queixa ao concorrente | O que já cobre |
|---|---|
| Sala privada adivinhada pelo nome | Código de 10 caracteres aleatórios (entrega 1) |
| IP exposto | Aviso ao criar e entrar; modo protegido (entrega 4) |
| "Faz a live ser P2P" | Sala direta em malha (entrega 1) |
| Foto de perfil paga | Avatar do Google ou do Discord; foto própria para quem tem conta (entrega 4) |
| Sala fixa tipo canal | Link fixo Plus (entrega 2), agora com senha por padrão (A4) |
| Celular: assistir, falar, chat | Entrega 1 |

## Parâmetros novos

| Parâmetro | Valor |
|---|---|
| Áudio da tela e da placa de captura | Opus estéreo, 128 kbps, sem processamento |
| Tentativas erradas de senha | 5 por sessão e 20 por IP, a cada 10 minutos |
| Tamanho da senha da sala | 4 a 64 caracteres |
| Validade da marca anti-robô | 12 horas, no cookie de sessão assinado |
| Opções de qualidade de quem transmite | Automática, 720p30, 480p30, 360p30, fluidez 15 fps; Plus também 1080p30 e 1080p60 |
| Revisão da moderação na sala direta | A cada 3 meses |

## Fontes técnicas consultadas

- [Chrome 141, notas de versão](https://developer.chrome.com/release-notes/141): `restrictOwnAudio` e `windowAudio`.
- [MDN, getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia): valores de `windowAudio`, `systemAudio` e `selfBrowserSurface`.
- [caniuse, captura de áudio no getDisplayMedia](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support): sem suporte em Firefox e Safari.
- [Addpipe, áudio do sistema no Chrome do macOS](https://blog.addpipe.com/getdisplaymedia-allows-capturing-the-screen-with-system-sounds-on-chrome-on-macos/): relato de um autor, a confirmar no S1.
- [Turnstile, validação no servidor](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/): token de 300 segundos e uso único.
- [Discord, como as atividades funcionam](https://discord.com/developers/docs/activities/how-activities-work) e [guia do proxy (Robo.js)](https://robojs.dev/discord-activities/proxy): iframe e proxy; a falta de WebRTC vem de fontes de terceiros.
