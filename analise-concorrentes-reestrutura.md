# Análise de concorrentes e reestrutura

Versão 1, de 2026-11-14. Análise adversarial do sualive contra o Go Live (golive.nemtudo.me) e a
Salinha (salinha.live), seguida das decisões do dono do produto, tomadas por enquete.

**Este documento não altera o `DECISOES.md` nem o `POS-MVP.md`.** As entregas em andamento continuam como
estão. O que for decidido aqui vira mudança naqueles documentos só quando o dono pedir.

## Fontes e grau de confiança

| Fonte | O que é | Confiança |
|---|---|---|
| Páginas públicas dos dois concorrentes, lidas em 2026-11-14 (só o texto visível; nenhum código consultado) | Recursos, preços, limites | Fato, na data |
| Estimativas do dono do produto (stack, custo, banda, subsídio) | Inferência | **Hipótese** |
| `DECISOES.md`, `POS-MVP.md`, `HISTORICO-DECISOES.md`, `analise-objecoes.md` | Estado e plano do sualive | Fato |
| Preço da Cloudflare: US$ 0,05 por GB de saída, 1.000 GB grátis por mês somando SFU e TURN (conferido em 2026-09-22, no `HISTORICO-DECISOES.md`) | Custo nosso | Fato na data; reconferir |

Tudo marcado **(hipótese)** não foi confirmado e não deve sustentar decisão sozinho.

---

## 1. Os três produtos lado a lado

### O que cada um entrega de graça

| | sualive (plano atual) | Go Live | Salinha |
|---|---|---|---|
| Entrar | Link, sem conta | Nome da sala, sem conta | Login Google |
| Qualidade grátis | 720p30, 1,5 Mbps | Não divulgada; a página do Pro vende 4K, 240 fps e 32 Mbps | 720p a 1440p ou nativa (4K), 30 a 144 fps |
| Pessoas por sala | 6 | "Bastante gente" | 12 na voz |
| Telas por pessoa | 1 | 2 | Não divulgado |
| Som da tela | Aba ou sistema, no navegador | Navegador; app de Windows tira o eco | App de Windows: qualquer janela; Android: som dos apps |
| Salas públicas | Só na entrega 4, criadas por Plus | Sim, com lista e mapa por cidade | Não: só convite, sem busca |
| Social | Nada (etapa Social pós-MVP) | Amigos, grupos, conversas | Grupos fechados, chat, ligações, arquivos de 100 MB, áudios |
| Apps | Só web | Web, Windows, bot do Discord | Web, Windows (Microsoft Store), Android (Google Play), Linux |
| Anúncios | Não | Sim (o Pro remove) | Não |
| Extras | Chat, reações, mão | Chat, câmera, voz | YouTube e música juntos, jogar no PC do amigo, PC pelo celular (30 dias; depois Pass ou Salinha+) |

### O que cada um cobra

| | sualive | Go Live | Salinha |
|---|---|---|---|
| Planos | Plus: R$ 19,90/mês ou R$ 159,90/ano | Pro R$ 4,99 (de R$ 10,00), Pro Max R$ 14,99, Ultra R$ 24,99 por mês; anual com 58% de desconto | Salinha+ a R$ 3 por ano; Salinha Pass ganho por convite |
| Vende qualidade? | Sim: 1080p60 e 2 vídeos | Sim: 4K, 240 fps, 32 Mbps | Não |
| Vende infraestrutura? | Sim: sala no servidor, em ouro por minuto | Sim: "servidores dedicados para conectar em qualquer rede" e "forçar servidor de distribuição de vídeo" | Não |
| Vende vaidade? | Selo, tema de sala, cosméticos em prata e ouro | Selo de verificado, avatares, banner, cores, música no perfil, emojis, temas, auras | Não divulgado |
| Vende ferramenta? | Não | Arquivos de 65 a 200 MB, lista de tarefas, lousa, editor de código, tradução ao vivo, clipe sem marca | YouTube e música juntos, jogar no PC, emprestar o PC |
| Moeda interna | Prata (grátis) e ouro (R$ 1 = 100) | Pontos por pagamento e por dia de assinatura | Não divulgado |
| Meio de pagamento | Pix (Woovi) | Provedor externo, recorrente | Não divulgado |

