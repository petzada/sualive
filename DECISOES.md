# Especificação de implementação

Versão final de 2026-11-14. Este documento é a fonte de verdade do **que** construir. A aparência
(cores, tipografia, espaçamentos, componentes) é definida em `DESIGN.md`. As credenciais de cada
entrega estão listadas em `SEGREDOS.md`.

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
O público é quem faz stream e chama gente para assistir ou participar. O produto de referência é o Go
Live (golive.nemtudo.me); **nenhum código dele pode ser usado ou consultado**, a licença proíbe uso
comercial.

Idioma da interface: português do Brasil. Pagamento: Pix, pela Woovi. Conta exige 18 anos.

## Glossário

| Termo | Significado |
|---|---|
| Sala direta | Sala de até 6 pessoas em que áudio e vídeo trafegam direto entre os navegadores (WebRTC em malha). É o tipo padrão. |
| Sala no servidor | Sala de até 50 pessoas em que áudio e vídeo passam por um servidor de mídia. Só o dono Plus abre, pagando ouro por minuto. Tem três usos: sala grande, sala pública e modo protegido. |
| Modo protegido | Sala no servidor de até 6 pessoas, usada para esconder o IP dos participantes. Todos falam e transmitem, como na sala direta. |
| Sala grande | Sala no servidor por link, de 7 a 50 pessoas, com palco e plateia. |
| Sala pública | Sala no servidor listada na vitrine, com palco e plateia. |
| Palco | Participantes que falam e transmitem numa sala grande ou pública. O dono decide quem sobe. |
| Plateia | Participantes que assistem, usam chat e reações e levantam a mão. |
| Dono | Quem criou a sala. Sem conta, é reconhecido por um token guardado no navegador. |
| Prata | Moeda ganha de graça. Só compra cosméticos. |
| Ouro | Moeda comprada ou recebida com o Plus. 100 de ouro = R$ 1. |
| Plus | O único plano pago: R$ 19,90 por mês ou R$ 159,20 por ano. |

## Níveis

| | Sem conta | Conta gratuita | Plus |
|---|---|---|---|
| Criar e entrar em sala direta por link | sim, com apelido | sim | sim |
| Qualidade do que **a própria pessoa** transmite em sala direta | 720p30 | 720p30 | 1080p60 |
| Vídeos simultâneos da própria pessoa (tela ou webcam) | 1 | 1 | 2 |
| Perfil, @nome, carteira | não | sim | sim, com selo |
| Enviar imagem no chat (a partir da entrega 4) | não | sim | sim |
| Sala pública | assiste e ouve | plateia com chat; palco se o dono chamar | cria |
| Abrir sala no servidor | não | não | sim, pagando ouro |
| Link fixo e tema de sala | não | não | sim |
| Ouro mensal | — | — | 1.000 |

Regras que valem em todas as entregas:

- Sala direta: até 6 pessoas, todos falam e transmitem. Qualquer sala: no máximo 4 vídeos ao mesmo tempo.
- Em sala direta, qualidade e número de vídeos seguem **o plano de cada pessoa**, não o do dono.
- Em sala no servidor, a qualidade é a que o dono escolheu e paga; vale para todos no palco.
- Conexão que precisa de retransmissão (TURN) na sala direta é limitada a 720p para todos, inclusive Plus.
- Entra-se em qualquer sala com o microfone mudo.
- Sala de dono sem Plus acaba 5 minutos **[padrão]** depois que a última pessoa sai. O chat é apagado junto.

## Regras globais de implementação

### Stack

| Camada | Escolha |
|---|---|
| Repositório | Monorepo com pnpm e turbo: `apps/web`, `apps/api`, `packages/protocol`, `packages/media`, `packages/config` |
| Front | React 19, Vite, TypeScript, aplicação de página única |
| Interface | HeroUI 3 sobre Tailwind 4, com os tokens de `DESIGN.md` (tema claro) |
| API | Hono em Cloudflare Workers (plano Paid); o mesmo Worker serve os arquivos do front |
| Tempo real | Um Durable Object por sala, com WebSocket e hibernação |
| Mídia, sala direta | WebRTC em malha, com STUN e TURN da Cloudflare |
| Mídia, sala no servidor | Cloudflare Realtime SFU (entrega 4) |
| Banco | Cloudflare D1, com Drizzle |
| Arquivos | Cloudflare R2 (entrega 4) |
| Login | OAuth do Google e do Discord com Arctic; sessão própria em cookie `HttpOnly`, guardada no D1 **[padrão]** |
| Pagamento | Woovi: Pix Automático e Pix único |
| Anti-robô | Cloudflare Turnstile e limite de requisições por IP |
| Classificador | Workers AI (entrega 4) |
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
  dois caminhos de mídia; a interface do produto não sabe qual está em uso.
