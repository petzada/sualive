# Próximas etapas depois do MVP

Versão 5, de 2026-11-14. Substitui o `POS-MVP-v4.md`. Aplica as decisões de
`analise-concorrentes-reestrutura.md` (análise do Go Live e da Salinha, fechada com o dono do produto por
enquete, depois da entrega 3). O `DECISOES.md` foi revisado junto e traz a entrega 4 nova. O que mudou em
relação à versão 4 está no fim.

Itens marcados **[padrão]** ainda não foram confirmados pelo dono.

## Situação

- Em produção: entregas 0 a 3. A entrega 4 foi trocada: sai a sala no servidor (SFU, palco, plateia,
  vitrine, moderação, imagens) e entra a sala de 12 com vídeo sob demanda, os novos limites e a sala protegida.
- O dono não faz teste manual por entrega: a evidência é automatizada (testes e fumaça) e o uso em produção.
- Webhooks da Woovi, chaves do Discord e o domínio `sualive.com.br` ficam para depois do MVP.

## Ordem de trabalho

1. **Antes da entrega 3:** P1 e P2. Feito.
2. **Entrega 3.** Feita.
3. **Entrega 4**, como no `DECISOES.md` revisado, com os acréscimos daqui.
4. **Grupo A:** condição para abrir ao público.
5. **Lançamento público.**
6. **Grupo B**, na ordem dada.
7. **Grupo C**, na ordem dada: Desktop; assistir junto, bot do Discord e indicação; Fase 2; grupos; Android;
   sala grande.

Para o agente que implementar:

- Antes de codar um item, confira a situação no código: a tabela daqui foi tirada em `3af2508`.
- Em conflito com o `DECISOES.md`, pare e pergunte. As alterações já aprovadas estão listadas adiante.
- Valores novos vão para `packages/config`. Continuam valendo: o servidor decide, nenhum segredo no front,
  nada gravado, nenhum código do concorrente, nenhuma API de navegador usada de memória.
- Toda entrega que mudar algo descrito nos Termos de Uso ou nas Políticas de Privacidade revisa os dois no
  mesmo PR e muda `TERMS_VERSION` (regra do `AGENTS.md`).

---

## Decisões finais