### Como cada um se sustenta

| | sualive | Go Live | Salinha |
|---|---|---|---|
| Mídia padrão | Malha P2P até 6 | P2P **(hipótese forte**: o que conecta "em qualquer rede" e o servidor de distribuição são pagos, logo o grátis é direto entre navegadores) | P2P declarado: "o servidor só apresenta vocês" |
| Quem paga a banda | O usuário, exceto o TURN (nosso, US$ 0,05/GB) | O usuário; servidor só para pagantes | O usuário; TURN deles **(hipótese)** |
| Custo fixo | Workers Paid (US$ 5/mês) | Square Cloud **(hipótese)** | VPS com coturn **(hipótese)** |
| Custo variável | TURN de quem está no grátis; SFU pago pelo dono em ouro | Anúncio e assinatura cobrem **(hipótese)** | Do bolso do dono **(hipótese)** |
| Uso observado | Não lançado | 3.553 pessoas em salas às ~15h de um sábado; pico citado de 7.000 | Não divulgado |

---

## 2. Achados adversariais

Cada achado é uma crítica ao plano atual. A resposta do dono está na seção 3.

### A1. O nosso grátis é o pior dos três no eixo que o público compara

720p30 contra 1440p/144 fps grátis na Salinha. A Salinha abre o site com a piada "tem app por aí que
cobra pra sair do 720p". Ela mira o Discord, mas descreve o nosso plano. Em malha, 1080p60 não nos custa
nada: quem paga é o upload de quem transmite. Cobrar por custo zero só se sustenta enquanto ninguém
oferecer o mesmo de graça, e já oferecem. O `POS-MVP.md` (D29) manda medir por 3 meses antes de mexer;
com dois concorrentes estabelecidos, esses 3 meses são de primeira impressão ruim.

### A2. O Plus custa 4 vezes o Pro do Go Live e 80 vezes o Salinha+

R$ 19,90 contra R$ 4,99 e R$ 3 por ano. O Plus embute 1.000 de ouro (R$ 10 de valor de face), então o
"plano em si" custa perto de R$ 9,90, mas a vitrine mostra R$ 19,90. E o benefício principal (qualidade)
é o que os outros dão de graça ou por R$ 4,99.

### A3. Os dois concorrentes cobram por valor; nós cobramos por custo em um lugar e por nada em outro

- Go Live: cobra infraestrutura (relay, servidor de vídeo, arquivos), ferramenta e vaidade, em três degraus.
- Salinha: cobra só o "uau" e usa o plano como motor de convite.
- sualive: a sala no servidor cobra custo real com margem (certo). A qualidade P2P cobra o que não custa (frágil).

### A4. Sala de 6 contra 12 e "bastante gente"

A malha limita o **vídeo**, não a voz. A Salinha põe 12 na voz porque o vídeo "só chega se você clicar em
assistir": quem transmite só envia para quem assiste. O nosso teto de 6 nasce de enviar tudo para todos.

### A5. Não temos motivo para a pessoa voltar

Os dois têm amigos, grupos e conversas. Nós somos um link que expira em 5 minutos. A etapa Social está no
fim da fila pós-MVP. Sem rede, cada sessão recomeça a aquisição do zero; com rede, vêm custo de
armazenamento, moderação e obrigação legal. É a escolha mais cara deste documento, para os dois lados.

### A6. O TURN do grátis é o único custo sem receita e não tem teto

