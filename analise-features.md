# Estudo de caso: features lançadas pelo concorrente (Go Live)

> As decisões finais estão no `POS-MVP.md` (versão 3), que junta e substitui os documentos pós-MVP citados aqui.

Base: `features.md`, com 13 posts do próprio desenvolvedor, de 18/agosto a 29/outubro de 2026. Comparado
com o `DECISOES.md` (versão de 2026-11-14), o `objecoes.md`, o `analise-objecoes.md` e o plano pós-MVP
das objeções, todos só para leitura. Nada do que está sendo implementado foi alterado.

**Como contei:** uma linha por feature anunciada. O post de lançamento (18/agosto) conta como as features
de base. Teasers (24/agosto e 01/setembro) contam à parte, marcados como tal. Uma feature pode entrar em
mais de um tema.

**Referência:** `F` + `dia.número`, como em `F25.2` (25/agosto, item 2 do post). O prefixo `F` evita
confusão com os itens de `objecoes.md`, que usam as mesmas datas. Setembro e outubro usam `F13/09.1`.

## Índice das 47 features

| Ref. | Feature |
|---|---|
| F18.1 | Transmitir tela e câmera com som, sem login |
| F18.2 | Sala por nome livre: "o id ou nome da call atual, ou qualquer coisa" |
| F18.3 | 100% open source |
| F19.1 | Chat |
| F19.2 | Volume individual por pessoa ou por transmissão |
| F19.3 | Estabilidade de transmissão |
| F19.4 | Supressão de ruído no microfone |
| F19.5 | Conta opcional "pra ninguém mais roubar seu nome" |
| F19.6 | Lista de salas públicas |
| F19.7 | Seletor de qualidade de transmissão |
| F20.1 | 2K a 120 fps grátis |
| F20.2 | Layout melhor: telas, participantes, chat |
| F20.3 | Layout de celular melhor |
| F20.4 | Instalar o site como app no celular e no PC |
| F20.5 | Links clicáveis no chat |
| F20.6 | Correção de bugs de conexão |
| F20.7 | Efeitos sonoros (menção, entrada na call, início de transmissão), desligáveis |
| F22.1 | Bot do Discord que cria a sala no site quando uma call do servidor está em uso |
| F22.2 | Qualidade em salas com mais de 20 pessoas |
| F22.3 | Login opcional com Google e Discord |
| F22.4 | Escolher entrada e saída de áudio |
| F22.5 | Melhorias de interface no celular e no computador |
| F24.1 | Teaser: vídeo do YouTube sincronizado na sala; só quem adiciona controla |
| F25.1 | Fontes de vídeo: YouTube e Twitch sem compartilhar a tela |
| F25.2 | Sala privada com código para entrar |
| F25.3 | Foco e hiperfoco: transmissão grande ou gigante |
| F25.4 | Menções no chat, com aviso para quem foi mencionado |
| F25.5 | Layout novo, responsivo |
| F26.1 | Mapa-múndi de salas, com posição geográfica |
| F26.2 | Administradores e permissões por sala |
| F26.3 | Descrição e categoria da sala |
| F27.1 | App: escolher exatamente quais programas têm o som transmitido |
| F30.1 | Música sincronizada na sala, posta pelo dono e pelos administradores |
| F30.2 | Expulsar e banir |
| F30.3 | Fonte de vídeo e de música aceita arquivo local |
| F30.4 | Limite de participantes definido pelo dono |
| F30.5 | Layout de celular e geral melhorado |
| F30.6 | Mapa de salas melhorado |
| F30.7 | Correção: transmissões carregando sem fim |
| F01/09.1 | Teaser: app de celular com transmissão de tela |
| F13/09.1 | Ligar para um amigo e fazer o celular ou o computador dele tocar |
| F13/09.2 | Grupos permanentes, com chats, calls, cargos e permissões |
| F13/09.3 | Temas próprios ou da comunidade |
| F17/10.1 | Ferramentas compartilhadas na sala: roleta, notas, editor de código, planilha, lousa, calculadora |
| F29/10.1 | Celular como câmera ou microfone por QR Code, até 4K |
| F29/10.2 | Efeitos de rosto e troca de fundo na câmera |
| F29/10.3 | Reações na câmera por gesto: joinha, palmas, piscar |