| # | Decisão |
|---|---|
| D1 | Áudio: a web faz o que o navegador permite; "só o som do jogo" é promessa do app desktop |
| D2 | Sem teste manual de áudio. O resultado se mede pelo feedback (B17), no Grupo B. No lançamento nada é medido: risco aceito |
| D3 | Som da tela e da placa de captura: sem processamento de voz e **sem editar o SDP** (mono, cerca de 32 kbps). Estéreo a 128 kbps fica para o desktop |
| D4 | Em conexão retransmitida (TURN), o áudio da tela tem teto de 64 kbps |
| D5 | Sem áudio (Firefox, Safari ou captura muda): avisar antes e depois de compartilhar |
| D6 | Senha de sala opcional, grátis, só como hash, de 4 a 64 caracteres, sem sala de espera |
| D7 | Erros de senha: 3 tentativas sem espera; a partir da 4ª, espera de 30 s que dobra a cada erro, até 15 minutos. Por sessão e por IP, contado no Durable Object da sala; zera depois de 15 minutos sem erro |
| D8 | Sala com senha: a rota de informações diz só "sala com senha", sem número de pessoas, e ganha limite por IP |
| D9 | Link fixo do Plus: senha **gerada** quando a conta vira Plus e mostrada ao dono uma vez; ele gera outra, define a sua ou desliga |
| D10 | O dono não digita a senha: na sala comum o navegador envia o token do dono já na entrada; na sala fixa vale a conta |
| D11 | Link fixo sem senha até o Grupo A: risco aceito |
| D12 | Anti-robô: **só o corte das repetições**. Quem acabou de criar a sala entra sem segunda verificação; quem já foi admitido volta sem verificar. A marca de 12 horas só entra se o feedback mostrar captcha demais |
| D13 | Qualidade menor por quem transmite: Automática, 1080p60, 1080p30, 720p30, 480p30, 360p30 e "fluidez 15 fps"; Plus também 1440p e 2160p, a 60 e a 120 fps **[padrão]** |
| D14 | Ganho automático do microfone ligado, com opção de desligar |
| D15 | Tela cheia com chat; no iPhone, modo "vídeo grande" |
| D16 | Console: botão "Transmitir console" na web, no Grupo B, depois do seletor de aparelhos, com som em mono; o desktop melhora para estéreo |
| D17 | Celular como câmera: o celular conecta **só ao computador da própria pessoa**, que repassa o vídeo à sala como um vídeo dela. Só câmera |
| D18 | Saída de áudio (fone ou caixa): seletor só no computador |
| D19 | Chat: links `http` e `https` clicáveis para quem pode escrever, sem prévia |
| D20 | Sons de aviso: entrada e início de transmissão só enquanto a sala tem até 6 pessoas |
| D21 | Feedback: **só para quem tem conta**, vinculado à conta. A pergunta aparece ao sair das **três primeiras chamadas**; se a pessoa recusar uma vez, nunca mais aparece |
| D22 | Guardar o **e-mail** de quem entra com Google ou Discord, para contato e avisos de cobrança |
| D23 | Termos mudaram: vale o **uso continuado**, com uma **faixa de aviso** para quem tem conta (regra em P1) |
| D24 | O @nome é da conta para sempre (até trocar ou excluir). Some a regra dos "30 dias de reserva" |
| D25 | Segunda aba na mesma sala: a aba derrubada mostra mensagem própria e o botão "Usar esta aba" |
| D26 | Moderador: entra **dentro da entrega 4** e já vale na sala direta. Age só sobre participantes comuns; só o dono promove e rebaixa. Na sala de link fixo, moderadores **permanentes**: só contas, no máximo 10 |
| D27 | Limites de frequência por pessoa (chat, reações, mão, microfone): entram na entrega 4 |
| D28 | Registro de acesso (IP, data e hora) guardado por 6 meses, como as Políticas de Privacidade já dizem: entra na entrega 4 |
| D29 | Moderação da sala direta (denúncia e painel): manter como está e revisar a cada 3 meses. Denúncia e painel nascem com os grupos |
| D30 | Assistir junto: YouTube sincronizado, com playlist; Twitch ao vivo aberta para todos, sem sincronia. Sem arquivo local, sem música. **Grátis para todos** |
| D31 | Grupo C, nesta ordem: **Desktop; assistir junto, bot do Discord e indicação; Fase 2; grupos; Android; sala grande** |
| D32 | Qualidade grátis: **1080p60**, já na entrega 4. Revoga "manter 720p30 e medir" |
| D33 | Ligar para amigo: etapa de grupos e Android. Sem app instalável, a notificação web não alcança o iPhone: reavaliar quando a etapa chegar |
| D34 | Sala pública e vitrine: sem data. Descrição e categoria ficam com elas |
| D35 | Promessa da página inicial: "um link, sem conta, sem anúncio". Segurança não é usada como argumento de comunicação |
| D36 | Bot do Discord: cria a sala e posta o link no canal. Não é a atividade (lançador), que continua cortada |
| D37 | Indicação: convite que vira uso real rende dias de Plus **sem ouro** (qualidade, 4 vídeos, link fixo, tema e selo). Uso real: conta nova que entra em sala em 2 dias diferentes **[padrão]**. Sem período de teste |
| D38 | Grupos só começam com o **retorno semanal** atingido: contas que voltam a abrir sala com as mesmas pessoas em semanas seguidas. O número é definido com 4 semanas de dados reais |
| D39 | Grupos: chat **guardado no servidor, sem prazo**; imagens no R2, cada uma pelo classificador, sem outros arquivos; mensagens diretas só entre amigos, na mesma etapa |
| D40 | Nascem com os grupos: denúncia e painel interno; apagar mensagens (autor e dono) e exclusão de conta; lista de palavras e classificador de texto; Termos de Uso e Políticas de Privacidade revistos antes |
| D41 | Idade: 18 anos por autodeclaração, sem verificação. Parecer jurídico não é condição de lançamento |
| D42 | Cofre do grupo: qualquer membro deposita ouro; o cofre paga a sala grande e extras do grupo |
| D43 | Loja: Fase 2 (presença, missões, conquistas) cedo, para retenção; loja forte com os grupos: raridade, itens raros e de temporada **só em ouro**, coleção **mensal** |
| D44 | Sala grande (SFU): só de 7 a 50 pessoas, por link, com palco e plateia; depois dos grupos; mostrada em horas, com recarga; preço pela regra do pior caso medido × 2 |
| D45 | Jogar no PC do amigo: fora; reavaliar quando o Desktop existir |
| D46 | Quem não tem conta continua criando e entrando em sala |
| D47 | Condições de lançamento novas: registro de acesso por 6 meses (D28) e Central de Segurança com canal oficial |

**Cortados nesta revisão:** atividade do Discord (lançador), instalar como app (PWA), limite de pessoas pelo
dono, compartilhar tela no celular sem som, menções no chat, desfoque de fundo, passar o dono, ocultar o
indicador de volume, marca anti-robô de 12 horas, estéreo e 128 kbps na web.

---

## Antes da entrega 3

### P1. E-mail da conta e aviso de termos (D22, D23)

- **E-mail:** o login pede o e-mail ao Google e ao Discord e o guarda na conta. Contas antigas recebem o
  e-mail no login seguinte. Excluir a conta apaga.
- **Textos:** Termos de Uso e Políticas de Privacidade deixam de dizer "não guardamos o seu e-mail" e passam a
  dizer para que ele serve. `TERMS_VERSION` muda.
- **Aviso de termos:** quando `TERMS_VERSION` é mais novo que a versão que a conta já viu, aparece, depois do
  login, uma **faixa fixa no topo**, em cor contrastante, com a data no começo, a frase de que os Termos
  mudaram, um link para os Termos atualizados e um "x" simples (só a letra, sem contorno). Fechar no "x" ou
  abrir o link faz a faixa sumir até a próxima mudança. Não bloqueia nada: vale o uso continuado.
- **Infra:** colunas novas e nulas em `users` (e-mail e versão dos termos vista), migration só de adição;
  escopo de e-mail nos dois provedores.
- **Aceite:** conta nova grava o e-mail; conta antiga grava no login seguinte; versão nova mostra a faixa;
  fechar ou abrir o link grava a versão vista e a faixa não volta; excluir a conta apaga o e-mail.

### P2. Segunda aba (D25)

