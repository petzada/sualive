# Especificação de implementação

Versão de 2026-11-14, revisada depois da entrega 3 com as decisões de
`analise-concorrentes-reestrutura.md`. Este documento é a fonte de verdade do **que** construir. A
aparência (cores, tipografia, espaçamentos, componentes) é definida em `DESIGN.md`. As credenciais de
cada entrega estão listadas em `SEGREDOS.md`. O que vem depois do MVP está em `POS-MVP-v5.md`.

A revisão mudou os níveis, o preço do Plus, a entrega 4 e a ordem do pós-MVP. As entregas 0 a 3 estão
em produção e o texto delas descreve o que foi entregue; onde a entrega 4 muda um limite delas, vale a
entrega 4.

## Como usar

- O trabalho está dividido em **entregas**. Implemente uma entrega por vez, na ordem. Cada entrega vai
  para produção e é usada por gente real antes de a seguinte começar.
- Cada entrega tem quatro partes: **Objetivo**, **Escopo da tarefa**, **O que não fazer** e **Entrega
  esperada**. O que não está no escopo da entrega em andamento não deve ser construído, mesmo que
  apareça em outra entrega deste documento.
- Valores numéricos (limites, preços, prazos) ficam num único módulo de configuração, nunca espalhados
  pelo código. A lista está em "Parâmetros".
- Itens marcados com **[padrão]** foram definidos por quem escreveu este documento para fechar uma
  lacuna, não pelo dono do produto. Podem ser implementados como estão; se parecerem errados, pergunte
  antes de mudar.
- Em caso de dúvida ou de conflito entre duas regras deste documento, pare e pergunte. Não invente regra.

## Contexto do produto

Uma sala de chamada com compartilhamento de tela que abre por um link, sem cadastro e sem anúncio.
O público é o grupo de amigos que joga, assiste e conversa junto; a sala grande, para quem tem plateia,
é um produto pago que vem depois. A promessa da página inicial é "um link, sem conta, sem anúncio". Os
concorrentes são o Go Live (golive.nemtudo.me) e a Salinha (salinha.live); **nenhum código deles pode
ser usado ou consultado**.

Idioma da interface: português do Brasil. Pagamento: Pix, pela Woovi. Conta exige 18 anos.

## Glossário

| Termo | Significado |
|---|---|
| Sala direta | Sala de até 12 pessoas em que áudio e vídeo trafegam direto entre os navegadores (WebRTC em malha). É o tipo padrão. A voz vai para todos; cada vídeo só vai para quem escolhe assistir. |
| Retransmissão | Caminho usado quando dois navegadores não conseguem se ligar direto: a mídia passa pelo TURN da Cloudflare, que cobra por GB. |
| Sala protegida | Sala direta de até 6 pessoas em que **toda** a mídia passa pela retransmissão, para esconder o IP dos participantes. Só o dono Plus abre, pagando ouro por minuto. |
| Sala grande | Sala de 7 a 50 pessoas, por link, com palco e plateia, em que a mídia passa por um servidor de mídia (SFU). Fica para depois do MVP. |
| Dono | Quem criou a sala. Sem conta, é reconhecido por um token guardado no navegador. |
| Moderador | Participante promovido pelo dono para silenciar, remover e banir. |
| Prata | Moeda ganha de graça. Só compra cosméticos. |
| Ouro | Moeda comprada ou recebida com o Plus. 100 de ouro = R$ 1 de face; depois da taxa da Woovi rendem de R$ 0,82 a R$ 0,91. |
| Franquia | O ouro mensal do Plus, mostrado ao assinante em horas de sala protegida. |
| Plus | O único plano pago: R$ 9,90 por mês ou R$ 79,90 por ano. |

## Níveis

Valem a partir da entrega 4. Até ela, valem os limites das entregas 1 e 2.

| | Sem conta | Conta gratuita | Plus |
|---|---|---|---|
| Criar e entrar em sala direta por link | sim, com apelido | sim | sim |
| Pessoas na sala direta | 12 | 12 | 12 |
| Qualidade do que **a própria pessoa** transmite | até 1080p60 | até 1080p60 | até 2160p (4K) e 240 fps |
| Vídeos simultâneos da própria pessoa (tela ou webcam) | 2 | 2 | 4 |
| Vídeos que a pessoa assiste ao mesmo tempo | 4 | 4 | 4 |
| Vídeo próprio em conexão retransmitida | não: só voz e chat | não: só voz e chat | sim, pagando ouro |
| Abrir sala protegida | não | não | sim, pagando ouro |
| Perfil, @nome, carteira | não | sim | sim, com selo |
| Link fixo e tema de sala | não | não | sim |
| Ouro mensal (franquia) | — | — | 500 |

Regras que valem a partir da entrega 4:

- Sala direta: até 12 pessoas, todos falam e transmitem. Não há teto de vídeos por sala; cada pessoa
  assiste no máximo 4 vídeos ao mesmo tempo, e quem transmite só envia o vídeo a quem o assiste.