---

## Lista 1: temas por quantidade de features

| # | Tema | Features | Qtd. |
|---|---|---|---|
| 1 | Layout e controles da sala | F19.2, F20.2, F20.3, F22.5, F25.3, F25.5, F30.5 | 7 |
| 2 | Qualidade, estabilidade e conexão | F19.3, F19.7, F20.1, F20.6, F22.2, F30.7 | 6 |
| 3 | Assistir e ouvir junto | F24.1, F25.1, F30.1, F30.3 | 4 |
| 3 | Controle do dono e moderação | F25.2, F26.2, F30.2, F30.4 | 4 |
| 3 | Descoberta de salas | F19.6, F26.1, F26.3, F30.6 | 4 |
| 3 | Chat e avisos | F19.1, F20.5, F20.7, F25.4 | 4 |
| 3 | Conta e social | F19.5, F22.3, F13/09.1, F13/09.2 | 4 |
| 8 | Base do lançamento | F18.1, F18.2, F18.3 | 3 |
| 8 | Áudio | F19.4, F22.4, F27.1 | 3 |
| 8 | Apps (PWA, desktop, celular) | F20.4, F27.1, F01/09.1 | 3 |
| 8 | Câmera e diversão | F29/10.1, F29/10.2, F29/10.3 | 3 |
| 12 | Isolados: bot do Discord, temas da comunidade, ferramentas | F22.1, F13/09.3, F17/10.1 | 3 |

## Lista 2: linha do tempo, por fase

| Fase | Datas | Posts | O que priorizou |
|---|---|---|---|
| 1. Fazer funcionar | 18 a 22/ago | 4 em 5 dias | Chat, estabilidade, qualidade, conta opcional, layout, áudio |
| 2. Sala rica | 24 a 30/ago | 5 em 7 dias | Assistir junto, código na sala privada, moderação, descoberta, app desktop |
| 3. Plataforma | set a out | 4 em 2 meses | App de celular, ligar, grupos, temas, ferramentas, efeitos de câmera |

- O ritmo caiu de 9 posts em 13 dias para 4 posts em dois meses.
- O nome mudou de "AntiJanja" para "Go Live". A hashtag `#golive` aparece a partir de 22/ago; o post de 17/out já usa só "Go Live".
- Há sinais de monetização, não confirmados:
  - um card do patrocinador "Square Cloud" na barra lateral da sala (imagem de 01/09);
  - etiquetas "Pro Max" nas ferramentas (imagem de 17/10), legíveis só em parte.

## Lista 3: features que responderam a objeções

Cruzamento entre `features.md` e `objecoes.md`. "Depois" indica objeção do mesmo tipo publicada depois
da feature, ou seja, o problema não acabou.

| Feature | Objeção que ela responde | Depois da feature? | Leitura |
|---|---|---|---|
| F27.1 App que escolhe o som por programa | Áudio e eco (26 itens) | **Sim**: 30.5, 02/09.1, 13/09.4, 29/10.1 | O app resolve só para quem instala. Quem fica no navegador continua com eco. Confirma que o A2 (correção na web) valem mais que o desktop. |
| F25.2 Código na sala privada | Sala invadida, falta de senha (18.1 a 25.1) | **Não** (só 03/09.3, sobre moderação) | A invasão vinha do F18.2, sala por nome livre. Depois do código, as queixas pararam. Nós já nascemos com código de 10 caracteres. |
| F19.4 Supressão de ruído no microfone | Áudio "abafado" (19.5, 28.1) | Sim, 28.1 | Hipótese: o processamento também alcança o som da tela. Reforça o A1 (som da tela sem processamento). |
| F20.1 2K a 120 fps grátis | FPS do jogo cai (24.2), Windows travando (22.2) | Sim | Qualidade alta pesa no computador de quem transmite. Reforça o A7 (escolher qualidade menor). |
| F19.7 Seletor de qualidade | 18.5 | Não | Coincide com o A7. |
| F19.2 Volume por pessoa | 18.4 | Não | Coincide com o B4. |
| F22.4 Entrada e saída de áudio | 20.2 | Não | O B6 cobre a entrada; falta a saída (alto-falante ou fone). |
| F25.3 Foco e hiperfoco | 18.7, 25.7 | Sim, 27.1 e 13/09.1 | O foco sozinho não bastou; pediram também esconder as barras laterais (B2). |
| F25.1 YouTube e Twitch | 26.1, 27.4, 30.1 | Sim, 27.4 (playlist) e 30.1 | Ainda pediram playlist e outras fontes. |
| F30.2 Expulsar e banir | 03/09.3 (moderação) | Sim | Expulsar não responde a "alguém criminoso usa". |
| F22.1 Bot do Discord | 19.3, 21.8, 22.5 (atividade) | Não | Aproxima-se do nosso lançador (D15), mas como bot. |
| F01/09.1 App de celular (teaser) | 19.7, 13/09.2, 13/09.3 | **Sim**, 13/09 | Doze dias depois do teaser ainda pediam transmitir a tela do celular. |
| F20.7 Efeitos sonoros | 30.4 (som de aviso no chat) | Sim | O pedido de 30.4 veio depois; talvez fosse outro som, ou a pessoa não achou a opção. |
| F13/09.3 Temas da comunidade | 03/09.2 (plugins e temas) | Não | Atendeu um pedido que nós deixamos fora. |

