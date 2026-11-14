# Pós-MVP guiado pelas features do concorrente

Versão 2, de 2026-11-14, revisada de forma adversarial. Complementa o `DECISOES.md` e o
`POS-MVP-OBJECOES.md`; **não altera nenhum dos dois**. Origem: `analise-features.md`, que analisa 47
features anunciadas pelo desenvolvedor do concorrente (Go Live) entre 18/agosto e 29/outubro de 2026
(`features.md`).

## Quando e como usar

- Tudo aqui vem **depois do MVP** (entregas 0 a 4) e segue a sequência do `POS-MVP-OBJECOES.md`: spike S1,
  Grupo A, lançamento, Grupo B e Grupo C. **Este arquivo não acrescenta nada ao Grupo A.**
- Os itens novos continuam a numeração de lá, de B12 a B18. O B6 e o B8 de lá ganham um acréscimo,
  descrito abaixo.
- Em conflito com o `DECISOES.md`, vale o `DECISOES.md`. Pare e pergunte.
- Valores novos vão para `packages/config`. Nenhuma API de navegador usada de memória: confira a
  documentação da versão.
- Itens marcados **[padrão]** foram definidos por quem escreveu este documento, não pelo dono do produto.

## Decisões

| # | Decisão |
|---|---|
| DF1 | Celular como câmera por QR Code, **só câmera**, sem microfone: Grupo B (B12) |
| DF2 | Saída de áudio entra no seletor do B6, só onde o navegador oferece |
| DF3 | Assistir junto: só YouTube e Twitch. Sem arquivo local e sem música sincronizada |
| DF4 | Câmera: desfoque de fundo só onde o navegador deixa o site ligar e desligar (B13). Sem efeitos, troca de fundo própria ou reações por gesto |
| DF5 | Instalar como app (PWA): Grupo B (B16), com teste de login no iPhone |
| DF6 | Chat: links clicáveis com restrição e menções escolhidas na lista de quem está na sala (B14) |
| DF7 | Cargos e permissões configuráveis: etapa Social, junto dos grupos. Na sala direta, só o B7 (passar o dono) |
| DF8 | Limite de pessoas escolhido pelo dono na sala direta, de 2 a 6: Grupo B (B15) |
| DF9 | Mapa de salas com localização: fora |
| DF10 | Descrição e categoria da sala pública: Fase 2, junto do destaque na vitrine |
| DF11 | Bot do Discord: fora, por escopo. A integração continua só o lançador (D15) |
| DF12 | Qualidade grátis: manter 720p30 e medir nos 3 primeiros meses depois do lançamento, com a conversão e o feedback do B17 |
| DF13 | Ferramentas compartilhadas na sala: fora |
| DF14 | Ligar para amigo: etapa Social, depois do Android e da notificação web |
| DF15 | O B8 vira "sons de aviso"; entrada na sala e início de transmissão só em salas de até 6 pessoas |
| DF16 | Feedback opcional ao sair da sala: Grupo B (B17) |
| DF17 | Moderador com papel fixo nas salas no servidor (grande, pública e protegida): Grupo B (B18) |

---

## Grupo B: acréscimos