- **Regra:** continua valendo uma conexão por pessoa. A aba derrubada mostra "Você abriu esta sala em outra
  aba" e o botão "Usar esta aba", em vez de "Algo deu errado".
- **Aceite:** teste do cliente da sala para o fechamento `replaced`.

---

## Acréscimos à entrega 4

- **Moderador (D26).** O dono promove e rebaixa. O moderador silencia, remove e bane; não promove e não
  encerra a sala; não age sobre o dono nem sobre outros moderadores. Papel
  no protocolo e no Durable Object, verificado pelo servidor.
  - Sala comum e sala protegida: o papel vale até a sala acabar e sobrevive a reconexão. Quando a sala
    grande existir, o moderador também tira do palco e não chama a ele.
  - Sala de link fixo: moderadores permanentes guardados junto à conta do dono, no D1; só contas; no máximo 10.
    Convidado promovido vale até a sala esvaziar.
- **Limites de frequência (D27).** Por pessoa, não por conexão: chat, reações, levantar a mão e
  ligar/desligar o microfone. Valores em `packages/config`.
- **Registro de acesso (D28).** Tabela no D1 com conta ou sessão, IP, data e hora de cada login e entrada em
  sala; rotina diária apaga o que passou de 6 meses. Sem painel de moderação até os grupos, a consulta é
  direto no D1. Até a entrega 4 as Políticas de Privacidade prometem algo que ainda não existe: risco aceito
  pelo dono. Passa a ser condição para abrir ao público (D47).

---

## Grupo A: condição para abrir ao público

Ordem de implementação.

### 1. A3. Aviso de áudio ausente, antes e depois

- **Regra:** em navegador que não captura áudio de tela (Firefox, Safari), avisar ao clicar em compartilhar e
  sugerir Chrome ou Edge. Se a captura voltar sem faixa de áudio, avisar na hora.
- **Aceite:** teste com navegador sem áudio (aviso antes) e com captura sem faixa de áudio (aviso depois).

### 2. A2. Fim do eco da própria sala

- **O que o navegador faz:** Chrome e Edge 141 têm `restrictOwnAudio`, que tira do som capturado o áudio da
  própria página (a voz dos outros participantes), só no Windows e no macOS e só quando a captura inclui som do
  sistema. O Chrome **não** tem áudio "só da janela": janela e tela levam o som do sistema todo.
- **Regra:**
  1. Pedir `restrictOwnAudio` sempre que `getSupportedConstraints()` o declarar. É dica: pode ser ignorada.
  2. Antes de abrir o seletor, explicar em uma linha: **aba** leva só o som da aba; **janela** e **tela
     inteira** levam o som do computador, sem a voz desta sala (no Windows e no macOS).
  3. Dizer que a voz do Discord e de outros programas continua entrando ao compartilhar janela ou tela, e
     indicar a saída: compartilhar uma aba, ou falar pela voz da sala.
- **Aceite automatizado:** com a opção declarada, o pedido de captura a inclui; sem ela, não inclui. Depois
  da captura, `getSettings().restrictOwnAudio` e `displaySurface` definem o texto mostrado.

### 3. A8. Ganho automático do microfone desligável

- **Regra:** ligado por padrão; a pessoa desliga nas configurações de áudio da sala. Desligar **recaptura** o
  microfone (o navegador não troca isso com a faixa aberta), sem recriar as conexões.
- **Aceite:** desligar abre o microfone com `autoGainControl: false` e mantém o estado de mudo.

### 4. A7. Quem transmite escolhe qualidade menor

- **Regra:** as opções da D13, até o teto do plano. Sem escolha de codec e sem controle por espectador.
- **No código:** a qualidade é fixa ao criar a sessão de mídia; falta um método para trocá-la com a sessão aberta.
- **Aceite:** conta gratuita escolhe 480p30 e o teto de envio muda sem derrubar as conexões.

### 5. A1. Som da tela sem processamento

- **Já feito:** a captura pede o áudio sem cancelamento de eco, sem supressão e sem ganho.
- **Falta:** o teto de 64 kbps na faixa de áudio da tela quando a conexão é retransmitida (D4).
- **Aceite:** o teto é aplicado ao sender de áudio da tela em conexão retransmitida e removido quando deixa de
  ser; parâmetros de vídeo nunca vão para o áudio.

### 6. A6. Menos verificações anti-robô

- **Regra (D12):** criar a sala já admite quem criou, sem segunda verificação ao entrar; quem já foi admitido
  numa sala volta a ela sem verificar. Entrar numa sala nova continua pedindo uma verificação. Sem migration.
- **Aceite:** criar e entrar pede uma verificação; sair e voltar não pede nenhuma; outra sala pede uma.

### 7. A4. Senha de sala

- **Regra:** D6 a D10.
  - Com senha, quem abre o link digita a senha antes da prévia de microfone e câmera.
  - O servidor valida. O erro não dá pista. Só hash com sal.
  - Sala comum: senha no Durable Object. Sala de link fixo: senha junto à conta, no D1 (colunas novas, só adição).
  - Trocar a senha não derruba ninguém.
- **Aceite:** testes no Durable Object: sem senha recusa; três erros sem espera e a quarta tentativa
  bloqueada antes do prazo; a espera dobra; senha certa entra; dono entra sem senha; troca não derruba ninguém;
  a rota de informações não revela a contagem e tem limite por IP; conta que vira Plus recebe a senha gerada.