- **O servidor decide, o cliente obedece.** Limites de pessoas, de vídeos, papéis, plano e saldo são
  verificados no Durable Object ou no Worker. A exceção conhecida é a qualidade na sala direta, que só o
  navegador de quem transmite pode aplicar.
- Scripts com os mesmos nomes em todos os pacotes: `typecheck`, `lint`, `test`, `test:related`,
  `test:ci`, `e2e`, `build`.
- Migrations do D1 só adicionam (coluna com default ou nula, tabela, índice). Remover, renomear ou mudar
  tipo vai em alteração separada, depois que nenhum código no ar usa a estrutura antiga.
- Commits no padrão Conventional Commits, em português, em branch própria. Nunca na main.

### O que nunca fazer, em nenhuma entrega

- Copiar ou consultar código do Go Live.
- Rodar banco local, Docker ou qualquer servidor de banco. Desenvolvimento usa o simulador do Wrangler.
- Fazer deploy a partir da máquina de desenvolvimento.
- Colocar segredo no front, em arquivo versionado ou em variável `VITE_*`.
- Confiar em valor enviado pelo navegador para plano, saldo, papel, preço ou identidade.
- Creditar plano ou ouro por qualquer caminho que não seja a confirmação recebida da Woovi.
- Deixar saldo de moeda negativo ou alterar saldo sem registrar a linha correspondente no livro-razão.
- Guardar gravação de áudio ou vídeo, ou o conteúdo do chat depois que a sala acaba (exceto a cópia
  anexada a uma denúncia).
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

- Login com Google e com Discord. Sem senha própria.
- No primeiro acesso: declarar ter 18 anos ou mais, aceitar os termos de uso e a política de privacidade,
  e escolher um @nome único (3 a 20 caracteres, letras minúsculas, números e sublinhado; troca permitida
  a cada 30 dias **[padrão]**).
- Perfil: @nome, apelido, avatar vindo do Google ou do Discord, e selos.
- Quem está logado entra nas salas com o apelido e o avatar do perfil. Quem não tem conta continua
  entrando só com apelido.
- Excluir a própria conta apaga os dados pessoais.
- Páginas de termos de uso e de política de privacidade.

**Plus**

- Página do plano com os benefícios e os dois ciclos.
- Mensal, R$ 19,90: Pix Automático da Woovi, na jornada em que um QR Code autoriza a recorrência e paga
  o primeiro mês. Política de três novas tentativas em 7 dias.
- Anual, R$ 159,20: Pix único, vale 365 dias, sem renovação automática. Avisar 7 dias antes de vencer.
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

- Plus ativo e pago recebe 1.000 de ouro a cada 30 dias, inclusive no plano anual. Na estreia, creditar
  os meses pagos desde a entrega 2. Plus recebido de presente **não** credita ouro.
- Pacotes por Pix único: R$ 9,90 dá 990 de ouro; R$ 19,90 dá 2.190; R$ 49,90 dá 5.990. O crédito
  acontece só com a confirmação da Woovi, uma única vez por cobrança.
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
  Limite de 2.000 de ouro enviados por dia por conta. Prata não pode ser enviada.
- Presentear 30 dias de Plus a **outra** conta por 1.990 de ouro. Se quem recebe já é Plus, os 30 dias
  somam ao período atual.
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

## Entrega 4 — Sala no servidor: protegida, grande e pública

### Objetivo

O dono Plus abre salas que passam pelo servidor de mídia, pagando ouro por minuto: para esconder o IP,
para reunir até 50 pessoas ou para aparecer na vitrine. Entra junto a moderação que a sala pública exige.