| # | Item | Origem | Regra |
|---|---|---|---|
| B6 (acréscimo) | Saída de áudio | F22.4, objeção 20.2 | O seletor do B6 ganha a saída (fone ou alto-falante), com `setSinkId`. Detectar a função antes de mostrar: onde o navegador não tiver, o seletor de saída não aparece. O suporte no Safari é incerto; não presuma. |
| B8 (acréscimo) | Sons de aviso | F20.7, objeção 30.4 | Sons para mensagem, menção, entrada na sala e início de transmissão, cada um ligável nas configurações. Mensagem toca só com a aba fora de foco, como já decidido. **Entrada e início de transmissão só tocam na sala direta e na protegida** (até 6 pessoas). Na grande e na pública: menção e, para o dono e os moderadores, mão levantada. |
| B12 | Celular como câmera | F29/10.1 | Ver abaixo. |
| B13 | Desfoque de fundo, só onde o site controla | F29/10.2 | O botão aparece só quando a faixa da câmera informa que o desfoque pode ser ligado **e** desligado (capacidade `backgroundBlur` com os dois valores). Onde o sistema só deixa observar (macOS e ChromeOS, pela documentação de 2023), o botão não aparece. Nenhum processamento de imagem nosso. A API saiu como teste de origem no Chrome 114 a 117: confirme o estado atual antes de começar; se não estiver disponível, o item sai. |
| B14 | Links clicáveis e menções no chat | F20.5, F25.4 | Ver abaixo. |
| B15 | Limite de pessoas na sala direta | F30.4 | O dono escolhe o máximo, de 2 a 6, ao criar ou dentro da sala. O Durable Object recusa a entrada acima do limite. Baixar o limite não expulsa quem já está dentro. Na sala de link fixo, o limite fica guardado junto ao link fixo, como a senha (A4) **[padrão]**. |
| B16 | Instalar como app (PWA) | F20.4 | Ver abaixo. |
| B17 | Feedback ao sair da sala | DF12 | Ver abaixo. |
| B18 | Moderador nas salas no servidor | F26.2 | O dono de uma sala grande, pública ou protegida promove participantes a moderador. O moderador silencia, remove, bane e tira do palco; não chama ao palco, não promove outros e não encerra a sala **[padrão]**. Papel fixo, guardado no Durable Object, verificado pelo servidor. Sem permissões configuráveis (ficam para a etapa Social). |

### B12. Celular como câmera

- No computador, a pessoa pede "usar o celular como câmera" e vê um QR Code.
- O QR leva a um link com um token de uso único e curta duração **[padrão: 5 minutos]**, ligado à sessão
  dela e à sala. Gerado e validado pelo servidor. O token dispensa o Turnstile no celular, porque a
  pessoa já passou por ele no computador.
- **Só câmera.** O microfone do celular fica fora: perto das caixas de som do computador, ele captaria a
  sala de volta e reabriria a queixa de eco.
- **Identidade de aparelho:** hoje uma segunda conexão com o mesmo participante derruba a primeira
  (`apps/api/src/room.ts`, "replaced"). O celular precisa entrar como **aparelho extra** do participante,
  com identificador próprio no protocolo e no Durable Object. Esforço M a G, com mudança em
  `packages/protocol`, no Durable Object e em `packages/media`.
- O aparelho extra **só envia vídeo**: não recebe áudio nem vídeo dos outros, não aparece na lista de
  pessoas e não tem chat.
- Limites:
  - o vídeo do celular conta nos vídeos da pessoa (1, ou 2 no Plus) e no teto de 4 da sala;
  - **[padrão]** o aparelho extra conta no limite de pessoas da sala direta (6, ou o do B15), porque é
    mais uma ponta da malha.
- Qualidade: a do plano da pessoa (720p30, ou 1080p60 no Plus), não 4K.
- Antes de ligar, avisar o consumo: na malha, o celular envia o vídeo a cada participante (numa sala de
  6, cerca de 5 × 1,5 Mbps de upload). Recomendar Wi-Fi.
- Sair da sala no computador desconecta o celular.
- **Aceite:** com o QR, o celular vira a câmera da pessoa; o vídeo aparece para os outros como dela; o
  computador continua conectado; numa sala cheia, o QR é recusado com mensagem clara; um QR usado ou
  vencido não entra.

### B14. Links e menções no chat

- **Links:** só `http` e `https` viram link; qualquer outro esquema fica como texto. Abrem em aba nova com
  `rel="noopener noreferrer"`. Sem prévia (a entrega 1 proíbe prévia de link).
- **Links em sala pública:** clicáveis só nas mensagens de quem tem conta, mostrando o domínio ao lado. De
  quem não tem conta, aparecem como texto. As mensagens já passam pelo filtro de palavras e pelo
  classificador da entrega 4.
- **Menções:** digitar `@` abre a lista de quem está na sala. A mensagem guarda o identificador do
  participante e mostra o apelido; não se menciona digitando o apelido, porque ele não é único e se
  confunde com o @nome da conta. Validada pelo esquema de `packages/protocol`: só vale menção a quem está
  na sala.
- Quem é mencionado vê a mensagem destacada e ouve o som de menção (B8).

### B16. Instalar como app (PWA)

