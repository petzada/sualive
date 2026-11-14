# Estudo de caso: objeções do público ao concorrente (Go Live)

> As decisões finais estão no `POS-MVP.md` (versão 3), que junta e substitui os documentos pós-MVP citados aqui.

Base: `objecoes.md`, 78 itens coletados de 18/agosto a 29/outubro de 2026.
Comparado com: `DECISOES.md` (versão de 2026-11-14), somente leitura. Nada do que está sendo implementado foi alterado.

**Como contei:** uma linha por item dos prints. Um item pode entrar em mais de um tema (por exemplo, "senha na sala" e "áudio por app" no mesmo comentário). Por isso a soma dos temas passa de 78. Os números são de comentários, não de pessoas: quem comenta mais de uma vez conta mais de uma vez.

Referência dos itens: `dia.número`, como em `21.4` = 21/agosto, item 4. Setembro e outubro usam `02/09.1`, `29/10.2`.

---

## Lista 1: temas ordenados por quantidade de comentários

| # | Tema | Itens | % de 78 |
|---|---|---|---|
| 1 | Áudio da transmissão captura o sistema inteiro: eco, retorno, voz do Discord duplicada, vazamento de outros apps | 26 | 33% |
| 2 | Privacidade e acesso da sala: sala privada invadida, falta de senha, IP exposto, "não parece seguro", moderação | 10 | 13% |
| 3 | Organização e controles da sala: tela cheia, foco numa tela, grade de vídeos, esconder barras, HUD de volume, volume por espectador, prévia espelhada | 8 | 10% |
| 4 | Qualidade e desempenho: FPS cai, codificação na CPU, áudio abafado, microfone abaixando sozinho, Windows travando | 6 | 8% |
| 5 | Integração com o Discord: atividade dentro do Discord, aplicativo para migrar | 5 | 6% |
| 6 | Chat em tela cheia, junto do vídeo, e aviso sonoro de mensagem | 4 | 5% |
| 6 | Celular: transmitir tela, app, segundo plano, tela em pé com bordas pretas | 4 | 5% |
| 6 | Áudio ausente ou incompatível: Firefox, Edge, Opera GX, jogos sem som | 4 | 5% |
| 6 | Assistir junto: YouTube, Twitch, Crunchyroll, "igual ao Rave", clima de cinema | 4 | 5% |
| 6 | Conta e social: lista de amigos, passar o dono da sala, foto de perfil paga, sala que não fecha | 4 | 5% |
| 11 | Pedidos isolados (1 cada): transcrição/gravação, plugins, console, overlay, escolher microfone/câmera, menos verificação de bot | 6 | 8% |

**Itens de cada tema**

1. Áudio: 18.1, 18.3, 19.1, 19.2, 19.6, 19.9, 20.1, 20.4, 21.3, 21.4, 21.5, 21.6, 22.3, 22.7, 24.3, 24.4, 25.2, 25.3, 25.4, 25.5, 25.8, 27.3, 30.5, 02/09.1, 13/09.4, 29/10.1.
2. Privacidade: 18.1, 18.2, 19.4, 20.3, 21.1, 21.2, 22.1, 24.1, 25.1, 03/09.3.
3. Organização da sala: 18.4, 18.6, 18.7, 21.7, 22.4, 25.7, 27.1, 13/09.1.
4. Qualidade: 18.5, 19.5, 22.2, 24.2, 28.1, 07/09.2.
5. Discord: 19.3, 21.8, 22.5, 28.2, 28.3.
6. Chat: 27.2, 30.2, 30.3, 30.4. Celular: 19.7, 13/09.2, 13/09.3, 29/10.2. Áudio ausente: 20.4, 24.5, 25.6, 30.5. Assistir junto: 25.9, 26.1, 27.4, 30.1. Conta e social: 19.8, 30.6, 07/09.1, 29/10.3.
11. Isolados: 03/09.1, 03/09.2, 27.5, 13/09.5, 20.2, 22.6.

**Leitura:** o tema 1 sozinho vale um terço de tudo e aparece de 18/agosto até 29/outubro, ou seja, o concorrente não resolveu em mais de dois meses. Dentro dele, 15 comentários pedem explicitamente áudio só da janela ou do app, e 18 relatam eco ou retorno (8 dizem as duas coisas). O tema 2 se concentra entre 18 e 25/agosto.

---

## Lista 2: pedidos de implementação, ordenados por quantidade