Cerca de 10 a 20% das conexões precisam de relay **(hipótese de mercado)**. A 1,5 Mbps, um par relayado
gasta ~0,68 GB por hora (R$ 0,19). A cota de 1.000 GB cobre ~1.480 horas-par por mês. No tamanho do Go
Live (milhares simultâneos), o relay grátis passaria de milhares de reais por mês. O Go Live resolveu
cobrando: relay dedicado só no plano pago.

### A7. A carteira (prata, ouro, loja, presentes) é a parte mais complexa do MVP e a de receita mais incerta

Nenhum dos dois vende moeda. O Go Live dá pontos como brinde de assinatura. O nosso ouro tem um uso forte
(pagar sala no servidor) e usos fracos (cosmético, presente). A entrega 3 já está em andamento e não se
mexe; a pergunta é o papel do ouro daqui para frente.

### A8. "Maior de 18" por caixa de seleção não protege, e a sala sem conta não tem nem isso

O público do nicho tem muito adolescente. A conta exige 18 anos por autodeclaração; a sala sem conta não
pergunta nada. Com o ECA Digital em vigor desde março de 2026, autodeclaração tende a não bastar onde há
risco para menores **(hipótese jurídica; exige parecer)**. A Salinha, com "ninguém no meio", não consegue
entregar conteúdo a uma autoridade, só o que o denunciante enviar. O Go Live tem salas públicas com mapa
por cidade e anúncios de rede aberta para um público jovem. Há espaço para ser "a alternativa em
conformidade", mas hoje não somos: o registro de acesso de 6 meses prometido nos Termos de Uso ainda não
existe e a sala direta não tem denúncia (D19).

### A9. Se o Discord religar a tela, o que sobra de nós?

Sobra o que o Discord não faz: entrar por link sem conta, sala grande com plateia, sala pública. Não
temos assistir junto, jogar no PC do amigo, nem app com áudio limpo. A Salinha sobrevive pelos extras; o
Go Live, pela base e pelos grupos.

### A10. O que já temos de melhor e não pode se perder

- Menor custo fixo dos três e nenhuma máquina para administrar.
- Sem anúncio e sem rastreador de rede de anúncios.
- Entrada por link com código aleatório, sem conta (a Salinha exige login; o Go Live usa nome de sala).
- Pix, inclusive anual sem recorrência.
- Sala no servidor que se paga sozinha, minuto a minuto, e esconde o IP.
- Servidor no meio quando precisa: dá para moderar, denunciar e responder a autoridade.

---

## 3. Decisões do dono do produto

Tomadas em 2026-11-14, por enquete. "=" quer dizer que a escolha foi a recomendada. Onde a escolha
divergiu, a recomendação da análise fica registrada, e o risco aceito está na seção 7.

### Posicionamento

| # | Pergunta | Decisão | Recomendada |
|---|---|---|---|
| P1 | Aposta | **Substituir o Discord**, depois do MVP validado | Link primeiro, grupos depois |
| P2 | Público principal | **Grupos de amigos**. A sala grande continua existindo como produto pago | Amigos no grátis, plateia no pago |
| P3 | Promessa da página inicial | **Um link, sem conta, sem anúncio** | = |
| P4 | Discord | **Bot que cria a sala e posta o link** no canal | = |
| P5 | O que valida o MVP e libera os grupos | **Retorno semanal**: contas que voltam a abrir sala com as mesmas pessoas em semanas seguidas. O número fica em aberto (seção 8) | = |
| P6 | Primeiro degrau de grupo | **Grupo com chat guardado** | Grupo leve, sem histórico |
| P7 | Onde ficam as mensagens do grupo | **No servidor, para sempre** | Só ao vivo e no aparelho |

### Sala paga e sala grátis