### 8. A5. Tela cheia com chat

- **Regra:** o vídeo em destaque tem botão de tela cheia, com o chat por cima, legível e com envio. No iPhone,
  o mesmo botão ativa o modo "vídeo grande".
- **Aceite:** ler e enviar mensagem em tela cheia no computador e no Android, e no modo vídeo grande no iPhone.

### 9. Central de Segurança e canal oficial (D47)

- **Regra:** página pública com as regras de uso, o que o dono e o moderador podem fazer, como pedir a
  exclusão de dados e o contato oficial, inclusive para autoridades. Depende do domínio e do e-mail de contato.
- **Não é** argumento de comunicação (D35): fica no rodapé, nos Termos de Uso e nas Políticas de Privacidade.
- **Aceite:** a página existe, está ligada no rodapé e nos dois textos, e o e-mail de contato recebe mensagem.

---

## Grupo B: depois do lançamento

| Ordem | # | Item | Regra | Esforço |
|---|---|---|---|---|
| 1 | B10 | Expiração explicada | Texto na sala comum: "a sala fecha 5 minutos depois que todos saem". Na sala fixa, o texto diz que ela não fecha | P |
| 2 | B2 | Esconder painéis | Botão para esconder o painel lateral | P |
| 3 | B9 | Vídeo em pé no celular | Proporção do vídeo pelo tamanho real da imagem, sem bordas pretas | P |
| 4 | B5 | Tapar a própria prévia | Botão para não ver a própria transmissão; pedir `selfBrowserSurface: "exclude"` por garantia | P |
| 5 | B4 | Volume por espectador | Cada pessoa ajusta o volume de cada transmissão na própria tela | P |
| 6 | B14 | Links no chat | D19; abrem em aba nova com `rel="noopener noreferrer"` | P |
| 7 | B17 | Feedback ao sair | Ver abaixo | P–M |
| 8 | B6 | Microfone, câmera e saída | Seletor na prévia e na sala. Saída (`setSinkId`) só no computador | M |
| 9 | B11 | Transmitir console | Ver abaixo | M |
| 10 | B1 | Organização do vídeo | Grade que se ajusta com 2 a 4 vídeos assistidos e cartões dos vídeos disponíveis; focar numa tela sem tela cheia | P–M |
| 11 | B8 | Sons de aviso | Mensagem (aba fora de foco), entrada e início de transmissão, cada um ligável; entrada e transmissão só enquanto a sala tem até 6 pessoas | P–M |
| 12 | B12 | Celular como câmera | Ver abaixo | M |

### B17. Feedback ao sair da sala

- Só para quem tem conta. Ao sair de uma sala em que ficou ao menos 2 minutos, pergunta opcional de 1 a 5, com
  texto de até 500 caracteres.
- A pergunta aparece nas **três primeiras chamadas** da conta. Respondeu as três: não aparece mais. **Recusou
  uma vez: nunca mais aparece.**
- Guardar: nota, texto, tipo de sala, plano, navegador, sistema, data e o vínculo com a conta. O contato é
  feito pelo e-mail da conta (D22).
- Tabela nova no D1; excluir a conta apaga os feedbacks dela. O limite é por conta (no máximo 3), sem limite por IP.
- As Políticas de Privacidade citam a coleta; `TERMS_VERSION` muda e a faixa de aviso aparece (D23).
- **Aceite:** responder grava uma linha; a quarta chamada não pergunta; recusar grava a recusa e nunca mais
  pergunta; convidado nunca vê; excluir a conta apaga.

### B11. Transmitir console

- Depende do B6. Botão "Transmitir console", só no computador.
- A pessoa escolhe a placa de captura. O vídeo entra como um vídeo dela, com perfil de fluidez.
- O som da placa vai numa faixa separada, sem processamento de voz, em mono (D3); a voz continua no microfone.
- Conta como 1 vídeo e segue a qualidade do plano. Recomendar fone de ouvido.
- **Aceite automatizado:** a captura da placa abre áudio com eco, supressão e ganho desligados, em faixa
  própria; a voz segue em outra faixa.

### B12. Celular como câmera

- No computador, "usar o celular como câmera" mostra um QR Code com token de uso único, válido por 5 minutos,
  ligado à sala e à pessoa. Rota própria, que consome o token e dispensa o anti-robô no celular.
- O celular abre uma conexão, só com o computador da própria pessoa, e envia só a câmera (sem microfone).
- O computador repassa esse vídeo à sala como um vídeo da pessoa. Valem os limites que já existem: vídeos por
  pessoa e, na sala protegida, 2 por sala. A sala não ganha conexões novas, e o celular não ocupa vaga.
- O computador recodifica o vídeo; o celular envia uma vez, na qualidade do plano. 1 celular por pessoa.
- Sair da sala no computador desconecta o celular.
- **Aceite:** o vídeo do celular aparece como da pessoa; QR usado ou vencido não entra; o segundo celular da
  mesma pessoa é recusado; acima do limite de vídeos da pessoa, o do celular é recusado como qualquer outro.

---

## Grupo C: etapas depois do lançamento