| # | Pedido | Itens |
|---|---|---|
| 1 | Transmitir só o áudio da janela ou do app | 15 |
| 2 | Controles de organização da sala: tela cheia, focar numa tela, grade melhor, esconder barras laterais, ocultar HUD de volume, volume por espectador, tapar a própria prévia | 8 |
| 3 | Senha ou convite para sala privada (inclui UUID no lugar do nome) | 6 |
| 4 | Chat em tela cheia, junto do vídeo | 3 |
| 4 | Atividade dentro do Discord | 3 |
| 4 | Transmitir a tela pelo celular, app de celular | 3 |
| 4 | Assistir junto com fonte externa: playlist do YouTube, Crunchyroll, Rave | 3 |
| 8 | Aplicativo ou plataforma independente para sair do Discord | 2 |
| 9 | Com 1 pedido cada: som de aviso no chat, música ambiente, escolher microfone e câmera, passar o dono da sala, lista de amigos, transcrição ou gravação, plugins e temas da comunidade, console, overlay, seletor de qualidade/fps/bitrate, codificação por GPU, sala pública fixa tipo canal, menos verificação de bot, moderação, tela em pé no celular | 14 |

## Lista 3: reclamações (o que já está quebrando ou incomodando)

| # | Reclamação | Itens |
|---|---|---|
| 1 | Eco, retorno, ouvir a própria voz ou a voz do Discord na transmissão | 18 |
| 2 | Áudio ausente ou ruim: sem som no Firefox, Edge, Opera GX, jogos sem áudio, áudio abafado | 5 |
| 3 | Sala privada acessada por quem não foi convidado, só pela URL ou por adivinhar o nome | 4 |
| 4 | Queda de FPS e uso alto de CPU na transmissão; Windows travando depois de muito tempo compartilhando | 2 |
| 5 | Com 1 relato cada: verificação de bot demais (5 em 10 minutos), IP puxado durante a live, volume do microfone abaixando sozinho, tela em pé com bordas pretas no celular | 4 |

---

## Cruzamento com o `DECISOES.md`

Legenda: **Atende** = já está no escopo; **Parcial** = existe, mas não cobre o que pedem; **Não atende** = não está no documento; **Fora** = o documento exclui de propósito.