| # | Pergunta | Decisão | Recomendada |
|---|---|---|---|
| S1 | Papel do SFU | **Só sala grande, de 7 a 50, por link, com palco e plateia. Construído depois dos grupos.** Sai a "protegida pelo SFU" | SFU enxuto, sem adiar |
| S2 | Como o assinante paga a sala grande | **Horas inclusas mais recarga.** A tela mostra horas; por baixo, débito por minuto em ouro | = |
| S3 | Pessoas na sala direta | **12, com voz para todos e vídeo só para quem clica em assistir** | = |
| S4 | Esconder o IP | **Sala protegida por relay forçado (TURN), benefício do Plus** | = |
| S5 | Sala pública (vitrine) | **Adiar** e decidir quando houver base | = |
| G1 | Qualidade grátis | **1080p60 grátis; acima disso (1440p, 4K, 120 fps) no Plus** | = |
| G2 | Vídeos por pessoa | **2 no grátis, 4 no Plus** | 2 para todos |
| G3 | Limite de vídeos | **Sem teto por sala em P2P; cada pessoa assiste até 4 ao mesmo tempo.** Em relay forçado e no SFU o teto de sala continua | = |

### Monetização

| # | Pergunta | Decisão | Recomendada |
|---|---|---|---|
| M1 | Preço do Plus | **R$ 9,90 por mês com 500 de ouro.** Anual proporcional (R$ 79,90 **[padrão]**). Itens pagos em ouro baixam junto, sem perder margem | = |
| M2 | Regra de preço do que gasta banda | **Custo do pior caso, medido em homologação, × 2**, com o ouro valendo R$ 0,82 por 100 | × 1,5 |
| M3 | Relay de quem não paga | **Vídeo em relay só no Plus.** No grátis, o par que precisa de relay tem voz e chat, com aviso | Orçamento mensal com degraus |
| M4 | Formato da sala protegida | **Até 6 pessoas, teto de 2 vídeos, 720p, preço fixo por hora** | = |
| M5 | Relay comum do Plus (rede restrita) | **Consome a mesma franquia de horas** | = |
| M6 | Assistir junto (YouTube e Twitch) | **Grátis para todos** | = |
| M7 | Indicação | **Convite que vira uso real rende dias de Plus sem franquia** (sem ouro e sem relay). Sem teste de 30 dias | = |
| M8 | Loja e Fase 2 | **Fase 2 (presença, missões, conquistas) logo depois do lançamento; loja forte junto dos grupos** | = |
| M9 | Prata e ouro | **Itens raros e de temporada só em ouro**; comuns em prata ou ouro | = |
| M10 | Ouro coletivo | **Cofre do grupo**: membros depositam ouro, que paga sala grande e extras do grupo | = |
| M11 | Ritmo de conteúdo da loja | **Coleção mensal** | A cada 3 meses |

### Roteiro

| # | Pergunta | Decisão | Recomendada |
|---|---|---|---|
| R1 | Ordem depois do lançamento | **Desktop → assistir junto, bot do Discord e indicação → Fase 2 → grupos (com o gatilho P5) → Android → SFU** | Mesma ordem, sem o Desktop na frente |
| R2 | Desktop | **Com data marcada**, o primeiro item depois do lançamento | Web primeiro e medir (D17) |
| R3 | Jogar no PC do amigo | **Fora; reavaliar quando o Desktop existir** | = |
| R4 | Celular | **Sem PWA.** Android (Capacitor) na ordem do R1 | PWA com aviso; Android depois dos grupos |

### Regulação e grupos