- Qualidade e número de vídeos seguem **o plano de cada pessoa**, não o do dono.
- Voz passa pela retransmissão para qualquer pessoa, sem custo para ela.
- Vídeo só passa pela retransmissão quando quem transmite é Plus e tem ouro; fica limitado
  a 720p e 1,5 Mbps, e cada minuto é debitado do ouro de quem transmite. Sem isso, aquele par fica com
  voz e chat e os dois lados veem o aviso.
- Sala protegida: até 6 pessoas e no máximo 2 vídeos ao mesmo tempo na sala, a 720p.
- Entra-se em qualquer sala com o microfone mudo.
- Sala de dono sem Plus acaba 5 minutos **[padrão]** depois que a última pessoa sai. O chat é apagado junto.
- **Regra de preço:** tudo que gasta banda nossa (retransmissão de vídeo, sala protegida e, depois, sala
  grande) custa em ouro o **pior caso medido em homologação vezes 2**, contando 100 de ouro como R$ 0,82.
  Nenhum preço desse tipo é fixado sem a medição.

## Regras globais de implementação

### Stack

| Camada | Escolha |
|---|---|
| Repositório | Monorepo com pnpm e turbo: `apps/web`, `apps/api`, `packages/protocol`, `packages/media`, `packages/config` |
| Front | React 19, Vite, TypeScript, aplicação de página única |
| Interface | HeroUI 3 sobre Tailwind 4, com os tokens de `DESIGN.md` (tema claro) |
| API | Hono em Cloudflare Workers (plano Paid); o mesmo Worker serve os arquivos do front |
| Tempo real | Um Durable Object por sala, com WebSocket e hibernação |
| Mídia, sala direta e sala protegida | WebRTC em malha, com STUN e TURN da Cloudflare |
| Mídia, sala grande | Cloudflare Realtime SFU (depois do MVP) |
| Banco | Cloudflare D1, com Drizzle |
| Arquivos | Cloudflare R2 (depois do MVP, com os grupos) |
| Login | OAuth do Google e do Discord com Arctic; sessão própria em cookie `HttpOnly`, guardada no D1 **[padrão]** |
| Pagamento | Woovi: Pix Automático e Pix único |
| Anti-robô | Cloudflare Turnstile e limite de requisições por IP |
| Classificador | Workers AI (depois do MVP, com os grupos) |
| Erros e métricas | Registros do Workers, Sentry (front e Worker), Cloudflare Web Analytics |
| Testes | Vitest; Playwright só para um teste de fumaça com dispositivos de mídia falsos |
| Ambientes | Produção e homologação; homologação usa o ambiente de teste da Woovi |
| CI e deploy | GitHub Actions; deploy só por merge na main |

### Convenções

- Use a última versão estável de cada dependência no momento da criação e trave no lockfile. Fixe a
  `compatibility_date` do Worker. Antes de usar uma API de biblioteca, confira a documentação da versão
  instalada; não confie na memória.
- Toda tela segue `DESIGN.md`. Os tokens dele viram o tema do Tailwind e do HeroUI na entrega 0; nenhum
  componente usa cor, fonte ou raio fora dos tokens. `DESIGN.md` é uma referência de estilo: use a fonte
  substituta indicada nele (Inter), dê nomes neutros aos tokens e não use nome, logotipo nem fontes
  proprietárias da marca que o inspirou.
- Código e identificadores em inglês. Todo texto visível ao usuário em português, num arquivo de textos
  único, nunca escrito direto no componente.
- `packages/protocol` define, com esquemas validados, todas as mensagens trocadas pelo WebSocket da sala.
  Front e API importam dali. Nenhuma mensagem é aceita sem validação.
- `packages/media` é a única parte do front que conhece WebRTC. Ele expõe uma interface única para os
  caminhos de mídia (direto, retransmitido e, depois, servidor); a interface do produto não sabe qual
  está em uso.
- **O servidor decide, o cliente obedece.** Limites de pessoas, de vídeos, quem assiste o quê, papéis,
  plano e saldo são verificados no Durable Object ou no Worker. A exceção conhecida é a qualidade na
  sala direta, que só o navegador de quem transmite pode aplicar.
- Scripts com os mesmos nomes em todos os pacotes: `typecheck`, `lint`, `test`, `test:related`,
  `test:ci`, `e2e`, `build`.
- Migrations do D1 só adicionam (coluna com default ou nula, tabela, índice). Remover, renomear ou mudar
  tipo vai em alteração separada, depois que nenhum código no ar usa a estrutura antiga.
- Commits no padrão Conventional Commits, em português, em branch própria. Nunca na main.

### O que nunca fazer, em nenhuma entrega

- Copiar ou consultar código do Go Live ou da Salinha.
- Rodar banco local, Docker ou qualquer servidor de banco. Desenvolvimento usa o simulador do Wrangler.
- Gastar banda nossa com vídeo sem o débito correspondente em ouro.
- Fazer deploy a partir da máquina de desenvolvimento.
- Colocar segredo no front, em arquivo versionado ou em variável `VITE_*`.
- Confiar em valor enviado pelo navegador para plano, saldo, papel, preço ou identidade.
- Creditar plano ou ouro por qualquer caminho que não seja a confirmação recebida da Woovi.
- Deixar saldo de moeda negativo ou alterar saldo sem registrar a linha correspondente no livro-razão.
- Guardar gravação de áudio ou vídeo, ou o conteúdo do chat da sala depois que ela acaba. O chat de
  grupo, que será guardado, só existe na etapa de grupos, depois do MVP.