---

## Cruzamento com o `DECISOES.md` e o plano pós-MVP das objeções

Legenda: **Atende** = já está no MVP; **Pós-MVP** = previsto no `DECISOES.md` ou no plano pós-MVP;
**Diferente** = fazemos de outro jeito, de propósito; **Não atende** = não aparece em nenhum dos dois;
**Fora** = excluído de propósito.

| Feature | Situação | Onde | Observação |
|---|---|---|---|
| F18.1 Sem login | Atende | Entrega 1 | — |
| F18.2 Sala por nome livre | Diferente | Entrega 1: código de 10 caracteres | O nome livre gerou as invasões. Não copiar. |
| F18.3 Open source | Diferente | `COMERCIAL.md` | Código público sob licença não comercial, não "open source". Sem PR de terceiros previsto. |
| F19.1 Chat | Atende | Entrega 1 | — |
| F19.2 Volume por pessoa | Pós-MVP | B4 | — |
| F19.3, F20.6, F30.7 Estabilidade | Atende | Entrega 1 (reconexão), entrega 4 (SFU) | — |
| F19.4 Supressão de ruído | Atende | Entrega 1, nativa do navegador | Só no microfone (A1). |
| F19.5 Conta para reservar o nome | Atende | Entrega 2, @nome único | — |
| F19.6, F30.6 Lista de salas públicas | Atende | Entrega 4, vitrine | Nossa vitrine só lista salas do Plus, pagas em ouro. |
| F19.7 Seletor de qualidade | Pós-MVP | A7 | — |
| F20.1 2K a 120 fps grátis | **Fora** | "Fora do produto: resolução acima de 1080p60"; grátis 720p30 | Diferença de modelo. Ver DF12. |
| F20.2, F20.3, F22.5, F25.5, F30.5 Layout | Parcial | Entrega 1: destaque e miniaturas; B1, B9 | — |
| F20.4 Instalar como app (PWA) | **Não atende** | — | Barato: manifesto e ícone. Responde em parte a "quero um app". |
| F20.5 Links clicáveis no chat | **Não atende** | Entrega 1 proíbe "link com prévia"; link clicável sem prévia não é citado | Pequeno. |
| F20.7 Efeitos sonoros | Parcial | B8 (só mensagem no chat) | Entrada na sala e início de transmissão não estão previstos. |
| F22.1 Bot do Discord | **Fora** | "Bots e integrações de terceiros"; D15 e D16 | O lançador do D15 é a nossa versão; o bot automático seria outra exceção. |
| F22.2 Mais de 20 pessoas | Atende | Entrega 4, até 50 no SFU | Pago em ouro. |
| F22.3 Login Google e Discord | Atende | Entrega 2 | — |
| F22.4 Entrada e saída de áudio | Parcial | B6 (só microfone e câmera) | Falta a saída de áudio. |
| F24.1, F25.1 YouTube e Twitch | Pós-MVP | Grupo C, "assistir junto" | — |
| F25.2 Código na sala privada | Atende | Entrega 1 (toda sala tem código) e A4 (senha) | — |
| F25.3 Foco e hiperfoco | Parcial | Entrega 1 (destaque), A5, B1 | — |
| F25.4 Menções no chat | **Não atende** | — | Pequeno; combina com o B8. |
| F26.1 Mapa-múndi de salas | **Não atende** | — | Expõe localização; o público inclui quem não tem conta, sem verificação de idade. |
| F26.2 Administradores e permissões | **Não atende** | Sala direta: só o dono; B7 transfere o dono | — |
| F26.3 Descrição e categoria | **Fora** no MVP | Entrega 4: "não criar categorias, busca" | A vitrine tem só título. |
| F27.1 Som por programa (app) | Pós-MVP | A2, Grupo C (desktop) | A web tenta primeiro com `windowAudio`. |
| F30.1 Música sincronizada | **Fora** | D20 (música ambiente) | O D20 tratou de música de fundo; música sincronizada é "ouvir junto". |
| F30.2 Expulsar e banir | Atende | Entrega 1 | — |
| F30.3 Arquivo local como fonte | **Não atende** | — | Subir o arquivo conflitaria com "não guardar nada". Tocar o vídeo numa aba e compartilhar a aba já funciona. |
| F30.4 Limite de pessoas pelo dono | Parcial | Entrega 4 (dono escolhe o máximo no SFU); sala direta fixa em 6 | — |
| F01/09.1 App de celular | Pós-MVP | Grupo C, Android | — |
| F13/09.1 Ligar para amigo | Pós-MVP | Social: "amigos e convite direto" | Tocar o aparelho exige notificação (Android, PWA). |
| F13/09.2 Grupos permanentes | Pós-MVP | Social: "grupos com salas fixas" | — |
| F13/09.3 Temas da comunidade | **Fora** | Entrega 2: "não criar editor de temas, temas enviados por usuário"; Fora (03/09.2) | — |
| F17/10.1 Ferramentas na sala | **Não atende** | "Recurso fora do escopo" | Seis ferramentas; cada uma é um produto pequeno. |
| F29/10.1 Celular como câmera por QR | **Não atende** | — | Na nossa arquitetura, o celular entraria na sala como segundo aparelho da mesma pessoa. |
| F29/10.2 Efeitos e fundo na câmera | **Não atende** | Fora: "efeitos na câmera de **outras pessoas**"; a própria câmera não é citada | Desfoque de fundo nativo existe em alguns navegadores e sistemas. |
| F29/10.3 Reações por gesto | **Não atende** | — | Exige reconhecimento de imagem no navegador; pesa no computador de quem transmite. |