| # | Pergunta | Decisão | Recomendada |
|---|---|---|---|
| C1 | Idade | **18 anos, só por autodeclaração** | Verificação confiável antes de grupos, mensagens diretas e sala pública |
| C2 | Condições para abrir ao público | **Registro de acesso por 6 meses** e **Central de Segurança com canal oficial**. Ficam fora: denúncia na sala direta (o D19 continua) e parecer jurídico | Os quatro |
| C3 | Quem não tem conta | **Continua criando e entrando em sala** | = |
| C4 | Segurança na comunicação | **Não usar como argumento** | Segundo argumento, só com prova |
| C5 | O que nasce junto dos grupos | **Denúncia e painel interno; apagar mensagens e exclusão de conta; filtro e classificador de texto; Termos de Uso e Políticas de Privacidade revisados antes** | = |
| C6 | Imagens e arquivos em grupo | **Imagens, guardadas no R2, cada uma passando pelo classificador.** Sem outros arquivos | Só texto e links no primeiro degrau |
| C7 | Mensagens diretas | **Junto dos grupos, só entre amigos** | Depois dos grupos |
| C8 | Quando isso entra no `DECISOES.md` e no `POS-MVP.md` | **Depois da entrega 3**, numa revisão única aprovada pelo dono antes de qualquer código | = |

---

## 4. Como fica a plataforma

### Níveis

| | Sem conta | Conta gratuita | Plus (R$ 9,90) |
|---|---|---|---|
| Criar e entrar em sala por link | sim | sim | sim |
| Pessoas na sala direta | 12 | 12 | 12 |
| Qualidade do que a pessoa transmite | 1080p60 | 1080p60 | até 4K e 120 fps **[padrão]** |
| Vídeos simultâneos da pessoa | 2 | 2 | 4 |
| Vídeos que cada pessoa assiste ao mesmo tempo | 4 | 4 | 4 |
| Assistir junto (YouTube e Twitch) | sim | sim | sim |
| Vídeo quando o par precisa de relay | não: voz e chat | não: voz e chat | sim, gastando a franquia |
| Sala protegida (IP oculto, relay forçado) | não | não | sim, gastando a franquia |
| Sala grande, 7 a 50 (SFU, depois dos grupos) | entra | entra | abre, gastando a franquia |
| Franquia mensal | — | — | 500 de ouro, mostrada em horas |
| Link fixo, tema de sala, selo | não | não | sim |
| Perfil, carteira, loja | não | sim | sim |
| Plus sem franquia por indicação | — | sim | — |

### Caminhos de mídia

| Caminho | Quando | Quem paga a banda |
|---|---|---|
| Malha P2P | Toda sala de até 12. Voz para todos; vídeo só de quem transmite para quem assiste | O usuário |
| Relay (TURN) de voz | Par que não conecta direto | Nós. Desprezível: ~R$ 0,005 por par por hora |
| Relay (TURN) de vídeo | Só quando quem transmite é Plus **[padrão]**: rede restrita ou sala protegida | A franquia do assinante, pela regra × 2 |
| SFU | Sala grande de 7 a 50, depois dos grupos | A franquia e a recarga do dono, ou o cofre do grupo |

Consequência para a infraestrutura: nenhum custo de banda relevante fica sem receita. Com isso, **não é
preciso servidor próprio de relay**; o sualive segue 100% na Cloudflare, sem máquina para administrar.

### Posição diante dos concorrentes, com as decisões

| Eixo | sualive novo | Go Live | Salinha |
|---|---|---|---|
| Entrar | Link, sem conta | Nome da sala, sem conta | Login |
| Qualidade grátis | 1080p60 | Não divulgada | Até 1440p/4K, 144 fps |
| Pessoas grátis | 12 | "Bastante gente" | 12 |
| Anúncios | Não | Sim | Não |
| Assistir junto | Grátis | Não divulgado | Pago (R$ 3/ano ou convite) |
| Rede restrita | Voz grátis; vídeo no Plus | Servidor dedicado no plano pago | Grátis **(hipótese)** |
| App de Windows | Primeiro item depois do lançamento | Tem | Tem |
| Grupos e conversas | Depois da validação | Tem | Tem |
| Jogar no PC do amigo | Não | Não | Tem |
| Plano de entrada | R$ 9,90 | R$ 4,99 | R$ 3 por ano |