| Pedido ou reclamação | Itens | Situação | O que o documento diz hoje | Lacuna |
|---|---|---|---|---|
| Áudio só da janela/app e fim do eco | 26 | **Não atende** (web) | Entrega 1: "compartilhar tela inclui o áudio da aba ou do sistema quando o navegador oferece". Eco: só o cancelamento nativo do microfone. Desktop (Electron, "áudio do sistema sem eco") está em pós-MVP, sem prioridade. | A reclamação nº 1 do concorrente nasce igual no nosso MVP: quem transmite com áudio do sistema devolve a voz de todo mundo. Falta decidir o que fazer na web e quando sobe o desktop. |
| Áudio compartilhado abafado | 19.5, 28.1 | **Não atende** | Não há regra para o áudio da tela. O texto só trata do microfone. | Definir que a faixa de áudio compartilhada não passa por supressão de ruído, cancelamento de eco nem ganho automático. |
| Áudio ausente em Firefox, Edge, Opera GX | 4 | **Parcial** | "Quando o navegador oferece". | Detectar quando o navegador não entrega áudio e avisar na hora, com o caminho que funciona. Hoje o usuário descobre sozinho. |
| Senha ou convite na sala privada | 6 | **Parcial** | Código de 10 caracteres aleatórios, "difícil de adivinhar". Dono remove e bane. Não há senha. | O código longo já resolve "adivinharam o nome". Falta senha opcional para quando o link vaza ou é colado em lugar público. |
| IP exposto, "não parece seguro" | 21.1, 21.2 | **Atende** | Aviso ao criar e entrar na sala direta; modo protegido (servidor) esconde o IP, mas é Plus e pago. | Nada a mudar. Deixar o aviso e o modo protegido bem visíveis. |
| Moderação, "alguém criminoso usa" | 03/09.3 | **Parcial** | Sala direta: só o dono remove e bane. Denúncia, painel e filtros existem só na sala pública (entrega 4). | Definir se denúncia e termos de uso valem também na sala direta. |
| Organização da sala (tela cheia, foco, grade, esconder barras, HUD, prévia) | 8 | **Parcial** | Um vídeo em destaque e miniaturas; clicar na miniatura troca o destaque. Teto de 4 vídeos. | Tela cheia, esconder painéis, ocultar o indicador de volume, volume por espectador e opção de não ver a própria transmissão não estão citados. `DESIGN.md` não traz a tela da sala. |
| Chat em tela cheia | 3 | **Não atende** | Chat existe; nada sobre tela cheia. | Decidir o comportamento do chat quando o vídeo está em tela cheia. |
| Aviso sonoro de mensagem | 30.4 | **Não atende** | Silêncio no documento. | Pequeno. |
| Celular: transmitir tela | 3 | **Fora do MVP, com plano** | "Em navegador de celular o botão de compartilhar tela não aparece." Android (Capacitor) em pós-MVP. | Já coberto como etapa. Falta só decidir a ordem. |
| Celular: tela em pé, bordas pretas | 29/10.2 | **Não atende** | Celular: assistir, falar, webcam, chat. Sem regra de layout. | Regra de layout para vídeo em pé. |
| Qualidade, FPS, CPU, GPU | 24.2, 18.5 | **Parcial** | Qualidade por plano (720p30 / 1080p60). Risco 2 já registra que depende do computador de quem transmite; desktop alivia. Sala direta já é P2P, que é o que pediram. | O usuário gratuito não pode baixar a qualidade para poupar CPU. Medir o impacto de FPS no jogo antes do lançamento. |
| Atividade dentro do Discord | 3 | **Fora** | "Fora do produto: bots e integrações de terceiros." Login com Discord existe. | A atividade seria uma integração de terceiros. Precisa de decisão explícita, não de omissão. |
| App para migrar do Discord, plataforma independente | 2 | **Parcial** | Fase "Social" (amigos, grupos, mensagens diretas) e desktop em pós-MVP. | Já previsto. Os comentários validam a ordem. |
| Assistir junto (YouTube, Twitch, Crunchyroll) | 4 | **Não atende** | Nada. Sem recurso "assistir junto". Quem quer assistir um filme compartilha a tela. | Decidir se vira recurso ou se compartilhar a tela basta. |
| Lista de amigos | 30.6 | **Atende (pós-MVP)** | "Social: amigos e convite direto." | Nada. |
| Passar o dono da sala | 07/09.1 | **Não atende** | Dono é quem tem o token; se sai, a sala fica sem dono. | Ação de transferir o dono. Pequeno. |
| Sala que não fecha / sala fixa tipo canal | 19.4, 19.8 | **Atende** | Sala expira 5 minutos depois da última saída; Plus tem link fixo. | Responder a pergunta de 19.8 na interface: "a sala fecha 5 minutos depois que todos saem". |
| Foto de perfil paga no concorrente | 29/10.3 | **Atende** | Avatar vem do Google/Discord; envio de foto própria na entrega 4 para quem tem conta. | Vantagem nossa. Pode virar argumento. |
| Escolher microfone e câmera | 20.2 | **Parcial** | Prévia de microfone e câmera ao entrar; sem seletor citado. | Seletor de dispositivo. Pequeno. |
| Verificação de bot demais | 22.6 | **Parcial** | Turnstile na criação e na entrada, sem política de repetição. | Definir que o Turnstile roda uma vez por navegador por período, não a cada entrada. |
| Transcrição ou gravação | 03/09.1 | **Fora** | Nunca gravar, transcrever nem gerar clipe. | Conflito de princípio. Manter fora. |
| Plugins e temas da comunidade | 03/09.2 | **Fora** | Fora do produto: bots e integrações de terceiros. Tema de sala Plus com 6 temas. | Manter fora. |
| Console | 27.5 | **Parcial** | Não citado. A placa de captura já aparece como câmera. | O áudio da placa sai processado e no lugar do microfone. Decidido: botão "Transmitir console" (B11 no `POS-MVP.md`). |
| Overlay sobre o jogo | 13/09.5 | **Fora do MVP, com plano** | Desktop (Electron) cita "sobreposição". | Já previsto. |
| Música ambiente, clima de cinema | 25.9 | **Não atende** | Nada. | Baixa prioridade. |
| Volume do microfone abaixando sozinho | 07/09.2 | **Não atende** | Nada. | Provável causa: o ganho automático do microfone, ligado no código em andamento. Decidido: opção de desligar (A8). |
| Windows travando após horas | 22.2 | **Não atende** | Nada. | Incluir teste de longa duração no CI manual da entrega 1. |

---

## Resumo do cruzamento

- **O risco nº 1 está aberto:** o nosso MVP web reproduz a maior queixa do público (áudio e eco). Revisão de 2026-11-14: o Chrome 141 trouxe `windowAudio` e `restrictOwnAudio`, que podem resolver boa parte na web; o `POS-MVP.md` pede as duas opções sempre que o navegador declarar suporte e mede o resultado pelo feedback.
- **Já somos melhores em:** IP oculto sem pagar o plano caro (modo protegido), foto de perfil, link fixo, pagamento por Pix, sala P2P sem servidor.
- **Lacunas pequenas e baratas, de maior retorno:** senha de sala, seletor de dispositivo, aviso quando o navegador não captura áudio, tela cheia com chat, transferir o dono, política do Turnstile.
- **Decisões de produto pendentes:** atividade do Discord, assistir junto, moderação na sala direta, ordem do desktop.
