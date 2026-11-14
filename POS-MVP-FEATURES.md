# Pós-MVP guiado pelas features do concorrente

Versão 1, de 2026-11-14. Complementa o `DECISOES.md` e o `POS-MVP-OBJECOES.md`; **não altera nenhum dos
dois**. Origem: `analise-features.md`, que analisa 47 features anunciadas pelo desenvolvedor do concorrente
(Go Live) entre 18/agosto e 29/outubro de 2026 (`features.md`).

## Quando e como usar

- Tudo aqui vem **depois do MVP** (entregas 0 a 4) e segue a sequência do `POS-MVP-OBJECOES.md`: spike S1,
  Grupo A, lançamento, Grupo B e Grupo C.
- Os itens novos continuam a numeração de lá: A9 no Grupo A; B12 a B15 no Grupo B. O B6 e o B8 de lá
  ganham um acréscimo, descrito abaixo.
- Em conflito com o `DECISOES.md`, vale o `DECISOES.md`. Pare e pergunte.
- Valores novos vão para `packages/config`. Nenhuma API de navegador usada de memória: confira a
  documentação da versão.
- Itens marcados **[padrão]** foram definidos por quem escreveu este documento, não pelo dono do produto.

## Decisões

| # | Decisão |
|---|---|
| DF1 | Celular como câmera ou microfone por QR Code: Grupo B (B12) |
| DF2 | Saída de áudio entra no seletor do B6 |
| DF3 | Assistir junto: só YouTube e Twitch. Sem arquivo local e sem música sincronizada |
| DF4 | Câmera: só o desfoque de fundo nativo do navegador ou do sistema (B13). Sem efeitos, troca de fundo ou reações por gesto |
| DF5 | Instalar como app (PWA): Grupo A (A9) |
| DF6 | Chat: links clicáveis e menções, no Grupo B (B14) |
| DF7 | Administradores com permissões configuráveis, na etapa Social, junto dos grupos. Na sala direta, só o B7 (passar o dono) |
| DF8 | Limite de pessoas escolhido pelo dono na sala direta, de 2 a 6: Grupo B (B15) |
| DF9 | Mapa de salas com localização: fora |
| DF10 | Descrição e categoria da sala pública: Fase 2, junto do destaque na vitrine |
| DF11 | Bot do Discord: fora. A integração continua só o lançador (D15) |
| DF12 | Qualidade grátis: manter 720p30 e medir nos 3 primeiros meses depois do lançamento |
| DF13 | Ferramentas compartilhadas na sala: fora |
| DF14 | Ligar para amigo: etapa Social, depois do Android e da notificação web |
| DF15 | O B8 vira "sons de aviso": mensagem, menção, entrada na sala e início de transmissão |

---

## Grupo A: acréscimo

### A9. Instalar como app (PWA)

- **Por quê:** o concorrente tem desde 20/ago (F20.4); o público pede "um app" (28.2, 28.3). Isso
  responde em parte antes do desktop e do Android.
- **Regra:**
  - Manifesto com nome, ícones e cores dos tokens do `DESIGN.md`; o navegador oferece "instalar".
  - **Sem cache offline** **[padrão]**: o app instalado sempre carrega a versão publicada, para não servir
    código velho depois de um deploy. Se o critério de instalação do navegador exigir service worker,
    usar um que não guarda as páginas em cache. Confira os critérios atuais na documentação do Chrome.
  - Nenhuma mudança na API nem na mídia.
- **Aceite:** no Chrome do Windows e do Android, o site oferece instalação e abre em janela própria com a
  versão do último deploy.

## Grupo B: acréscimos