- **Por quê:** o concorrente tem desde 20/ago (F20.4); o público pede "um app" (28.2, 28.3).
- **Regra:**
  - Manifesto com nome, ícones e cores dos tokens do `DESIGN.md`; o navegador oferece "instalar".
  - **Sem cache offline** **[padrão]**: o app instalado sempre carrega a versão publicada. O Chrome deixou
    de exigir service worker para instalar pelo menu (versão 108 no celular e 112 no computador);
    confira os critérios atuais antes de decidir se precisa de um.
  - Nenhuma mudança na API nem na mídia.
- **Risco:** no iPhone, o app instalado tem cookies separados dos do Safari, e o login com Google ou
  Discord pode abrir fora do app e não voltar. Se isso acontecer e não houver correção simples, o login no
  app do iPhone mostra a instrução de entrar pelo Safari.
- **Aceite:** no Chrome do Windows e do Android e no Safari do iPhone, o site instala, abre em janela
  própria com a versão do último deploy, e o login com Google e com Discord termina dentro do app.

### B17. Feedback ao sair da sala

- Ao sair de uma sala em que ficou ao menos 2 minutos **[padrão]**, a pessoa vê uma pergunta opcional:
  "Como foi a qualidade?", de 1 a 5, com campo de texto de até 500 caracteres **[padrão]**.
- Fechar sem responder não pergunta de novo na mesma sessão.
- Guardar: nota, texto, tipo de sala, plano de quem respondeu, navegador e data. Sem o conteúdo da sala.
- Uma tabela nova no D1 (só adiciona) e uma rota com limite por IP e por sessão.
- Serve à métrica do DF12.
- **Aceite:** responder grava uma linha; ignorar não grava nada; mais de 5 envios por IP em 10 minutos
  são recusados **[padrão]**.

## Etapas depois do Grupo B

| Etapa | Acréscimo |
|---|---|
| Social | Cargos e permissões configuráveis, criados junto dos grupos permanentes. O papel fixo de moderador do B18 vira um dos cargos (DF7) |
| Social | Ligar para amigo, só depois do Android e da notificação web do PWA. Infra: Web Push, com as chaves nos segredos do Worker, e notificação do Android (DF14) |
| Fase 2 | Descrição curta e categoria de uma lista fixa na sala pública, junto do destaque na vitrine. A descrição passa pelo filtro de palavras e pelo classificador (DF10) |

## Métrica: qualidade grátis (DF12)

Nos 3 primeiros meses depois do lançamento, acompanhar:

- a conversão de conta gratuita em Plus, pelo D1;
- a nota média do B17 por plano e as respostas de texto que citam qualidade ou o concorrente.

Ao fim do período, levar os números ao dono do produto. Nada muda antes disso.

## Fora, com o motivo

| Feature do concorrente | Ref. | Motivo |
|---|---|---|
| 2K a 120 fps grátis | F20.1 | Acima de 1080p60 está fora do produto; o grátis segue 720p30 (DF12) |
| Sala por nome livre | F18.2 | Gerou as invasões no concorrente; nós usamos código aleatório |
| Bot do Discord | F22.1 | Escopo e outra exceção à regra de integrações. É viável: um Durable Object manteria a conexão com o Discord por custo baixo. Reabrir só se o lançador for muito usado (DF11) |
| Mapa de salas com localização | F26.1, F30.6 | Expõe a localização de quem cria a sala, inclusive de quem não tem conta (DF9) |
| Música sincronizada e arquivo local | F30.1, F30.3 | Escopo e licença de música. Tocar um vídeo numa aba e compartilhar a aba já funciona sem recurso novo (DF3) |
| Temas da comunidade | F13/09.3 | Já fora (`POS-MVP-OBJECOES.md`); o Plus mantém 6 temas prontos |
| Ferramentas na sala | F17/10.1 | Fora do problema central; nenhuma objeção pediu (DF13) |
| Efeitos de rosto, troca de fundo própria, reações por gesto | F29/10.2, F29/10.3 | Pesam no computador de quem transmite (risco 2 do `DECISOES.md`); fica só o desfoque do sistema (DF4) |
| Microfone do celular | F29/10.1 | Reabre o eco (DF1) |

## O que já atende