### Escopo da tarefa

**Abrir**

- Só dono com Plus ativo. Ao abrir, ele escolhe o tipo (protegida, grande ou pública), o máximo de
  pessoas e a qualidade (720p30, 1080p30 ou 1080p60), e vê o preço por hora antes de confirmar.
- Protegida: até 6 pessoas, todos falam e transmitem, como na sala direta.
- Grande (por link) e pública (na vitrine): até 50 pessoas, com palco e plateia.

**Palco e plateia**

- O dono começa no palco. Quem está no palco fala e transmite; o teto de 4 vídeos continua.
- A plateia assiste, ouve, usa chat e reações e levanta a mão. O dono chama para o palco e tira dele.
- O palco não tem limite próprio além do tamanho da sala.
- Em sala pública: quem não tem conta só assiste e ouve; quem tem conta usa chat e reações e pode ser
  chamado ao palco.

**Mídia**

- Cloudflare Realtime SFU. O Durable Object da sala é o único que fala com a API do SFU; as credenciais
  ficam no servidor.
- Cada vídeo é publicado em duas camadas. O vídeo em destaque é entregue na qualidade da sala; as
  miniaturas, na camada baixa.
- A troca entre os dois caminhos de mídia acontece só ao abrir a sala, nunca com a sala em andamento.

**Cobrança em ouro**

- A cada minuto o servidor conta as pessoas presentes, acha a faixa (até 6, até 20 ou até 50) e debita
  do dono o valor da tabela de preços. Cada débito vai para o livro-razão.
- Aviso ao dono com 10 e com 2 minutos de saldo. Ao zerar, 3 minutos de tolerância; sem recarga, a sala
  encerra para todos. O saldo nunca fica negativo.
- Qualquer participante com conta pode enviar ouro ao dono por um botão na sala, para mantê-la aberta.
  É o mesmo envio de ouro da entrega 3, com o mesmo limite diário **[padrão]**.

**Sala pública e moderação**

- Vitrine com as salas públicas abertas: título, dono, número de pessoas, ordenadas por audiência.
- Botão de denúncia em toda sala pública. A denúncia guarda motivo, sala, denunciado e cópia das
  últimas mensagens do chat.
- Painel interno, só para contas com papel de administrador: fila de denúncias, encerrar sala, suspender
  e banir conta.
- Em sala pública: lista de palavras bloqueadas e classificador automático de texto (Workers AI) nas
  mensagens do chat. Confira no catálogo atual do Workers AI qual modelo usar; não presuma.

**Imagens**

- Envio de foto própria de avatar e imagens no chat, só para quem tem conta, guardadas no R2.
- Toda imagem passa pelo classificador antes de aparecer; reprovada não é publicada.
- Em sala pública, imagens no chat ficam desligadas por padrão; o dono pode ligar.

### O que não fazer

- Não mudar a sala direta: ela continua gratuita, com até 6 pessoas e sem servidor de mídia.
- Não incluir horas gratuitas, franquia ou cortesia de sala no servidor. Todo minuto é pago em ouro.
- Não aceitar prata como pagamento de sala.
- Não deixar conta gratuita ou sem conta abrir sala no servidor.
- Não criar destaque pago na vitrine, categorias, busca, seguidores ou notificação de sala aberta.
- Não gravar, transcrever, traduzir nem gerar clipe.
- Não migrar uma sala em andamento entre o caminho direto e o servidor.
- Não criar doação em dinheiro.

### Entrega esperada

- Uma sala grande com 50 navegadores, 4 vídeos no palco e chat ativo funciona por 30 minutos.
- O ouro debitado bate com os minutos e as faixas de presença registrados, minuto a minuto.
- Com saldo insuficiente, a sala avisa, espera a tolerância e encerra; com recarga, continua.
- Numa sala protegida, nenhum participante recebe o IP de outro.
- Denúncia aparece no painel com a cópia do chat; encerrar sala e banir conta têm efeito imediato.
- Imagem reprovada pelo classificador não aparece para ninguém.
- Testes automatizados cobrem a cobrança por faixa, os avisos, a tolerância, o encerramento e as
  permissões de palco e plateia.

---

## Depois do MVP — não implementar agora