1. **Desktop (Electron).** O único caminho para enviar só o som de um programa, sem eco, inclusive para quem
   usa Firefox ou Safari. Leva junto: som da tela e do console em estéreo a 128 kbps (no app a versão do
   navegador embutido é nossa, então editar a negociação deixa de ser risco), sobreposição, atalhos globais e
   atualização automática. Com data marcada: é o primeiro item depois do lançamento. Quando existir,
   reavaliar "jogar no PC do amigo" (D45).
2. **Assistir junto, bot do Discord e indicação.**
   - **Assistir junto (D30).** Só os players oficiais, sem sobreposição nossa sobre o player. Sem Crunchyroll
     nem serviço com DRM. Grátis para todos, inclusive sem conta.
   - **Bot do Discord (D36).** Um comando cria a sala e posta o link no canal. Um Durable Object mantém a
     conexão com o Discord. Risco: o Discord já removeu ferramentas de tela não autorizadas; o bot só posta
     um link, mas a publicação pode ser recusada.
   - **Indicação (D37).** Link de convite por conta. O Plus de indicação não credita ouro e não libera vídeo
     em retransmissão nem sala protegida. Limite contra abuso em `packages/config`.
3. **Fase 2.** Presença diária, missões e conquistas, pagando prata. Serve à retenção e alimenta a medida do
   retorno semanal (D38).
4. **Grupos**, só com o retorno semanal atingido (D38).
   - Amigos e convite direto; grupos com chat guardado; imagens com classificador; mensagens diretas entre
     amigos (D39).
   - Nascem junto: denúncia e painel interno, apagar mensagens, exclusão de conta que apaga ou anonimiza as
     mensagens, lista de palavras e classificador de texto, foto própria de avatar (D40).
   - Antes de começar: Termos de Uso e Políticas de Privacidade passam a dizer que o chat de grupo é
     guardado e como pedir exclusão; no `DECISOES.md`, a regra "não guardar o chat" ganha a exceção.
   - Cofre do grupo (D42) e loja forte (D43).
   - A análise recomenda parecer jurídico e verificação de idade antes desta etapa. O dono decidiu não
     exigir (D41); a recomendação fica registrada no risco R14.
5. **Android (Capacitor).** Transmitir a tela do celular, manter a chamada em segundo plano e notificar.
6. **Sala grande (D44).** Cloudflare Realtime SFU para 7 a 50 pessoas, com palco e plateia. Antes de começar:
   medir o custo e refazer a tabela de preço pela regra do `DECISOES.md`.

Sem data: sala pública e vitrine (D34); doação em Pix.

## Acréscimos às etapas

| Etapa | Acréscimo |
|---|---|
| Grupos | Cargos e permissões configuráveis; o moderador da entrega 4 vira um dos cargos |
| Grupos | Ligar para amigo, com o Android (D33) |
| Grupos ou depois | Menções no chat, se o uso pedir |
| Sala pública, se voltar | Descrição curta e categoria de lista fixa, junto do destaque na vitrine |

## Métrica que libera os grupos

| Métrica | Fonte | Decide |
|---|---|---|
| Retorno semanal: contas que abrem sala com as mesmas pessoas em semanas seguidas | Registro de acesso e D1 | Início da etapa de grupos (D38) |
| Pares que ficam sem vídeo por falta de retransmissão paga | Durable Object | Rever a regra do vídeo em retransmissão |

---

## Alterações a aplicar no `DECISOES.md`

Aplicadas na revisão de 2026-11-14: e-mail da conta, uso continuado com faixa de aviso, @nome da conta,
entrega 4 nova, níveis, preço do Plus, parâmetros, ordem do pós-MVP e as exceções a "integrações de terceiros".

Ainda a aplicar, quando a etapa começar:

| Onde | De | Para |
|---|---|---|
| Nunca fazer | Não guardar o chat depois que a sala acaba | Exceção para o chat de grupo (D39) |
| Fora do produto | Integrações de terceiros | Registrar os players oficiais (D30) e o bot do Discord (D36) no início de cada etapa |
| Parâmetros | Preços provisórios de retransmissão e sala protegida | Valores finais, depois da medição da entrega 4 |

Sem alteração: a regra do celular sem botão de compartilhar tela; "não escrever escolha manual de codec" (o
SDP não é editado na web).

---

## Situação no código (`3af2508`)

Esforço: P = até 1 dia de um agente; M = alguns dias; G = uma entrega.

| Item | Situação | Onde a mudança entra | Esforço |
|---|---|---|---|
| P1 | Falta | `apps/api/src/auth/**`, `account/**`, colunas em `users`, textos legais, faixa no front | P–M |
| P2 | Falta | `apps/web/src/lib/room/client.ts` (fechamento `replaced`), tela de fim de sala | P |
| A1 | Captura pronta; nenhum parâmetro de envio de áudio | `packages/media/src/session.ts` (`applySenderParams`) | P |
| A2 | Falta | `packages/media/src/env.ts` (expor `getSupportedConstraints`), `session.ts`, textos | P |
| A3 | Falta | `packages/media/src/capabilities.ts`, `session.ts`, aviso na sala | P |
| A4 | Falta | `apps/api/src/rooms.ts`, `room.ts`, colunas em `users`, lobby | M |
| A5 | Falta | `apps/web/src/components/room/Stage.tsx`, `RoomView.tsx` | M |
| A6 | Falta | `apps/api/src/rooms.ts` (criar já admite; reentrada usa a admissão), cliente da sala | P |
| A7 | Falta | `packages/media/src/types.ts` (método novo), `session.ts`, `packages/config` | P–M |
| A8 | Falta | `packages/media/src/session.ts` (`enableMicrophone`), `preview.ts` | P |
| B6 | Parcial: a mídia aceita `deviceId`, o cliente nunca passa | `env.ts`, `client.ts`, lobby e sala | M |
| B12 | Falta; a segunda conexão da mesma pessoa derruba a primeira | rota nova, par de repasse em `packages/media`, sala | M |
| Demais itens B | Falta | componentes da sala | P cada |
| Grupo C | Falta | pacotes novos | G cada |