Onde continuamos atrás depois das decisões: qualidade grátis acima de 1080p60 (Salinha), relay grátis
(Salinha, hipótese), preço de entrada (os dois), grupos e apps até o roteiro chegar lá, jogar no PC do amigo.

---

## 5. Contas de margem

Base: US$ 0,05 por GB de saída, dólar a R$ 5,50, ou R$ 0,275 por GB. 1 Mbps durante 1 hora = 0,45 GB =
R$ 0,124. Taxa da Woovi: R$ 0,85 por transação. Impostos não incluídos. As larguras de banda são
estimativas; **os preços finais saem da medição em homologação** (M2).

### Quanto o ouro rende

| Pacote | Líquido | Rende por 100 de ouro |
|---|---|---|
| R$ 9,90 → 990 | R$ 9,05 | R$ 0,91 |
| R$ 19,90 → 2.190 | R$ 19,05 | R$ 0,87 |
| R$ 49,90 → 5.990 | R$ 49,05 | R$ 0,82 |

Toda tabela de preço usa R$ 0,82, o pior caso.

### Plus a R$ 9,90 com 500 de ouro

Com a regra × 2, cada 100 de ouro gastos em banda custam no máximo R$ 0,41. Os 500 da franquia custam no
máximo R$ 2,05.

| Ciclo | Líquido por mês | Custo máximo da franquia | Sobra mínima por mês |
|---|---|---|---|
| Mensal | R$ 9,05 | R$ 2,05 | R$ 7,00 |
| Anual, R$ 79,90 | R$ 6,59 | R$ 2,05 | R$ 4,54 |

O assinante que gasta a franquia em cosmético, e não em banda, custa zero.

### Preços mínimos pela regra × 2 (estimativa, a medir)

| Uso | Custo por hora, pior caso | Preço mínimo | O que 500 de ouro compram |
|---|---|---|---|
| Sala protegida, 6 pessoas, 2 vídeos, 720p a 1,5 Mbps | R$ 2,01 | ~500 de ouro/h | ~1 h |
| A mesma, com relay a 1 Mbps | R$ 1,39 | ~340 de ouro/h | ~1 h 30 |
| Relay comum do Plus, por par que assiste, 1,5 Mbps | R$ 0,19 | ~45 de ouro/h por par | ~2 h 10 com 5 pares |
| Sala grande, 20 pessoas, 720p | R$ 5,83 | ~1.450 de ouro/h | ~20 min |
| Sala grande, 50 pessoas, 720p | R$ 14,57 | ~3.600 de ouro/h | ~8 min |
| Sala grande, 50 pessoas, 1080p60 | R$ 36,30 | ~8.900 de ouro/h | ~3 min |

Leituras:

- A tabela do `DECISOES.md` (500, 1.300 e 4.300 de ouro por hora) fica abaixo do custo do pior caso e
  precisa ser refeita antes de o SFU existir.
- Com R$ 9,90 e a regra × 2, a franquia cobre o relay do dia a dia, não a sala grande. A sala grande
  passa a ser paga por recarga ou pelo cofre do grupo. "Horas inclusas" só é honesto para relay e sala
  protegida.
- Incerteza que pode dobrar o custo do relay: com relay nas duas pontas, a Cloudflare pode cobrar a saída
  duas vezes. Só a medição responde.

### Custo que sobra sem receita

Relay de voz do grátis (~40 kbps por par). No tamanho do Go Live (~500 salas simultâneas, hipótese),
fica na ordem de dezenas de reais por mês, dentro da cota gratuita de 1.000 GB. O relay de vídeo do grátis,
que seria ~R$ 30 mil por mês nesse tamanho, deixou de existir com a decisão M3.

---

## 6. O que muda nos documentos, na revisão depois da entrega 3

Lista de trabalho da revisão única (C8). **Aplicada em 2026-11-14** na branch `docs/revisao-reestrutura`,
no `DECISOES.md` e no `POS-MVP-v5.md`, à espera da aprovação do dono.