| Etapa | Conteúdo |
|---|---|
| Fase 2 | Presença diária, missões, indicação e conquistas (pagam prata); destaque de sala na vitrine (ouro); raridade na loja |
| Social | Amigos e convite direto; depois grupos com salas fixas; depois mensagens diretas |
| Doação em Pix | Só dono Plus recebe. Mínimo de R$ 5. Quem doa paga o valor, mais 10% para a plataforma, mais a taxa do Pix. O Plus tem 1 saque gratuito por mês; os demais pagam 10%. Exige parecer jurídico antes |
| Desktop | Electron: áudio do sistema sem eco, atalhos globais e sobreposição, atualização automática e loja |
| Android | Capacitor sobre o web: compartilhar a tela do celular, chamada em segundo plano, notificações |

Fora do produto: resolução acima de 1080p60, anúncios, afiliados, música no perfil, efeitos na câmera de
outras pessoas, bots e integrações de terceiros, saque de moedas, mais de um plano pago, outros idiomas
e outros meios de pagamento.

---

## Parâmetros

| Parâmetro | Valor |
|---|---|
| Pessoas na sala direta | 6 |
| Pessoas na sala no servidor | até 50 |
| Vídeos simultâneos por sala | 4 |
| Vídeos por pessoa | 1; Plus 2 |
| Qualidade gratuita | 720p, 30 fps, até 1,5 Mbps |
| Qualidade Plus em sala direta | 1080p, 60 fps, até 5 Mbps |
| Qualidade em conexão retransmitida | 720p, até 1,5 Mbps |
| Sala vazia expira em | 5 minutos |
| Plus mensal / anual | R$ 19,90 / R$ 159,20 |
| Ouro mensal do Plus | 1.000 |
| Câmbio | 100 de ouro = R$ 1 |
| Taxa da Woovi | R$ 0,85 fixos por transação, inclusive no Pix Automático |
| Dólar adotado nos cálculos de custo | R$ 5,50 |
| Pacotes de ouro | R$ 9,90 → 990; R$ 19,90 → 2.190; R$ 49,90 → 5.990 |
| Prata de boas-vindas | 300 |
| Limite de envio de ouro | 2.000 por dia por conta |
| Presentear 30 dias de Plus | 1.990 de ouro |
| Selo de apoiador inicial | 100 primeiros pagantes |
| Avisos de saldo na sala no servidor | 10 e 2 minutos; tolerância de 3 minutos |

Preço da sala no servidor, em ouro por hora, cobrado por minuto pela faixa da presença real:

| Pessoas presentes | 720p30 | 1080p30 | 1080p60 |
|---|---|---|---|
| até 6 | 150 | 250 | 500 |
| até 20 | 500 | 850 | 1.700 |
| até 50 | 1.300 | 2.200 | 4.300 |

## Riscos conhecidos

| # | Risco | Como o plano trata |
|---|---|---|
| 1 | Dois caminhos de mídia é o trabalho mais caro | A sala direta sai primeiro e o servidor por último; `packages/media` isola os dois |
| 2 | 1080p60 na sala direta depende do computador e do upload do assinante | Adaptação nativa do navegador; o app desktop alivia depois |
| 3 | Conta gratuita e sem conta são quase iguais | Medir a conversão; o primeiro ajuste é reduzir a sala sem conta para 4 pessoas |
| 4 | Ouro sem validade e sem teto é dívida de banda acumulada | Acompanhar o total de ouro em circulação |
| 5 | Palco com até 50 pessoas falando pode pesar no navegador e na moderação | Decidido: medir na entrega 4 e só então definir limite de microfones abertos |
| 6 | Limites de qualidade na sala direta são aplicados pelo navegador e podem ser burlados | Aceito: não custa banda nossa, exceto na retransmissão |
| 7 | Modelo do Workers AI para classificar texto e imagem ainda não escolhido | Decidido: conferir o catálogo e medir na entrega 4 |
| 8 | Preços em ouro usam R$ 5,50 por dólar (valor adotado) | Preços ficam em configuração; rever se o câmbio se afastar muito |
| 9 | Sala pública exige resposta rápida a denúncia | Painel e rotina de moderação fazem parte da entrega 4 |