## Achados da revisão

1. **A versão 3 prometia áudio "só da janela", que o Chrome não tem.** O que resolve o eco da própria sala é
   `restrictOwnAudio`, só no Windows e no macOS.
2. **Não havia como medir o áudio no lançamento**: a medição dependia do feedback, que estava no Grupo B.
   Mantido assim (D2).
3. **Celular como câmera custava uma entrega e até 9 Mbps de envio no 4G**: até 11 conexões por computador e 51
   na sala, não 12. Redesenhado (D17).
4. **A1 "quase pronto" era otimista**: estéreo e 128 kbps exigem editar o SDP, técnica marcada para bloqueio
   futuro. Decidido não editar (D3).
5. **A versão 3 contava como "já atende" o que não existe**: o aviso de IP (removido pelo dono) e a senha no link fixo.
6. **Desfoque de fundo não existe em nenhum navegador.**
7. **A marca de 12 horas só cabia no cookie do convidado** e exigia migration; trocada pelo corte das repetições (D12).
8. **Janelas de 10 minutos não cabem no limitador por IP**, que conta 10 ou 60 segundos (D7 conta no Durable Object).
9. **O dono não era reconhecido antes da senha na sala comum** (D10).
10. **Feedback "para contatar" não contatava ninguém**: a conta não guardava contato (D22).
11. **Moderador dependia do palco da entrega 4**, que não existe (D26).
12. **Os Termos dizem "uso continuado vale como aceite" e a revisão tinha escolhido novo aceite**: fechado pelo
    uso continuado com faixa de aviso (D23).
13. **As Políticas de Privacidade prometem registro de acesso por 6 meses, sem código**: entra na entrega 4 (D28).
14. **Achados do MVP fora do plano:** rota de informações da sala revelando Plus e contagem sem limite
    (corrigido no A4); reações, mão e microfone sem limite de frequência e limite do chat por conexão (D27);
    segunda aba com erro genérico (D25); reserva de 30 dias não aplicada em código (D24).

## Riscos

| # | Risco | Tratamento |
|---|---|---|
| R1 | Link fixo sem senha até o Grupo A | Aceito (D11) |
| R2 | `restrictOwnAudio` é dica, só existe no Windows e no macOS, e nada mede o resultado no lançamento | Aceito (D2); a interface explica; o feedback mede depois; o Desktop é a saída definitiva |
| R3 | Firefox e Safari sem áudio de tela | A3 avisa; o Desktop cobre |
| R4 | FPS do jogo cai em quem transmite | A7 dá a saída |
| R5 | Windows travando depois de horas compartilhando | Sem teste manual; acompanhar pelo Sentry e pelo feedback |
| R6 | Celular como câmera recodificado no computador pesa em máquina fraca | O vídeo conta no limite da pessoa; medir pelo feedback |
| R7 | Som da tela em mono a 32 kbps: música e jogo soam pobres na web | Aceito (D3); o Desktop entrega estéreo |
| R8 | Guardar e-mail aumenta a obrigação de LGPD e muda a promessa pública | Textos atualizados no mesmo PR, faixa de aviso, exclusão apaga |
| R9 | Senha gerada do link fixo é mostrada uma vez | Botão de gerar nova na página do plano |
| R10 | Limites de frequência só na entrega 4 | Aceito (D27); o dono pode remover |
| R11 | As Políticas de Privacidade prometem registro de acesso antes de ele existir | Aceito até a entrega 4 (D28) |
| R12 | Feedback só de quem tem conta e só três vezes: amostra pequena e enviesada | Aceito (D21); cruzar com o Sentry |
| R13 | A cobrança do Plus está ligada em produção sem webhooks cadastrados | Decisão do dono; cadastro fica para depois do MVP |
| R14 | Grupos com chat guardado sem prazo, imagens e mensagens diretas, com idade só por autodeclaração e sem parecer jurídico. É o terreno que tirou a tela do Discord | Aceito pelo dono (D41). A análise recomenda parecer e verificação de idade antes da etapa de grupos |
| R15 | Sem vídeo em retransmissão para quem não paga: parte dos pares fica só com voz, queixa que os concorrentes não têm | Aceito; aviso dos dois lados; medir (métrica acima) |
| R16 | Desktop antes de o produto provar retenção: instalador, atualização e assinatura de código para manter | Aceito; é a maior queixa do público do concorrente |
| R17 | Sem app instalável, o iPhone não recebe aviso de sala aberta até existir outra saída | Aceito (D33) |
| R18 | Coleção mensal na loja exige arte todo mês de um dev solo | Aceito (D43); começa só com os grupos |
| R19 | O bot do Discord depende de uma plataforma que já removeu ferramentas de tela | O bot só posta um link; os grupos próprios são o plano B |
| R20 | Se o Discord religar a tela, a procura cai | Assistir junto grátis, entrada sem conta e o Desktop são o que sobra de diferente |