| Feature do concorrente | Ref. | Onde está |
|---|---|---|
| Sem login | F18.1 | Entrega 1 |
| Chat | F19.1 | Entrega 1 |
| Supressão de ruído no microfone | F19.4 | Entrega 1; o som da tela sai sem processamento (A1) |
| Conta para reservar o nome | F19.5 | Entrega 2, @nome |
| Login Google e Discord | F22.3 | Entrega 2 |
| Lista de salas públicas | F19.6 | Entrega 4, vitrine |
| Mais de 20 pessoas | F22.2 | Entrega 4, sala no servidor até 50 |
| Sala privada com código | F25.2 | Entrega 1 (código) e A4 (senha) |
| Expulsar e banir | F30.2 | Entrega 1 |
| Volume por pessoa, seletor de qualidade, entrada de áudio | F19.2, F19.7, F22.4 | B4, A7, B6 |
| Som por programa | F27.1 | S1, A2 e desktop |
| YouTube e Twitch, app de celular, grupos | F25.1, F01/09.1, F13/09.2 | Grupo C e etapa Social |

## Parâmetros novos

| Parâmetro | Valor |
|---|---|
| Limite de pessoas escolhido pelo dono na sala direta | 2 a 6 |
| Validade do QR do celular como câmera | 5 minutos, uso único **[padrão]** |
| Tempo mínimo na sala para pedir feedback | 2 minutos **[padrão]** |
| Texto do feedback | até 500 caracteres **[padrão]** |
| Envios de feedback | 5 por IP a cada 10 minutos **[padrão]** |
| Período de medição da qualidade grátis | 3 meses depois do lançamento |

## O que mudou em relação à versão 1

| Item | Versão 1 | Versão 2 | Motivo |
|---|---|---|---|
| Celular (B12) | Câmera e microfone; esforço M | Só câmera; identidade de aparelho; só envia; aviso de dados; esforço M a G | O microfone reabre o eco; o código atual derruba a 2ª conexão da mesma pessoa |
| PWA | A9, no Grupo A | B16, no Grupo B, com teste de login no iPhone | Não bloqueia o lançamento; cookies separados no app do iPhone |
| Desfoque (B13) | Onde o navegador declarar suporte | Só onde o site liga e desliga; confirmar a API antes | No macOS e no ChromeOS o site só observa; a API saiu como teste |
| Chat (B14) | Menção por `@apelido`; links para todos | Menção pela lista, com id; links só `http(s)`; em sala pública, só de quem tem conta | Apelido não é único; links em sala pública são vetor de golpe |
| Sons (B8) | Todos os sons em toda sala | Entrada e transmissão só em salas de até 6 | Barulho em sala de 50 |
| Métrica (DF12) | "Reclamações", sem fonte | Feedback ao sair da sala (B17) | Não havia canal de reclamação |
| Moderação | Só o dono até a etapa Social | Moderador fixo nas salas no servidor (B18) | Sala de 50 com um único moderador |
| Bot do Discord | "Workers não mantêm a conexão" | Viável; fora por escopo | O motivo técnico estava errado |
| Arquivo local | Fora por direito autoral | Fora por escopo | Compartilhar a aba já permite tocar um arquivo |
| Limite (B15) | Sem regra para a sala fixa | Limite guardado junto ao link fixo | A sala fixa é permanente |

## Fontes técnicas consultadas

- [Chrome, critérios de instalação revistos](https://developer.chrome.com/blog/update-install-criteria): service worker com `fetch` deixou de ser exigido para instalar pelo menu (108 no celular, 112 no computador).
- [MDN, PWAs instaláveis](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Installable_PWAs).
- [Chrome, desfoque do fundo da câmera](https://developer.chrome.com/blog/background-blur): `backgroundBlur`, teste de origem do Chrome 114 ao 117; controle só no Windows.
- [MDN, `setSinkId`](https://developer.mozilla.org/docs/Web/API/HTMLMediaElement/setSinkId) e [caniuse](https://caniuse.com/mdn-api_htmlmediaelement_setsinkid): Chrome, Edge e Firefox 116+; Safari incerto.
- Código da `main` (commit `b1c809e`): `apps/api/src/room.ts`, conexão substituída quando o mesmo participante conecta de novo.