- Adicionar anúncios, rastreadores de terceiros além dos listados, ou recurso que não esteja no escopo.

---

## Entrega 0 — Fundação

### Objetivo

Ter o repositório, a esteira e os dois ambientes funcionando com uma página vazia no ar, para que as
entregas seguintes só acrescentem produto.

### Escopo da tarefa

- Criar o monorepo com a estrutura da tabela de stack e os scripts padronizados.
- `apps/api`: Worker com Hono, rota `GET /api/health` que devolve estado e o commit publicado, binding
  do D1 e de uma classe de Durable Object vazia.
- `apps/web`: aplicação React com HeroUI e Tailwind configurados com os tokens de `DESIGN.md`, arquivo
  de textos, página inicial provisória e página de erro.
- lefthook: pre-commit com formatador e lint só nos arquivos alterados; pre-push com typecheck e testes
  relacionados ao diff.
- GitHub Actions: em PR, lint, typecheck, testes e build; em merge na main, deploy em homologação e
  depois em produção, aplicando migrations do D1 antes do código.
- Sentry no front e no Worker; Web Analytics no front.
- `AGENTS.md` na raiz com as convenções deste documento e um `README.md` com os comandos.

### O que não fazer

- Não criar tela, rota ou tabela de produto.
- Não criar pacotes para desktop ou Android.
- Não configurar SFU, R2, Woovi nem login.

### Entrega esperada

- Produção e homologação respondem em `GET /api/health` com o commit atual.
- Um PR de teste passa por lint, typecheck, testes e build no CI.
- Um erro lançado de propósito no front e outro no Worker aparecem no Sentry.

---

## Entrega 1 — Sala direta por link, sem conta

### Objetivo

Qualquer pessoa abre o site, cria uma sala com um clique, envia o link e conversa com até 5 convidados
com tela, webcam, voz e chat, sem cadastro.

### Escopo da tarefa

**Criar e entrar**

- Página inicial com um botão para criar sala. Passa pelo Turnstile, cria a sala e leva ao link dela.
- Código da sala curto e difícil de adivinhar **[padrão: 10 caracteres aleatórios]**.
- Quem abre o link escolhe um apelido (2 a 24 caracteres **[padrão]**), vê a prévia de microfone e
  câmera, passa pelo Turnstile e entra no mudo.
- Sessão de quem não tem conta: cookie assinado pelo servidor com um identificador aleatório e o apelido.
- Sala cheia (6 pessoas) recusa a entrada com mensagem clara.
- O link exibe prévia (título e imagem) quando colado em aplicativos de mensagem.

**Dentro da sala**

- Voz para todos, com indicador de quem está falando.
- Cada pessoa transmite 1 vídeo, tela ou webcam, em até 720p a 30 fps. Teto de 4 vídeos na sala; o
  quinto pedido é recusado pelo servidor com mensagem clara.
- Compartilhar tela inclui o áudio da aba ou do sistema quando o navegador oferece.
- Um vídeo em destaque e os demais em miniatura; clicar numa miniatura troca o destaque.
- Chat de texto com as últimas 200 mensagens **[padrão]** para quem entra depois; mensagem de até 2.000
  caracteres **[padrão]**; limite de 5 mensagens a cada 5 segundos por pessoa **[padrão]**.
- Reações rápidas e levantar a mão.
- Botão para copiar o link da sala.
- Em navegador de celular: assistir, falar, webcam, chat e reações. O botão de compartilhar tela não aparece.

**Dono**

- O dono é reconhecido por um token secreto guardado no navegador dele.
- O dono silencia, remove e bane participantes. O banimento vale para a sessão e para o IP, até a sala acabar.
- Uma conexão por pessoa: quem abre a mesma sala em outra aba derruba a anterior, que mostra "Você
  abriu esta sala em outra aba" e o botão "Usar esta aba".
- Se o dono sai, a sala continua sem dono até esvaziar; se ele volta com o mesmo token, reassume.

**Mídia**

- Malha completa: cada navegador mantém uma conexão com cada outro participante.
- Credenciais de TURN de curta duração, geradas pelo Worker. Nunca expor a chave da Cloudflare no front.
- Conexão que está usando retransmissão fica limitada a 720p e 1,5 Mbps.
- Tela usa preferência por nitidez; webcam, por fluidez. A adaptação à rede é a nativa do navegador.
- Cancelamento de eco e supressão de ruído nativos do navegador.
- Reconexão automática depois de queda de rede, sem precisar recarregar a página.

**Servidor**

- O Durable Object da sala guarda presença, papéis, chat, reações e mãos levantadas, repassa a
  sinalização entre os participantes e aplica os limites de pessoas e de vídeos.
- Quando a última pessoa sai, um alarme encerra a sala em 5 minutos e apaga tudo.