## Fora, com o motivo

| Pedido ou feature | Motivo |
|---|---|
| Transcrição ou gravação | O `DECISOES.md` proíbe |
| Plugins e temas da comunidade | Integrações de terceiros e moderação; o Plus mantém 6 temas |
| Crunchyroll e serviços com DRM | O DRM impede captura e retransmissão legítimas |
| Atividade do Discord, completa ou como lançador | WebRTC não é suportado em atividades; como lançador, colar o link no chat faz o mesmo |
| Música ambiente, música sincronizada, arquivo local | Escopo e licença de música |
| 2K a 120 fps grátis | Grátis vai até 1080p60; acima disso é do Plus |
| Jogar no PC do amigo e PC pelo celular | Exige programa nativo que controla o PC de outra pessoa; reavaliar com o Desktop (D45) |
| Vídeo em retransmissão para quem não paga | É o único custo de banda sem receita; voz continua grátis |
| Sala pública e vitrine | Sem data (D34): vitrine vazia não atrai e é onde está a maior carga de moderação |
| Sala por nome livre | Gerou as invasões no concorrente |
| Mapa de salas com localização | Expõe a localização de quem cria a sala |
| Ferramentas na sala | Fora do problema central |
| Efeitos de rosto, troca e desfoque de fundo, reações por gesto | Pesam no computador de quem transmite; não há desfoque nativo |
| Microfone do celular | Reabre o eco |
| Instalar como app (PWA) | Cortado pelo dono; o login no iPhone não tinha como ser testado |
| Limite de pessoas escolhido pelo dono | Sem pedido do público; a senha e o remover cobrem |
| Compartilhar tela no celular pelo navegador | Só no iPhone, sem som; o app Android resolve |
| Passar o dono | O moderador cobre |
| Ocultar o indicador de volume | A sala não tem esse elemento |
| Marca anti-robô de 12 horas | Trocada pelo corte das repetições; volta se o feedback pedir |
| Estéreo e 128 kbps no som da tela, na web | Exige editar o SDP; fica para o desktop |
| Denúncia e painel na sala direta | Revisar a cada 3 meses (D29) |

## O que já atende e não pode se perder (conferido no código)

| Queixa ou feature do concorrente | O que cobre hoje |
|---|---|
| Sala privada adivinhada pelo nome | Código de 10 caracteres aleatórios |
| "Faz a live ser P2P" | Sala direta em malha |
| Foto de perfil paga | Avatar do Google ou do Discord (foto própria só na entrega 4) |
| Sala fixa tipo canal | Link fixo do Plus, sem senha até o A4 |
| Celular: assistir, falar, chat | Entrega 1 |
| Sem login, chat, expulsar e banir | Entrega 1 |
| Conta para reservar o nome, login com Google | Entrega 2 (Discord depois do MVP, por falta das chaves) |

Não existe mais o aviso de IP ao criar e ao entrar (removido pelo dono). O IP é citado nos Termos de Uso e
nas Políticas de Privacidade; a sala protegida é da entrega 4.

## Parâmetros

| Parâmetro | Valor |
|---|---|
| Som da tela e da placa de captura | Sem processamento de voz; SDP não editado (mono, cerca de 32 kbps) |
| Teto do áudio da tela em conexão retransmitida | 64 kbps |
| Tamanho da senha | 4 a 64 caracteres |
| Erros de senha | 3 sem espera; depois 30 s dobrando a cada erro, teto de 15 min; zera após 15 min sem erro |
| Qualidades de quem transmite | Automática, 1080p60, 1080p30, 720p30, 480p30, 360p30, fluidez 15 fps; Plus também 1440p e 2160p, a 60 e a 120 fps **[padrão]** |
| Indicação: uso real | Conta nova que entra em sala em 2 dias diferentes **[padrão]** |
| Retorno semanal | Número definido com 4 semanas de dados reais |
| Moderadores permanentes da sala de link fixo | Só contas, no máximo 10 |
| Registro de acesso | 6 meses |
| QR do celular como câmera | 5 minutos, uso único; 1 celular por pessoa |
| Feedback | Só contas; após 2 minutos na sala; nas 3 primeiras chamadas; uma recusa encerra; texto até 500 caracteres |
| Revisão da moderação na sala direta | A cada 3 meses |
| Período de medição | 3 meses depois do lançamento |

## O que mudou em relação à versão 4