### `DECISOES.md`

| Trecho | Hoje | Passa a ser |
|---|---|---|
| Contexto | "Público é quem faz stream" | Grupos de amigos; sala grande como produto pago |
| Níveis | 720p30 grátis, 1 vídeo, 6 pessoas | Tabela da seção 4 |
| Regras gerais | Teto de 4 vídeos por sala; relay a 720p para todos | Limite de 4 por espectador em P2P; vídeo em relay só de quem é Plus |
| Plus | R$ 19,90 / R$ 159,90, 1.000 de ouro | R$ 9,90 / R$ 79,90, 500 de ouro. Em `packages/config`; nenhum assinante real ainda |
| Presentear Plus | 1.990 de ouro | Baixa junto (ordem de 990 **[padrão]**) |
| Glossário e entrega 4 | Sala no servidor com três usos (protegida, grande, pública) | Sala protegida vira relay forçado na sala direta; SFU só para sala grande; vitrine adiada |
| Entrega 4 | SFU, palco, plateia, vitrine, moderação, imagens | Sai do MVP. O MVP fecha com: sala de 12 com vídeo sob demanda, novos tetos de qualidade e de vídeos, regra do relay e sala protegida. Moderação e imagens vão para a etapa de grupos; SFU para depois dela |
| Tabela de preço da sala no servidor | 150 a 4.300 de ouro/h | Refeita pela regra × 2, com medição |
| Fora do produto | Acima de 1080p60; bots e integrações | Acima de 1080p60 entra no Plus; exceção para o bot do Discord |
| Nunca fazer | Guardar o chat depois que a sala acaba | Exceção para o chat de grupo, quando os grupos existirem. O chat de sala continua sumindo |
| Depois do MVP | Fase 2, Social, Doação, Desktop, Android | Ordem do R1; Social vira "grupos com chat guardado, imagens e mensagens diretas"; cofre do grupo; raros só em ouro; coleção mensal; indicação paga em dias de Plus |
| Riscos | 3 (conta gratuita e sem conta quase iguais) | Continua, mais forte: agora o sem conta tem 12 pessoas e 1080p60 |

### `POS-MVP-v4.md` (o plano vigente), que vira `POS-MVP-v5.md`

A análise foi escrita lendo a versão 3. A versão 4 já tinha cortado o PWA e o lançador do Discord e já
punha o Desktop em primeiro no Grupo C: nesses pontos as decisões R1, R2 e R4 confirmam o plano vigente.

| Item da versão 4 | Muda para |
|---|---|
| D13 (qualidades de quem transmite) | Lista refeita com os novos tetos |
| D30 (assistir junto) | Mantido; grátis para todos |
| D31 (Grupo C: Desktop, assistir junto, Android) | Desktop; assistir junto, bot e indicação; Fase 2; grupos; Android; sala grande |
| D32 (manter 720p30 e medir) | Revogado: 1080p60 grátis na entrega 4 |
| D34 (descrição e categoria da sala pública na Fase 2) | Sem data, junto da vitrine |
| D26 a D28 (moderador, limites de frequência, registro de acesso) | Continuam na entrega 4, agora a nova |
| "Fora": bot do Discord | Entra, depois do Desktop |
| Social (amigos, grupos, mensagens diretas, em sequência) | Uma etapa só, liberada pelo retorno semanal |
| Grupo A | Ganha a Central de Segurança com canal oficial |
| Decisões novas | D35 a D47 da versão 5 |

### O que precisa de teste novo

- Malha com 12 pessoas na voz e vídeo sob demanda. A entrega 1 testou 6.
- `packages/protocol` e `packages/media`: pedir e cancelar "assistir", por vídeo.
- Custo real do relay (uma e duas pontas) e do SFU, em homologação, antes de fixar qualquer preço.

---

## 7. Riscos aceitos, onde a decisão divergiu da análise