### O que não fazer

- Não criar login, conta, perfil, banco de usuários ou qualquer tabela no D1 para esta entrega.
- Não usar o servidor de mídia (SFU). Não criar sala com mais de 6 pessoas.
- Não permitir 1080p, 60 fps nem 2 vídeos por pessoa.
- Não criar sala pública, vitrine, denúncia, painel ou filtro de palavras.
- Não enviar imagem, arquivo ou link com prévia no chat.
- Não escrever controle próprio de qualidade por espectador, escolha manual de codec ou supressão de
  ruído própria.
- Não gravar nem guardar nada depois que a sala acaba.

### Entrega esperada

- Seis navegadores em redes diferentes ficam na mesma sala com voz, 4 vídeos e chat por 30 minutos sem
  queda; o sétimo é recusado.
- Um participante em rede que exige retransmissão entra e é visto e ouvido.
- Remover e banir funcionam e o banido não volta pelo mesmo navegador.
- Sala vazia desaparece em 5 minutos e o link passa a dizer que a sala acabou.
- Testes automatizados cobrem as regras do Durable Object: limite de pessoas, limite de vídeos, papéis,
  banimento, limite de mensagens e encerramento.
- Teste de fumaça no CI: dois navegadores com mídia falsa entram na sala e trocam uma mensagem.

---

## Entrega 2 — Conta, perfil e Plus

### Objetivo

Quem quiser cria conta em dois cliques, ganha um perfil e pode assinar o Plus por Pix para transmitir em
1080p60, com 2 vídeos, link fixo, tema de sala e selo.

### Escopo da tarefa

**Conta e perfil**

- Login com Google e com Discord. Sem senha própria. Guardamos o e-mail informado pelo provedor no
  login, para contato e avisos de cobrança; contas antigas recebem o e-mail no login seguinte.