| Item | Versão 4 | Versão 5 |
|---|---|---|
| Base | Entregas 0 a 2 em produção | Entregas 0 a 3 em produção; concorrentes Go Live e Salinha analisados |
| Entrega 4 | Sala no servidor (SFU), pública, moderação e imagens | Sala de 12 com vídeo sob demanda, novos limites, sala protegida por retransmissão, Plus a R$ 9,90 |
| Qualidade grátis (D32) | 720p30, medir por 3 meses | 1080p60 |
| Assistir junto (D30) | Sem definição de preço | Grátis para todos |
| Grupo C (D31) | Desktop, assistir junto, Android | Desktop; assistir junto, bot e indicação; Fase 2; grupos; Android; sala grande |
| Bot do Discord | Fora | Entra, com o assistir junto (D36) |
| Sala pública e vitrine | Entrega 4 | Sem data (D34) |
| Denúncia, painel, classificador, imagens | Entrega 4 | Com os grupos (D40) |
| Social | Amigos, depois grupos, depois mensagens diretas | Uma etapa só, com chat guardado, imagens e mensagens diretas, liberada pelo retorno semanal (D38, D39) |
| Grupo A | 8 itens | Mais a Central de Segurança com canal oficial (D47) |
| Itens [padrão] | Nenhum | Os marcados neste documento |

## O que mudou em relação à versão 3

| Item | Versão 3 | Versão 4 |
|---|---|---|
| Base | MVP pronto (entregas 0 a 4) | Escrito com as entregas 0 a 2 em produção |
| A2 | Áudio só da janela com `windowAudio` | `restrictOwnAudio` contra o eco da própria sala |
| A1 | Opus estéreo a 128 kbps | Sem editar o SDP: mono; teto de 64 kbps no TURN |
| A6 | Marca de 12 horas no cookie | Só o corte das repetições |
| A4 | 5 por sessão e 20 por IP a cada 10 min; senha "ligada por padrão" no link fixo | Bloqueio crescente; senha gerada ao virar Plus; token do dono na entrada; rota de informações neutra |
| B17 | Para todos, vinculado à conta "para contatar", sem contato guardado | Só contas, três primeiras chamadas, uma recusa encerra; e-mail guardado |
| B12 | Aparelho extra na malha, fora do limite de pessoas | Celular conecta só ao computador da pessoa, que repassa |
| B18 | Grupo B, papel só na sala | Dentro da entrega 4; permanente na sala de link fixo (contas, até 10) |
| Cortes | — | Discord, PWA, limite de pessoas, menções, desfoque, passar o dono, indicador de volume |
| Ordem do Grupo A | A propor | A3, A2, A8, A7, A1, A6, A4, A5 |
| Ordem do Grupo B | A propor | 12 itens, na tabela deste documento |
| Ordem do Grupo C | A propor; quatro etapas | Desktop, assistir junto, Android |
| Antes da entrega 3 | Nada entrava antes do fim do MVP | E-mail da conta com faixa de aviso de termos; mensagem da segunda aba |
| Entrega 4 | Como no `DECISOES.md` | Mais moderador, limites de frequência e registro de acesso |
| Regras novas | — | Uso continuado com faixa de aviso; @nome da conta para sempre |
| Itens [padrão] | Vários | Nenhum |

## Fontes técnicas consultadas (2026-11-14)

- `getDisplayMedia`, `windowAudio`, `systemAudio`, `selfBrowserSurface`: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [dados de compatibilidade do MDN](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/MediaDevices.json), [notas do Chrome 141](https://developer.chrome.com/release-notes/141), [especificação](https://w3c.github.io/mediacapture-screen-share/).
- `restrictOwnAudio`: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/restrictOwnAudio), [Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/5SZfg29iwPc).
- Áudio de tela no Firefox e no Safari: [Bugzilla 1541425](https://bugzilla.mozilla.org/show_bug.cgi?id=1541425), [caniuse](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support).
- Opus no WebRTC: [código do libwebrtc](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_coding/codecs/opus/audio_encoder_opus.cc), [remoção de edição de SDP](https://searchfox.org/firefox-main/source/third_party/libwebrtc/g3doc/todo/sdp-munging.md), [w3c/webrtc-extensions #63](https://github.com/w3c/webrtc-extensions/issues/63).
- Ganho automático e `applyConstraints`: [código do Blink](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/modules/mediastream/apply_constraints_processor.cc).
- `setSinkId`: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId), [Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/), [WebKit 320087](https://bugs.webkit.org/show_bug.cgi?id=320087).
- Desfoque de fundo: [chromestatus](https://chromestatus.com/api/v0/features/5077577782263808), [blog do Chrome](https://developer.chrome.com/blog/background-blur).
- Tela cheia no iPhone: [dados de compatibilidade do MDN](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Element.json), [WebKit 212934](https://bugs.webkit.org/show_bug.cgi?id=212934).
- Turnstile: [validação no servidor](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [configurações do widget](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/).
- Atividades do Discord: [rede](https://docs.discord.com/developers/activities/development-guides/networking); medida da ANPD de 12/08/2026: [Agência Gov](https://agenciagov.ebc.com.br/noticias/202608/em-medida-preventiva-anpd-determina-que-discord-suspenda-transmissoes-ao-vivo).
- YouTube e Twitch: [IFrame API](https://developers.google.com/youtube/iframe_api_reference), [funcionalidade mínima exigida](https://developers.google.com/youtube/terms/required-minimum-functionality), [Twitch Embed](https://dev.twitch.tv/docs/embed/everything/).
- Limites da malha: [código do Chromium](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/modules/peerconnection/rtc_peer_connection.cc), [BlogGeek](https://bloggeek.me/webrtc-p2p-mesh/).

Não confirmado em fonte primária: áudio de sistema no Chrome do macOS (só teste de terceiros); se o Chrome
respeita teto de taxa em áudio (o aceite do A1 testa com dublê); placas de captura nos navegadores.