| # | Decisão | Risco | O que a análise recomendava |
|---|---|---|---|
| X1 | P6, P7, C1, C6, C7 juntos: chat guardado para sempre, imagens, mensagens diretas, idade por autodeclaração, sem parecer jurídico | **O maior do plano.** O servidor passa a guardar conteúdo de um público com muitos adolescentes, e o dono responde sozinho. É exatamente o terreno que tirou a tela do Discord | Começar sem histórico e sem imagens; verificação de idade e parecer jurídico **antes dos grupos**, mesmo que não antes do lançamento |
| X2 | C2: sem denúncia na sala direta | A sala cresce para 12 pessoas em 1080p60 sem canal de denúncia. Só o registro de acesso responde a uma autoridade | Denúncia e painel no lançamento |
| X3 | M3: sem vídeo em relay no grátis | Cerca de 15% dos pares **(hipótese)** ficam só com voz. Vira a objeção "não vejo a tela", que os concorrentes não têm | Relay grátis em 480p com teto de gasto |
| X4 | M1 e M2: R$ 9,90 com regra × 2 | A franquia compra ~1 hora de sala protegida e minutos de sala grande. O Go Live inclui servidor no plano fixo | Regra × 1,5 |
| X5 | R1 e R2: Desktop antes de validar (já era o plano da versão 4) | Instalador, atualização e assinatura de código para manter antes de saber se o produto retém | Tentar a web (Chrome 141) e medir |
| X6 | R4: sem PWA (já cortado na versão 4) | No iPhone não há aviso de "abriram a sala" sem app instalado; o Android nativo só chega depois dos grupos | PWA com notificação web |
| X7 | M11: coleção mensal | Produção de arte todo mês por um dev solo | Trimestral |
| X8 | G1: qualidade acima de 1080p60 como produto | É aplicada pelo navegador de quem transmite (risco 6 do `DECISOES.md`) e a Salinha dá de graça | Aceito como está; não é o pilar do Plus |
| X9 | S3: malha com 12 | Não testada; depende do vídeo sob demanda funcionar bem | Testar antes de anunciar |
| X10 | P1: substituir o Discord | Chegar em terceiro num mercado de efeito de rede, e a demanda cai se o Discord religar a tela | Mitigado pelo gatilho P5 e por assistir junto grátis |

## 8. Em aberto

| # | Ponto | Sugestão |
|---|---|---|
| O1 | Número do gatilho de retorno semanal (P5) | Definir depois de 4 semanas de dados reais |
| O2 | Teto de qualidade do Plus | 4K e 120 fps **[padrão]** |
| O3 | Quem libera o vídeo em relay | Quem transmite ser Plus **[padrão]**; alternativa: o dono da sala |
| O4 | Como cobrar o relay comum do Plus | Por par que assiste, por minuto; ou a taxa fixa da sala protegida |
| O5 | Bitrate do relay | 1,5 Mbps (hoje) ou 1 Mbps, que rende 50% mais horas |
| O6 | Preço dos cosméticos e do presente de Plus depois da queda do Plus | Rever junto da tabela de ouro |
| O7 | Anual | R$ 79,90 **[padrão]** |
| O8 | Regra de "uso real" da indicação | Conta nova que entra em sala em 2 dias diferentes **[padrão]** |
| O9 | Método de registro de acesso e prazo de descarte | Definir no Grupo A, com os Termos de Uso |
| O10 | Preço da Cloudflare e cobrança do relay nas duas pontas | Reconferir a documentação e medir |

## 9. Próximos passos

1. A entrega 3 termina como está.
2. Revisão única do `DECISOES.md` e do `POS-MVP.md` com a seção 6, aprovada pelo dono.
3. Medição de custo do relay em homologação e fechamento dos pontos O2 a O7.
4. MVP fecha com a sala de 12, os novos tetos, a regra do relay e a sala protegida; depois, Grupo A e lançamento.