- No primeiro acesso: um único aceite ("Declaro que sou maior de 18 anos e aceito os Termos de Uso e as
  Políticas de Privacidade."; os termos dizem que quem os aceita declara ser maior de idade) e a escolha
  de um @nome único (3 a 20 caracteres, letras minúsculas, números e sublinhado; troca permitida
  a cada 30 dias **[padrão]**). Mudanças posteriores nos termos valem pelo uso continuado: quem tem
  conta vê uma faixa de aviso no topo, com a data e o link, até fechar ou abrir os termos.
- Perfil: @nome, apelido, avatar vindo do Google ou do Discord, e selos.
- Quem está logado entra nas salas com o apelido e o avatar do perfil. Quem não tem conta continua
  entrando só com apelido.
- Excluir a própria conta apaga os dados pessoais, inclusive o e-mail.
- Páginas de termos de uso e de política de privacidade.

**Plus**

- Página do plano com os benefícios e os dois ciclos.
- Mensal, R$ 19,90: Pix Automático da Woovi, na jornada em que um QR Code autoriza a recorrência e paga
  o primeiro mês. Política de três novas tentativas em 7 dias.
- Anual, R$ 159,90: Pix único, vale 365 dias, sem renovação automática. Avisar 7 dias antes de vencer.
- O CPF pedido pela Woovi é coletado no pagamento e guardado só o necessário para a cobrança.
- Estados da assinatura: ativa, em atraso (durante as novas tentativas, os benefícios continuam),
  cancelada (vale até o fim do período pago) e encerrada.
- O webhook da Woovi é a única origem de mudança de estado. Deve ser autenticado como a documentação
  da Woovi manda e tratado de forma idempotente. Como não há evento de cancelamento, uma rotina diária
  consulta as assinaturas ativas e corrige o estado.
- Cancelar a assinatura pela própria página.

**Benefícios do Plus nesta entrega**

- Em sala direta, o assinante transmite em até 1080p a 60 fps e até 2 vídeos ao mesmo tempo. Vale em
  qualquer sala, por pessoa. O teto de 4 vídeos da sala e o limite de 720p na retransmissão continuam.
- Link fixo: uma sala permanente por assinante no endereço do @nome dele. Ela não expira quando esvazia.
  No cabeçalho da sala, onde a sala comum mostra o código, a sala de link fixo mostra o @nome.
- Tema de sala: o dono Plus escolhe um entre 6 temas prontos de cores e fundo **[padrão]**.
- Selo de Plus ao lado do nome.
- Selo de apoiador inicial, permanente, para os **100 primeiros** que pagarem o Plus (mensal ou anual).
- Quando o Plus acaba: o link fixo fica reservado por 30 dias **[padrão]** e os demais benefícios cessam.

### O que não fazer

- Não criar carteira, moedas, loja ou presentes. O ouro mensal do Plus só começa na entrega 3, que
  credita retroativamente os meses já pagos.
- Não permitir envio de foto de avatar. Não permitir imagens no chat.
- Não criar sala no servidor, sala pública, vitrine ou painel de moderação.
- Não criar editor de temas, temas enviados por usuário ou loja de temas.
- Não oferecer cartão, boleto ou Pix avulso mensal.
- Não criar amigos, grupos nem mensagens diretas.
- Não mudar nada do que a sala oferece a quem não tem conta.

### Entrega esperada

- No ambiente de homologação, com o ambiente de teste da Woovi: assinar mensal, simular renovação,
  simular falha com novas tentativas e cancelamento, e assinar anual, com o estado correto em cada passo.
- O mesmo webhook entregue duas vezes não muda nada na segunda.
- Um assinante transmite em 1080p60 e com 2 vídeos numa sala criada por alguém sem conta; um
  participante sem Plus na mesma sala continua em 720p30 e 1 vídeo.
- O link fixo do assinante sobrevive à sala vazia; o de quem não é Plus continua expirando.
- O 101º pagante não recebe o selo de apoiador inicial.
- Testes automatizados cobrem a máquina de estados da assinatura e a idempotência do webhook.

---

## Entrega 3 — Carteira, loja e presentes

### Objetivo

Dar à conta uma carteira com prata e ouro, vender ouro por Pix, vender cosméticos e permitir presentear,
com saldo sempre correto.

### Escopo da tarefa

**Carteira**

- Dois saldos por conta: prata e ouro. O banco impede saldo negativo.
- Todo movimento gera uma linha num livro-razão com conta, moeda, valor, motivo e uma referência única.
  Saldo e livro-razão mudam juntos, numa única operação atômica.
- Tela de carteira com os dois saldos e o extrato.

**Como o ouro e a prata entram**

- Plus ativo e pago recebe 1.000 de ouro a cada 30 dias, inclusive no plano anual: cada pagamento
  mensal rende 1 crédito e o anual rende 12, um a cada 30 dias a partir do pagamento. Na estreia,
  creditar os meses pagos desde a entrega 2. Plus recebido de presente **não** credita ouro.
- Pacotes por Pix único: R$ 9,90 dá 990 de ouro; R$ 19,90 dá 2.190; R$ 49,90 dá 5.990. O crédito
  acontece só com a confirmação da Woovi, uma única vez por cobrança. A compra pede o CPF, como a
  assinatura do Plus, e ele não é guardado.
- 300 de prata de boas-vindas ao criar a conta **[padrão]**, uma vez; contas já existentes recebem na estreia.
- Nenhuma moeda expira e não há teto de saldo.

**Loja**

- Catálogo guardado no banco: cor do nome, degradê do nome, moldura do avatar e pacotes de reações.
- Catálogo inicial **[padrão]**: 8 cores a 100, 6 degradês a 300, 6 molduras de 300 a 600 e 3 pacotes
  de reações a 400. O preço é um só; o comprador escolhe pagar com prata ou com ouro.
- Pré-visualizar antes de comprar. Itens comprados são permanentes; a pessoa equipa e desequipa.
- Cosméticos equipados aparecem no chat, na lista de pessoas e nas miniaturas, para todos na sala.

**Presentes**

- Enviar ouro a outra conta, pelo @nome ou clicando em alguém na sala, com aviso visível na sala.
  Limite de 2.000 de ouro enviados por dia por conta; o dia é o de calendário, no horário de
  Brasília. Prata não pode ser enviada.
- Presentear 30 dias de Plus a **outra** conta por 1.990 de ouro. Se quem recebe já é Plus, os 30 dias
  somam ao período atual. Plus de presente não renova, não dá selo de apoiador inicial e não conta no
  limite diário de envio de ouro. Quem está em atraso e recebe o presente perde os dias ganhos se as
  novas tentativas de cobrança falharem. Enquanto o Plus de presente vale, a conta não assina o Plus
  pago, e ele acaba sem aviso de vencimento.
- Excluir a conta apaga as compras de ouro pendentes: um Pix pago depois da exclusão não gera crédito.
- Moeda nunca vira dinheiro: não existe saque, reembolso em dinheiro nem conversão de ouro em prata.

### O que não fazer

- Não criar presença diária, missões, indicação, conquistas nem raridade de item. São da fase 2.
- Não criar destaque de sala na vitrine nem gasto de ouro em sala no servidor. São da entrega 4 e da fase 2.
- Não criar doação em dinheiro, subconta, split ou saque.
- Não permitir presentear Plus para a própria conta, nem enviar prata.
- Não creditar ouro por ação do navegador, por rota administrativa sem registro ou antes da confirmação
  da Woovi.
- Não aceitar imagem enviada por usuário como cosmético.

### Entrega esperada

- No ambiente de homologação: comprar cada pacote, receber o ouro uma única vez mesmo com o webhook
  repetido, comprar e equipar um cosmético com prata e outro com ouro, enviar ouro e presentear Plus.
- Dois gastos simultâneos que juntos passam do saldo: um falha e o saldo não fica negativo.
- A soma do livro-razão de cada conta bate com o saldo em qualquer momento.
- O envio que passaria de 2.000 de ouro no dia é recusado.
- Testes automatizados cobrem crédito, débito, concorrência, idempotência, limite diário e as regras do
  presente de Plus.

---

## Entrega 4 — Sala de 12, novos limites e sala protegida

Substitui a entrega 4 original (sala no servidor com SFU, palco, plateia, vitrine, moderação e
imagens), que saiu do MVP. O motivo e as contas estão em `analise-concorrentes-reestrutura.md`.

### Objetivo

Fechar o MVP com o desenho que disputa com os concorrentes: sala direta de até 12 pessoas com vídeo sob
demanda, 1080p60 de graça e Plus mais barato, sem que nenhum vídeo passe pela nossa banda sem estar pago
em ouro. Entram junto o moderador, os limites de frequência e o registro de acesso.

### Escopo da tarefa

**Sala direta de 12**

- O limite da sala direta sobe de 6 para 12 pessoas. A 13ª é recusada com mensagem clara.
- Voz em malha entre todos, como hoje.
- Vídeo sob demanda: quem transmite anuncia o vídeo à sala, e ele aparece para os outros como um cartão
  com o nome de quem transmite e o botão "Assistir".
- Enquanto a sala tem até 6 pessoas, o vídeo novo abre sozinho para todos, até o limite de 4 assistidos
  de cada um. Com 7 ou mais, só abre para quem clica em "Assistir"; o que já estava aberto continua.
- Assistir e parar de assistir são mensagens de `packages/protocol`. O Durable Object guarda quem assiste
  o quê, recusa o 5º vídeo assistido pela mesma pessoa e avisa quem transmite, que só então abre ou fecha
  o envio para aquele participante.
- Sai o teto de 4 vídeos por sala. Vídeos por pessoa: 2; Plus, 4.

**Qualidade**

- Sem Plus: até 1080p a 60 fps, até 5 Mbps.
- Plus: até 2160p e 240 fps, até 32 Mbps. Não custa banda nossa: em conexão retransmitida vale o teto
  de 720p.
- Continua aplicada pelo navegador de quem transmite, com a adaptação nativa à rede.

**Retransmissão (TURN)**

- Voz passa pela retransmissão para qualquer pessoa.
- Vídeo num par retransmitido só é enviado quando quem transmite é Plus e tem ouro. Fica
  limitado a 720p e 1,5 Mbps; o som da tela, a 64 kbps.
- A cada minuto, o Durable Object debita de quem transmite o preço de cada par de vídeo retransmitido que
  está sendo assistido. Cada débito vai para o livro-razão. Sem ouro, o vídeo para naquele par e a voz
  continua.
- Quem não vê ou não é visto por causa disso recebe um aviso claro, dos dois lados, com o caminho: o
  Plus de quem transmite.
- Credenciais de retransmissão com identificador por sessão, para que o uso de cada uma possa ser
  conferido (risco 10).

**Sala protegida**

- Só o dono com Plus ativo e ouro abre. Escolhe ao criar; a sala não muda de tipo em andamento. Na sala
  de link fixo, o dono liga ou desliga com a sala vazia.
- Até 6 pessoas, no máximo 2 vídeos ao mesmo tempo na sala, 720p a 1,5 Mbps.
- Toda a mídia passa pela retransmissão. O Durable Object descarta, na sinalização, qualquer candidato de
  conexão que não seja de retransmissão: nenhum participante recebe o IP de outro.
- Preço fixo por hora, debitado do dono por minuto, que cobre a voz e o vídeo de todos na sala. Antes de
  confirmar, o dono vê o preço e quantas horas o saldo dele cobre.
- Aviso ao dono com 10 e com 2 minutos de saldo. Ao zerar, 3 minutos de tolerância; sem recarga, a sala
  encerra para todos (não vira sala direta, para não expor IP). O saldo nunca fica negativo.
- Qualquer participante com conta pode enviar ouro ao dono por um botão na sala. É o envio de ouro da
  entrega 3, com o mesmo limite diário.

**Franquia em horas**

- A carteira e a sala mostram o ouro também como tempo: "cerca de X h de sala protegida". A sala mostra o
  tempo que resta, não o ouro caindo.

**Plus**

- Preço novo: R$ 9,90 por mês e R$ 79,90 por ano. Ouro: 500 a cada 30 dias; o anual rende 12 créditos.
- Não há assinante real no preço antigo: passa a existir só o preço novo, sem regra de transição.
- Benefícios: qualidade acima de 1080p60, 4 vídeos, vídeo em retransmissão, sala protegida, link fixo,
  tema de sala e selo.
- Presentear 30 dias de Plus passa a custar 990 de ouro.
- Cosméticos baixam cerca de 30%: cores a 70, degradês a 200, molduras de 200 a 400 e pacotes de reações
  a 280, em prata ou em ouro. Quem já comprou não recebe diferença.
- Página do plano e textos atualizados.

**Medição de custo, antes de fixar os preços**

- Em homologação, medir os GB que a Cloudflare cobra por: um par de vídeo retransmitido numa ponta e nas
  duas; uma sala protegida de 6 pessoas com 2 vídeos assistidos por todos.
- Preço final em ouro por hora = custo medido do pior caso × 2 ÷ R$ 0,0082. O dono aprova os valores
  finais.
- Medição de 16/11/2026 (`docs/medicao-custo-retransmissao.md`): um par de vídeo retransmitido gasta
  0,746 GB por hora no pior caso, e a Cloudflare cobra cada sentido uma vez só, mesmo com as duas
  pontas em retransmissão. Preços aprovados pelo dono: 50 de ouro por hora por par e 570 por hora na
  sala protegida. O da sala protegida é extrapolado (6 pessoas, 2 vídeos) e será medido de novo com
  usuários reais.

**Moderador, limites de frequência e registro de acesso**

- Como em `POS-MVP-v5.md`, "Acréscimos à entrega 4". O moderador vale na sala direta e na protegida. Sem
  painel de moderação, o registro de acesso é consultado direto no D1.

**Termos de Uso e Políticas de Privacidade**

- Revisar os dois com o que muda (retransmissão, sala protegida, registro de acesso que passa a existir,
  preço do Plus) e mudar `TERMS_VERSION`.

### O que não fazer

- Não usar o servidor de mídia (SFU). Não criar palco, plateia, sala grande, sala pública nem vitrine.
- Não criar denúncia, painel de moderação, lista de palavras nem classificador. Não enviar imagem no chat
  nem foto própria de avatar. Tudo isso vai com os grupos, depois do MVP, por decisão do dono.
- Não enviar vídeo pela retransmissão sem o débito em ouro. Não incluir horas gratuitas, cortesia nem
  período de teste. Não aceitar prata como pagamento.
- Não mudar uma sala em andamento entre direta e protegida.
- Não escrever controle de qualidade por espectador nem escolha manual de codec.
- Não criar amigos, grupos, mensagens diretas, indicação nem assistir junto.
- Não fixar preço de retransmissão sem a medição.

### Entrega esperada

- Doze navegadores ficam na mesma sala com voz por 30 minutos; o 13º é recusado.
- Um vídeo só é enviado a quem clicou em assistir; o 5º vídeo assistido é recusado; quem para de assistir
  deixa de receber.
- Sem Plus, um par retransmitido tem voz e não tem vídeo, e os dois lados veem o aviso.
- Com Plus e ouro, o par retransmitido tem vídeo a 720p, e o ouro debitado bate com os minutos e os pares.
- Numa sala protegida, nenhum participante recebe candidato de conexão que não seja de retransmissão; o
  3º vídeo é recusado; o débito bate minuto a minuto; com saldo insuficiente, a sala avisa, espera a
  tolerância e encerra; com recarga, continua.
- A assinatura custa R$ 9,90 e credita 500 de ouro; o presente de Plus custa 990 e a loja mostra os preços novos.
- Moderador, limites de frequência e registro de acesso passam nos aceites de `POS-MVP-v5.md`.
- O relatório da medição de custo traz os GB por cenário e os preços propostos.
- Testes automatizados cobrem: limite de 12, quem assiste o quê, limite de 4 assistidos, decisão de vídeo
  por par retransmitido, débito por par, filtro de candidatos, cobrança, avisos, tolerância e
  encerramento da sala protegida.
- Teste de fumaça no CI continua passando com o vídeo sob demanda.

---

## Depois do MVP — não implementar agora

O detalhe de cada etapa está em `POS-MVP-v5.md`. A ordem foi decidida pelo dono.

| Ordem | Etapa | Conteúdo |
|---|---|---|
| 1 | Grupo A e lançamento | Condições para abrir ao público, inclusive a Central de Segurança com canal oficial |
| 2 | Desktop | Electron: som só do programa, sem eco; atalhos globais, sobreposição e atualização automática |
| 3 | Assistir junto, bot do Discord e indicação | YouTube e Twitch pelos players oficiais, grátis para todos. Bot que cria a sala e posta o link no canal. Convite que vira uso real rende dias de Plus sem ouro |
| 4 | Fase 2 | Presença diária, missões e conquistas (pagam prata) |
| 5 | Grupos | Só começa quando o retorno semanal for atingido. Amigos, grupos com chat guardado, imagens com classificador e mensagens diretas entre amigos. Nascem junto: denúncia e painel, apagar mensagens, filtro e classificador de texto, Termos revistos, foto própria de avatar, cofre do grupo e loja forte (raridade, itens raros só em ouro, coleção mensal) |
| 6 | Android | Capacitor sobre o web: tela do celular, chamada em segundo plano, notificações |
| 7 | Sala grande | SFU para 7 a 50 pessoas, por link, com palco e plateia. Paga com o ouro do dono ou do cofre do grupo, pela regra de preço |

Sem data: sala pública e vitrine; doação em Pix (exige parecer jurídico); jogar no PC do amigo (reavaliar
quando o Desktop existir).

Fora do produto: anúncios, afiliados, instalar como app (PWA), música no perfil, efeitos na câmera de
outras pessoas, integrações de terceiros (exceto os players oficiais do YouTube e da Twitch e o bot do
Discord, cada um registrado quando a etapa começar), saque de moedas, mais de um plano pago, outros
idiomas e outros meios de pagamento.

---

## Parâmetros

| Parâmetro | Valor |
|---|---|
| Pessoas na sala direta | 12 (6 até a entrega 4) |
| Pessoas na sala protegida | 6 |
| Vídeos por pessoa | 2; Plus 4 |
| Vídeos assistidos ao mesmo tempo por pessoa | 4 |
| Vídeos simultâneos na sala protegida | 2 |
| Qualidade sem Plus | até 1080p, 60 fps, 5 Mbps |
| Qualidade Plus | até 2160p, 240 fps, 32 Mbps |
| Vídeo em conexão retransmitida | 720p, até 1,5 Mbps; só de quem é Plus e tem ouro |
| Som da tela em conexão retransmitida | até 64 kbps |
| Sala vazia expira em | 5 minutos |
| Plus mensal / anual | R$ 9,90 / R$ 79,90 |
| Ouro mensal do Plus | 500 a cada 30 dias; 12 créditos por pagamento anual |
| Câmbio de face | 100 de ouro = R$ 1 |
| Rendimento do ouro usado nos preços | 100 de ouro = R$ 0,82 |
| Regra de preço do que gasta banda | pior caso medido × 2 |
| Vídeo retransmitido, por par assistido | 50 de ouro por hora (medido em 16/11/2026) |
| Sala protegida | 570 de ouro por hora (extrapolado da medição de 16/11/2026; medir de novo com uso real) |
| Taxa da Woovi | R$ 0,85 fixos por transação, inclusive no Pix Automático |
| Custo da banda (Cloudflare) | US$ 0,05 por GB de saída; 1.000 GB grátis por mês, somando TURN e SFU |
| Dólar adotado nos cálculos de custo | R$ 5,50 |
| Pacotes de ouro | R$ 9,90 → 990; R$ 19,90 → 2.190; R$ 49,90 → 5.990 |
| Prata de boas-vindas | 300 |
| Limite de envio de ouro | 2.000 por dia de calendário (Brasília) por conta |
| Presentear 30 dias de Plus | 990 de ouro |
| Cosméticos | cores 70; degradês 200; molduras 200 a 400; pacotes de reações 280 |
| Selo de apoiador inicial | 100 primeiros pagantes |
| Avisos de saldo na sala protegida | 10 e 2 minutos; tolerância de 3 minutos |
| Registro de acesso | 6 meses (183 dias) |
| Limites de frequência por pessoa | chat 5 a cada 5 s; reações 10 a cada 5 s; levantar ou baixar a mão 6 a cada 30 s; ligar ou desligar o microfone 10 a cada 10 s **[padrão]** |

A tabela de preço da sala no servidor da versão anterior (150 a 4.300 de ouro por hora) foi retirada:
ficava abaixo do custo do pior caso. A da sala grande será feita pela regra de preço quando a etapa chegar.

## Riscos conhecidos

| # | Risco | Como o plano trata |
|---|---|---|
| 1 | Dois caminhos de mídia é o trabalho mais caro | O SFU saiu do MVP; a sala protegida usa a mesma malha, só com retransmissão |
| 2 | Qualidade alta na sala direta depende do computador e do upload de quem transmite | Adaptação nativa do navegador; vídeo sob demanda reduz o envio; o app desktop alivia depois |
| 3 | Conta gratuita e sem conta são quase iguais, agora com 12 pessoas e 1080p60 | Medir a conversão; a conta ganha valor com a Fase 2 e os grupos |
| 4 | Ouro sem validade e sem teto é dívida de banda acumulada | Acompanhar o total em circulação; a regra de preço garante margem sobre cada ouro gasto |
| 5 | Malha com 12 pessoas nunca foi testada | Aceite da entrega 4; se não segurar, o limite baixa em configuração |
| 6 | Limites de qualidade são aplicados pelo navegador e podem ser burlados | Aceito: não custa banda nossa fora da retransmissão |
| 7 | Sem vídeo em retransmissão para quem não paga: parte dos pares fica só com voz | Aceito pelo dono; aviso claro dos dois lados; medir quantos pares caem nisso |
| 8 | Preços em ouro usam R$ 5,50 por dólar e larguras de banda estimadas | Preços em configuração; nada é fixado sem a medição da entrega 4 |
| 9 | A franquia de 500 de ouro compra cerca de 1 hora de sala protegida | Aceito pelo dono; mostrar o tempo com clareza antes da compra |
| 10 | Um cliente adulterado pode mandar vídeo pela retransmissão dizendo que a conexão é direta | Credenciais com identificador por sessão e conferência do uso de cada uma contra o esperado para voz. Confirmar na documentação da Cloudflare se o uso por credencial pode ser lido; se não puder, o risco fica aberto e vai ao dono |
| 11 | A Cloudflare pode cobrar a saída duas vezes quando as duas pontas usam retransmissão | A medição da entrega 4 responde; a regra × 2 dá folga |
| 12 | Sala de 12 e 1080p60 sem denúncia na sala direta | Aceito pelo dono; revisar a cada 3 meses; o registro de acesso responde a autoridade |
| 13 | Chat de grupo guardado, imagens e mensagens diretas com idade só por autodeclaração | Etapa de grupos. A análise recomenda parecer jurídico e verificação de idade antes dela; decisão do dono em aberto |