| # | Item | Origem | Regra |
|---|---|---|---|
| B6 (acréscimo) | Saída de áudio | F22.4, objeção 20.2 | O seletor do B6 ganha a saída (fone ou alto-falante), com `setSinkId`. No navegador sem suporte (Safari), o seletor de saída não aparece. |
| B8 (acréscimo) | Sons de aviso | F20.7, objeção 30.4 | Sons para mensagem, menção, entrada na sala e início de transmissão. Cada um liga ou desliga nas configurações. A mensagem toca só com a aba fora de foco, como já decidido. |
| B12 | Celular como câmera ou microfone | F29/10.1 | Ver abaixo. |
| B13 | Desfoque de fundo nativo | F29/10.2 | Onde o navegador declarar suporte ao desfoque de fundo da plataforma, mostrar o botão; onde não declarar, o botão não aparece. Nenhum processamento de imagem nosso. Confira o nome e o suporte da restrição na documentação atual. |
| B14 | Links clicáveis e menções no chat | F20.5, F25.4 | Link clicável **sem prévia**, aberto em aba nova com `rel="noopener noreferrer"`. Menção por `@apelido` destaca a mensagem para a pessoa mencionada e toca o som de menção (B8). A menção é validada pelo esquema de `packages/protocol`. |
| B15 | Limite de pessoas na sala direta | F30.4 | O dono escolhe o máximo, de 2 a 6, ao criar ou dentro da sala. O Durable Object recusa a entrada acima do limite. Baixar o limite não expulsa quem já está dentro. |

### B12. Celular como câmera ou microfone

- No computador, a pessoa pede "usar o celular como câmera" e vê um QR Code.
- O QR leva a um link com um token de uso único e curta duração **[padrão: 5 minutos]**, ligado à sessão
  dela e à sala. Gerado e validado pelo servidor.
- O celular entra como **aparelho extra da mesma pessoa**, só com câmera ou só com microfone. Não aparece
  como outra pessoa na lista nem tem chat próprio.
- Limites:
  - o vídeo do celular conta nos vídeos da pessoa (1, ou 2 no Plus) e no teto de 4 da sala;
  - **[padrão]** o aparelho extra conta no limite de 6 conexões da sala direta, porque é mais uma ponta
    da malha.
- Qualidade: a do plano da pessoa (720p30, ou 1080p60 no Plus), não 4K.
- Sair da sala no computador desconecta o celular.
- **Aceite:** com o QR, o celular vira a câmera da pessoa no computador; o vídeo aparece para os outros
  como dela; numa sala com 6 conexões, o QR é recusado com mensagem clara.

## Etapas depois do Grupo B

| Etapa | Acréscimo |
|---|---|
| Social | Administradores com cargos e permissões configuráveis, criados junto dos grupos permanentes (DF7) |
| Social | Ligar para amigo, só depois do Android e da notificação web do PWA. Infra: Web Push, com as chaves nos segredos do Worker, e notificação do Android (DF14) |
| Fase 2 | Descrição curta e categoria de uma lista fixa na sala pública, junto do destaque na vitrine. A descrição passa pelo filtro de palavras e pelo classificador (DF10) |

## Métrica: qualidade grátis (DF12)

Nos 3 primeiros meses depois do lançamento, acompanhar:

- a conversão de conta gratuita em Plus;
- quantas reclamações citam a qualidade ou comparam com o concorrente.

Ao fim do período, levar os números ao dono do produto. Nada muda antes disso.

## Fora, com o motivo

| Feature do concorrente | Ref. | Motivo |
|---|---|---|
| 2K a 120 fps grátis | F20.1 | Acima de 1080p60 está fora do produto; o grátis segue 720p30 (DF12) |
| Sala por nome livre | F18.2 | Gerou as invasões no concorrente; nós usamos código aleatório |
| Bot do Discord | F22.1 | Exige conexão permanente com o Discord e outra exceção à regra de integrações (DF11) |
| Mapa de salas com localização | F26.1, F30.6 | Expõe a localização de quem cria a sala, inclusive de quem não tem conta (DF9) |
| Música sincronizada e arquivo local | F30.1, F30.3 | Direito autoral e licença de música; assistir junto fica com YouTube e Twitch (DF3) |
| Temas da comunidade | F13/09.3 | Já fora (`POS-MVP-OBJECOES.md`); o Plus mantém 6 temas prontos |
| Ferramentas na sala | F17/10.1 | Fora do problema central; nenhuma objeção pediu (DF13) |
| Efeitos de rosto, troca de fundo própria, reações por gesto | F29/10.2, F29/10.3 | Pesam no computador de quem transmite (risco 2 do `DECISOES.md`); fica só o desfoque nativo (DF4) |

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
| Período de medição da qualidade grátis | 3 meses depois do lançamento |