---

## Resumo

- **O concorrente cresceu em largura, não no problema central.** Foram 47 features em 10 semanas, e a
  queixa de áudio e eco continuou até 29/out. O único remédio (F27.1) exige instalar o app. Isso reforça a
  ordem do `POS-MVP.md`: Grupo A antes de qualquer feature nova.
- **Ele corrigiu um erro com que nós já começamos certo.** O F18.2 (sala por nome) gerou as invasões, e
  o F25.2 (código) as encerrou. Nosso MVP já nasce com código aleatório.
- **Diferença de modelo:** ele dá tudo grátis (2K a 120 fps, vitrine, ferramentas) e parece monetizar com
  patrocínio e, talvez, um plano "Pro Max". Nós cobramos pelo Plus (qualidade, link fixo, sala no
  servidor). O F20.1 é o ponto em que o público mais vai comparar.
- **Baratas e úteis, ainda fora do plano:** instalar como app (F20.4), links clicáveis e menções no chat
  (F20.5, F25.4), saída de áudio (F22.4), celular como câmera (F29/10.1) e administradores na sala (F26.2).
- **Arriscadas, para não copiar sem decisão:** mapa com localização (F26.1), arquivo local e música
  (F30.1, F30.3: direitos autorais), temas da comunidade (F13/09.3: moderação), ferramentas (F17/10.1:
  escopo) e reações por gesto (F29/10.3: desempenho).
- **Decisões:** as respostas do dono do produto estão no `POS-MVP.md` (versão 3, D1 a D31).
