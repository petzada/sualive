import {
  ACCESS_LOG_RETENTION_DAYS,
  APP_NAME,
  EARLY_SUPPORTER_LIMIT,
  FIXED_LINK_RESERVE_DAYS,
  FREE_VIDEO_QUALITY,
  GOLD_GIFT_DAILY_LIMIT,
  HANDLE_CHANGE_INTERVAL_DAYS,
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  MINIMUM_AGE,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  PLUS_ANNUAL_PRICE_CENTS,
  PLUS_GIFT_DAYS,
  PLUS_GIFT_PRICE_GOLD,
  PLUS_GOLD_AMOUNT,
  PLUS_GOLD_INTERVAL_DAYS,
  PLUS_MONTHLY_PRICE_CENTS,
  PLUS_RETRY_ATTEMPTS,
  PLUS_RETRY_WINDOW_DAYS,
  PLUS_VIDEO_QUALITY,
  PLUS_VIDEOS_PER_PERSON,
  PROTECTED_ROOM_GOLD_PER_HOUR,
  PROTECTED_ROOM_GRACE_MS,
  PROTECTED_ROOM_MAX_PEOPLE,
  PROTECTED_ROOM_MAX_VIDEOS,
  PROTECTED_ROOM_WARNING_MINUTES,
  RELAY_VIDEO_GOLD_PER_HOUR,
  RELAY_VIDEO_QUALITY,
  ROOM_MAX_PEOPLE,
  VIDEOS_PER_PERSON,
  WATCHED_VIDEOS_PER_PERSON,
  WELCOME_SILVER,
} from "@sualive/config";
import type { Currency, RoomTheme, VideoQuality } from "@sualive/config";
import { formatAmount, formatCents, formatProtectedRoomTime } from "./components/format";

/** One block of a legal page: plain text, or a passage still waiting for data from the operator. */
export type LegalBlock = string | { pending: string };
export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

const ROOM_THEME_NAMES: Record<RoomTheme, string> = {
  default: "Padrão",
  ocean: "Oceano",
  forest: "Floresta",
  sunset: "Pôr do sol",
  lavender: "Lavanda",
  graphite: "Grafite",
};

/**
 * Days of the money-back guarantee shown on the plan cards. Not a parameter of `@sualive/config`
 * yet: nothing on the server reads it.
 */
const PLUS_GUARANTEE_DAYS = 7;
const PLUS_GUARANTEE = `Garantia de ${PLUS_GUARANTEE_DAYS} dias`;

/** Pixels of width in one "K" of resolution: 3840 wide is "4K". */
const PIXELS_PER_K = 1000;
/** "1080p60": the height and the frame rate, the short way. */
const qualityShort = (quality: VideoQuality) => `${quality.height}p${quality.frameRate}`;
/** "1080p a 60 fps": the same, inside a sentence. */
const qualityLong = (quality: VideoQuality) => `${quality.height}p a ${quality.frameRate} fps`;

/** What everyone transmits without the Plus. */
const FREE_QUALITY_SHORT = qualityShort(FREE_VIDEO_QUALITY);
const FREE_QUALITY = qualityLong(FREE_VIDEO_QUALITY);
/** "até 4K e 240 fps": the ceiling of who has the Plus, on a direct connection. */
const PLUS_QUALITY = `até ${Math.round(PLUS_VIDEO_QUALITY.width / PIXELS_PER_K)}K e ${PLUS_VIDEO_QUALITY.frameRate} fps`;
/** The ceiling of a video that goes through the relay, by its size in pixels. */
const RELAY_QUALITY = `HD (${RELAY_VIDEO_QUALITY.width}×${RELAY_VIDEO_QUALITY.height})`;

/** The two currencies, as they are named in the middle of a sentence. */
const CURRENCY_NAMES: Record<Currency, string> = { silver: "prata", gold: "ouro" };
/** "990 de ouro": an amount with its currency. */
const coins = (amount: number, currency: Currency) =>
  `${formatAmount(amount)} de ${CURRENCY_NAMES[currency]}`;
const GOLD_DAILY_LIMIT = coins(GOLD_GIFT_DAILY_LIMIT, "gold");
const PLUS_GIFT_PRICE = coins(PLUS_GIFT_PRICE_GOLD, "gold");

const PLUS_MONTHLY_PRICE = formatCents(PLUS_MONTHLY_PRICE_CENTS);
const PLUS_ANNUAL_PRICE = formatCents(PLUS_ANNUAL_PRICE_CENTS);
/** The gold that comes with the paid Plus, and the same as time of protected room. */
const PLUS_GOLD = coins(PLUS_GOLD_AMOUNT, "gold");
const PLUS_GOLD_TIME = formatProtectedRoomTime(PLUS_GOLD_AMOUNT);

/** What spends our bandwidth is paid in gold, by the hour, charged by the minute. */
const PROTECTED_ROOM_PRICE = `${coins(PROTECTED_ROOM_GOLD_PER_HOUR, "gold")} por hora`;
const RELAY_VIDEO_PRICE = `${coins(RELAY_VIDEO_GOLD_PER_HOUR, "gold")} por hora`;
const PROTECTED_ROOM_SIZE = `até ${PROTECTED_ROOM_MAX_PEOPLE} pessoas e ${PROTECTED_ROOM_MAX_VIDEOS} vídeos ao mesmo tempo`;
/** The warnings of low balance of the protected room, the earliest first, and the tolerance. */
const PROTECTED_ROOM_WARNINGS = [...PROTECTED_ROOM_WARNING_MINUTES].sort((a, b) => b - a).join(" e ");
const MS_PER_MINUTE = 60_000;
const PROTECTED_ROOM_GRACE_MINUTES = Math.round(PROTECTED_ROOM_GRACE_MS / MS_PER_MINUTE);

/**
 * Numbers that only the legal pages state. Not parameters of `@sualive/config` yet: nothing on the
 * server reads them.
 */
const REFUND_PAYOUT_BUSINESS_DAYS = 7;
const BILLING_RECORDS_YEARS = 5;
const LIABILITY_WINDOW_MONTHS = 12;

/** The access log is kept for a number of days on the server; the texts say it in months. */
const DAYS_PER_MONTH = 365 / 12;
const ACCESS_LOG_MONTHS = Math.round(ACCESS_LOG_RETENTION_DAYS / DAYS_PER_MONTH);

/** Who operates the service and the only channel for questions, complaints and data requests. */
const OPERATOR = "MARCIO PETIGROSSO, empresa brasileira inscrita no CNPJ sob o nº 63.940.273/0001-36";
const CONTACT_EMAIL = "contato@sualive.com.br";

/*
 * TERMOS DE USO E POLÍTICAS DE PRIVACIDADE — LEIA ANTES DE MUDAR O PRODUTO.
 *
 * Os dois textos abaixo descrevem o que o produto faz hoje (entregas 1 a 4) e o que o responsável
 * decidiu em 14/11/2026: operador, contato, foro, reembolso, prazos de guarda e limite de
 * responsabilidade. Toda entrega que mudar algo descrito aqui (dado coletado ou guardado, operador
 * novo, pagamento, moderação, sala pública, denúncia, moeda, envio de arquivo, limite de idade)
 * revisa os dois textos no mesmo PR e muda `TERMS_VERSION` em `@sualive/config`.
 *
 * Prometido no texto e ainda NÃO implementado (pendência de uma próxima entrega):
 * - caixa de entrada do `contato@sualive.com.br`, que depende do domínio (fim do MVP).
 *
 * Os preços em ouro da retransmissão de vídeo e da sala protegida saem da medição de custo
 * (DECISOES.md, "Parâmetros"): quando mudarem em `@sualive/config`, `TERMS_VERSION` muda junto.
 */
const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "O que é o serviço",
    blocks: [
      `O ${APP_NAME} é uma sala de chamada com voz, vídeo, compartilhamento de tela e chat que abre por um link. Dá para criar e entrar em salas sem conta. Quem quiser pode criar uma conta gratuita e, se desejar, assinar o Plus.`,
      `O ${APP_NAME} é operado por ${OPERATOR}.`,
    ],
  },
  {
    title: "Quem pode usar",
    blocks: [
      `O ${APP_NAME} é uma plataforma para maiores de ${MINIMUM_AGE} anos. Quem aceita estes Termos de Uso declara ter ${MINIMUM_AGE} anos ou mais: no primeiro acesso, o aceite e essa declaração são feitos juntos e ficam registrados.`,
      "A conta é criada com o login do Google ou do Discord. Não existe senha própria nem cadastro por e-mail.",
      `Contas e salas usadas por menores de ${MINIMUM_AGE} anos são encerradas assim que identificadas.`,
    ],
  },
  {
    title: "Sua conta",
    blocks: [
      `Você escolhe um @nome único, que pode ser trocado a cada ${HANDLE_CHANGE_INTERVAL_DAYS} dias, e um apelido. A foto vem da conta do Google ou do Discord; não há envio de foto.`,
      "Você responde pelo que faz com a sua conta. Não use @nome ou apelido para se passar por outra pessoa ou para ofender.",
      "Você pode excluir a conta a qualquer momento, pela página do perfil.",
    ],
  },
  {
    title: "Como a sala funciona",
    blocks: [
      `A sala é direta: voz e vídeo trafegam entre os navegadores dos participantes, sem passar por um servidor nosso de mídia, com até ${ROOM_MAX_PEOPLE} pessoas. Por isso os participantes de uma mesma sala direta podem descobrir o endereço IP uns dos outros. Entre apenas em salas de pessoas em quem você confia.`,
      `A voz vai para todos os participantes. Cada vídeo só é enviado a quem escolhe assistir, e cada pessoa assiste até ${WATCHED_VIDEOS_PER_PERSON} vídeos ao mesmo tempo. Sem o Plus, cada pessoa transmite até ${VIDEOS_PER_PERSON} vídeos ao mesmo tempo, em até ${FREE_QUALITY}.`,
      "Quando dois navegadores não conseguem se ligar direto, a conexão entre eles passa por um servidor de retransmissão da Cloudflare. A voz passa pela retransmissão para qualquer pessoa, sem custo para ela.",
      `O vídeo só passa pela retransmissão quando quem transmite assina o Plus e tem ouro. Custa ${RELAY_VIDEO_PRICE} para cada pessoa que assiste por esse caminho, debitado por minuto do ouro de quem transmite, e o vídeo fica limitado a ${RELAY_QUALITY}. Sem o Plus ou sem ouro, o vídeo para naquela conexão e a voz e o chat continuam; os dois lados veem um aviso.`,
      "Não gravamos áudio nem vídeo. O chat existe só enquanto a sala existe e é apagado quando ela acaba. Outros participantes podem gravar ou fotografar a tela por conta própria; não temos como impedir.",
    ],
  },
  {
    title: "Sala protegida",
    blocks: [
      `Na sala protegida, toda a voz e todo o vídeo passam pelo servidor de retransmissão da Cloudflare, e os participantes não recebem o endereço IP uns dos outros. Ela tem ${PROTECTED_ROOM_SIZE}, limitados a ${RELAY_QUALITY}.`,
      "Só quem assina o Plus e tem ouro abre uma sala protegida. O tipo da sala é escolhido ao criar e não muda com a sala em andamento. Na sala de link fixo, o dono liga ou desliga a sala protegida com a sala vazia.",
      `A sala protegida custa ${PROTECTED_ROOM_PRICE}, debitado por minuto do ouro do dono. O preço cobre a voz e o vídeo de todos na sala. Antes de confirmar, o dono vê o preço e quanto tempo o saldo dele cobre.`,
      `O dono é avisado quando o saldo cobre ${PROTECTED_ROOM_WARNINGS} minutos. Quando o saldo zera, a sala espera ${PROTECTED_ROOM_GRACE_MINUTES} minutos; sem recarga nesse tempo, ela é encerrada para todos e não vira sala direta. O saldo nunca fica negativo.`,
      "O ouro gasto nos minutos já usados, de sala protegida ou de vídeo em retransmissão, não volta.",
      "Os preços em ouro do vídeo em retransmissão e da sala protegida acompanham o custo da retransmissão e podem mudar. Quando mudarem, a versão destes Termos de Uso muda junto.",
    ],
  },
  {
    title: "Conduta e moderação",
    blocks: [
      "Não use o serviço para atividade ilegal, assédio, ameaça, conteúdo sexual envolvendo menores, violação de direitos de terceiros ou para prejudicar o funcionamento do serviço.",
      "Quem cria a sala é o dono dela e pode silenciar, remover e banir participantes. O dono pode promover participantes a moderador: o moderador também silencia, remove e bane, mas não age sobre o dono nem sobre outro moderador. Cada dono responde pela moderação da própria sala.",
      "Podemos encerrar salas e contas que violem estes Termos de Uso. Não ter gravação não significa não ter regra: atendemos às ordens das autoridades com os registros que a lei nos manda guardar, descritos nas Políticas de Privacidade.",
    ],
  },
  {
    title: "Plus e pagamento",
    blocks: [
      `O Plus é o único plano pago: ${PLUS_MONTHLY_PRICE} por mês ou ${PLUS_ANNUAL_PRICE} por ano. Ele dá: transmitir acima de ${FREE_QUALITY}, ${PLUS_QUALITY}; ${PLUS_VIDEOS_PER_PERSON} vídeos ao mesmo tempo; vídeo em conexão retransmitida e sala protegida, os dois pagos em ouro; link fixo; tema de sala; selo; e ${PLUS_GOLD} a cada ${PLUS_GOLD_INTERVAL_DAYS} dias de Plus pago.`,
      "O pagamento é só por Pix, processado pela Woovi. O plano mensal usa o Pix Automático e renova sozinho até ser cancelado; o plano anual é um Pix único, vale pelo período pago e não renova sozinho.",
      `Se uma cobrança do plano mensal falhar, tentamos de novo (até ${PLUS_RETRY_ATTEMPTS} vezes em ${PLUS_RETRY_WINDOW_DAYS} dias) e os benefícios continuam durante as tentativas. Você pode cancelar pela página do plano; o Plus vale até o fim do período já pago.`,
      `Quando o Plus acaba, os benefícios cessam e o link fixo fica reservado por ${FIXED_LINK_RESERVE_DAYS} dias.`,
    ],
  },
  {
    title: "Garantia e reembolso",
    blocks: [
      `Você tem ${PLUS_GUARANTEE_DAYS} dias, contados de cada contratação do Plus (mensal ou anual), para desistir e receber de volta o valor integral, sem precisar explicar o motivo.`,
      `O pedido é feito pelo e-mail ${CONTACT_EMAIL}. A devolução é feita por Pix, para a conta que pagou, em até ${REFUND_PAYOUT_BUSINESS_DAYS} dias úteis. Com o reembolso, o Plus e os benefícios acabam na hora.`,
      `Depois dos ${PLUS_GUARANTEE_DAYS} dias não há reembolso: cancelar interrompe as próximas cobranças e o Plus continua valendo até o fim do período já pago.`,
      "Quem tem a conta encerrada por violar estes Termos de Uso perde o Plus sem reembolso, salvo quando a lei determinar o contrário.",
    ],
  },
  {
    title: "Prata, ouro e loja",
    blocks: [
      `Prata e ouro são moedas de uso exclusivo dentro do ${APP_NAME}. A prata se ganha: toda conta recebe ${coins(WELCOME_SILVER, "silver")} de boas-vindas. O ouro se compra por Pix, em pacotes, ou vem com o Plus pago: ${coins(PLUS_GOLD_AMOUNT, "gold")} a cada ${PLUS_GOLD_INTERVAL_DAYS} dias de Plus pago. O Plus recebido de presente não dá ouro.`,
      "A compra de ouro é um Pix único, processado pela Woovi, e pede o CPF, como a assinatura do Plus. O ouro entra na carteira quando o pagamento é confirmado.",
      "O ouro também paga o vídeo em conexão retransmitida e a sala protegida, pelos preços descritos nestes Termos de Uso. Prata não paga nenhum dos dois.",
      "Moeda não vira dinheiro: não existe saque, reembolso em dinheiro nem conversão de ouro em prata. Prata e ouro não expiram.",
      "Os itens da loja (cor do nome, degradê do nome, moldura do avatar e pacotes de reações) têm um preço só, pago com prata ou com ouro, à sua escolha. Item comprado é permanente e pessoal: fica na sua conta e não passa para outra.",
      `Você pode enviar ouro a outra conta, até ${GOLD_DAILY_LIMIT} por dia. O envio não se desfaz. Prata não pode ser enviada.`,
      `Você pode presentear outra conta com ${PLUS_GIFT_DAYS} dias de Plus por ${PLUS_GIFT_PRICE}. Se quem recebe já tem o Plus, os dias somam ao período atual. O Plus de presente não renova, não dá ouro nem o selo de apoiador inicial e acaba sem aviso de vencimento; enquanto ele vale, a conta não assina o Plus pago. Quem está com uma cobrança em atraso e recebe o presente perde os dias ganhos se as novas tentativas de cobrança falharem.`,
      "Excluir a conta apaga o saldo de prata e de ouro e os itens comprados. Uma compra de ouro ainda não paga é apagada junto: um Pix pago depois da exclusão não gera crédito.",
    ],
  },
  {
    title: "Disponibilidade e responsabilidade",
    blocks: [
      "O serviço é oferecido como está. A qualidade da chamada depende da conexão e do equipamento de cada participante, e o serviço pode ficar indisponível.",
      "Não respondemos pelo que os participantes dizem, mostram ou transmitem nas salas, nem por gravações feitas por eles.",
      `Nossa responsabilidade por danos ligados ao serviço fica limitada ao valor que você pagou ao ${APP_NAME} nos ${LIABILITY_WINDOW_MONTHS} meses anteriores ao fato. Esse limite não afasta os direitos que a lei garante ao consumidor nem os casos em que a lei não permite limitar.`,
    ],
  },
  {
    title: "Lei e foro",
    blocks: [
      "Estes Termos de Uso seguem a lei brasileira. Qualquer disputa é resolvida no foro do domicílio do usuário.",
    ],
  },
  {
    title: "Mudanças nestes Termos de Uso",
    blocks: [
      "Quando estes Termos de Uso mudarem, a versão indicada no topo desta página muda junto. Quem tem conta vê, depois do login, uma faixa de aviso no topo do serviço, com a data da mudança e o link para os Termos de Uso atualizados. Continuar usando o serviço depois da mudança vale como aceite da nova versão.",
    ],
  },
  {
    title: "Contato",
    blocks: [`Dúvidas, reclamações e pedidos: ${CONTACT_EMAIL}.`],
  },
];

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "Quem trata os seus dados",
    blocks: [
      `O controlador dos dados é quem opera o ${APP_NAME}: ${OPERATOR}.`,
      `O encarregado pelo tratamento de dados é o próprio operador e atende pelo e-mail ${CONTACT_EMAIL}.`,
    ],
  },
  {
    title: "Sem conta",
    blocks: [
      "Para usar uma sala sem conta você informa só um apelido. Um cookie de sessão guarda um identificador aleatório e esse apelido, para a sala reconhecer você. O navegador também guarda, no seu aparelho, o último apelido usado, a escolha de tema claro ou escuro e, se você criou a sala, o código que identifica você como dono.",
    ],
  },
  {
    title: "Com conta",
    blocks: [
      "A conta é criada pelo login do Google ou do Discord. Não guardamos a sua senha.",
      "Guardamos: o identificador da sua conta no Google ou no Discord (para reconhecer você no próximo login), o e-mail informado pelo Google ou pelo Discord no login, o @nome, o apelido, o endereço da foto do perfil nesses serviços, o registro do aceite dos Termos de Uso (com a versão aceita e a última versão que você viu) e a declaração de que você tem a idade mínima.",
      "O e-mail serve para entrarmos em contato com você e para enviar avisos de cobrança. Não usamos o e-mail para marketing.",
      "Para manter você logado usamos um cookie de sessão, que só o servidor lê.",
    ],
  },
  {
    title: "Dentro da sala",
    blocks: [
      "Na sala direta, voz, vídeo e tela trafegam direto entre os navegadores dos participantes. Para isso funcionar, os navegadores trocam endereços de rede, e os participantes de uma mesma sala direta podem ver o endereço IP uns dos outros. Quando dois navegadores não conseguem se ligar direto, a mídia entre eles passa pelo servidor de retransmissão da Cloudflare, que não guarda o conteúdo.",
      "Na sala protegida, toda a mídia passa pelo servidor de retransmissão da Cloudflare, e os participantes não recebem o endereço IP uns dos outros. O nosso servidor e o de retransmissão continuam recebendo o seu endereço IP.",
      "A credencial de retransmissão que o seu navegador recebe leva um identificador da sua sessão, para medirmos o uso da retransmissão de cada sessão.",
      "Não gravamos áudio nem vídeo. O chat fica guardado só enquanto a sala existe e é apagado quando ela acaba.",
      "O servidor usa o endereço IP para limitar abusos (excesso de tentativas) e para manter um banimento feito pelo dono ou por um moderador, até a sala acabar.",
      "Os cosméticos que você equipa (cor ou degradê do nome, moldura do avatar e reações) e o ouro que você envia a alguém dentro da sala são vistos pelos outros participantes.",
    ],
  },
  {
    title: "Registros de acesso",
    blocks: [
      `Guardamos o registro de acesso ao serviço: a conta ou a sessão, o endereço IP, a data e a hora de cada login e de cada entrada em sala. O registro fica guardado por ${ACCESS_LOG_MONTHS} meses, como manda o Marco Civil da Internet, e depois é apagado.`,
      "Esse registro não inclui o conteúdo das salas e só é entregue a autoridades mediante ordem judicial.",
      "Se você excluir a conta, o registro de acesso continua guardado até o fim desse prazo.",
    ],
  },
  {
    title: "Pagamento",
    blocks: [
      "O Plus e os pacotes de ouro são pagos por Pix, processado pela Woovi. Para gerar a cobrança pedimos o seu CPF. Nós não guardamos o CPF: ele só passa pelo nosso servidor a caminho da Woovi, que processa o Pix.",
      `Guardamos o estado da assinatura (ciclo, período pago, situação) e o registro de cada cobrança, do Plus e das compras de ouro. Os registros de cobrança ficam guardados por ${BILLING_RECORDS_YEARS} anos, para cumprir obrigações fiscais e responder a reclamações, e depois são apagados.`,
    ],
  },
  {
    title: "Carteira e loja",
    blocks: [
      "Guardamos os saldos de prata e de ouro, o extrato de cada movimento (nos presentes, com a outra conta envolvida), os itens que você comprou e os que estão equipados, e o registro das compras de ouro.",
      "O ouro debitado por minuto, pelo vídeo em retransmissão e pela sala protegida, aparece no extrato como qualquer outro movimento.",
    ],
  },
  {
    title: "Por que tratamos os seus dados",
    blocks: [
      "Para prestar o serviço que você pediu (execução de contrato): a sessão, a conta, a sala, a carteira, a loja e a cobrança do Plus e do ouro.",
      "Para cumprir a lei (obrigação legal): os registros de cobrança e os registros de acesso.",
      "Por legítimo interesse: limitar abusos, corrigir falhas e medir o acesso ao site, sem cookies de rastreamento.",
    ],
  },
  {
    title: "Com quem os dados são compartilhados",
    blocks: [
      "Usamos estes operadores, e só eles: Cloudflare (hospedagem do site e do servidor, proteção contra robôs com o Turnstile e estatísticas de acesso com o Web Analytics, que não usa cookies), Sentry (registro de erros do site e do servidor, para corrigirmos falhas) e Woovi (cobrança por Pix).",
      "Google e Discord participam só do login que você escolher. Não vendemos dados e não exibimos anúncios.",
    ],
  },
  {
    title: "Excluir a conta",
    blocks: [
      "Você exclui a conta pela página do perfil. A exclusão apaga os seus dados pessoais: e-mail, @nome, apelido, endereço da foto, vínculo com o Google ou o Discord, aceite dos Termos de Uso e declaração de idade. Registros de cobrança que precisem ser mantidos deixam de estar ligados à conta.",
      "A exclusão apaga também a carteira (saldos e extrato) e os itens comprados e equipados. No extrato de quem trocou presentes com você, o seu @nome deixa de aparecer. As compras de ouro já pagas ficam como registro contábil, sem ligação com a conta, como já acontece com a cobrança do Plus.",
      `O registro de acesso não é apagado com a conta: fica guardado até completar os ${ACCESS_LOG_MONTHS} meses, como descrito em "Registros de acesso".`,
    ],
  },
  {
    title: "Seus direitos",
    blocks: [
      `Você pode pedir confirmação do tratamento, acesso, correção, portabilidade e exclusão dos seus dados, nos termos da Lei Geral de Proteção de Dados, pelo e-mail ${CONTACT_EMAIL}.`,
      "Se o pedido não for atendido, você pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).",
    ],
  },
  {
    title: "Idade mínima",
    blocks: [
      `A conta é só para quem tem ${MINIMUM_AGE} anos ou mais. Quem aceita os Termos de Uso e estas Políticas de Privacidade declara ter ${MINIMUM_AGE} anos ou mais, e guardamos o registro dessa declaração.`,
    ],
  },
  {
    title: "Mudanças nestas Políticas de Privacidade",
    blocks: [
      "Quando estas Políticas de Privacidade mudarem, a versão indicada no topo desta página muda junto. Quem tem conta vê, depois do login, uma faixa de aviso no topo do serviço, com a data da mudança e o link para os Termos de Uso atualizados.",
    ],
  },
];

const TAGLINE =
  "Sala de chamada com compartilhamento de tela que abre por um link, sem cadastro e sem anúncio.";

/** Every user-visible string lives here (pt-BR). Components never hardcode copy. */
export const texts = {
  meta: {
    description: TAGLINE,
  },
  common: {
    you: "você",
    close: "Fechar",
    back: "Voltar",
    cancel: "Cancelar",
    backHome: "Voltar ao início",
    loading: "Carregando…",
    copy: "Copiar",
    copied: "Copiado",
    copyFailed: "Não foi possível copiar. Selecione o texto e copie à mão.",
    save: "Salvar",
    saving: "Salvando…",
    saved: "Salvo.",
    tryAgain: "Tentar de novo",
  },
  nav: {
    label: "Conta",
    home: "Ir para o início",
    /** In the footer of the pages that have no name of the product at the top. */
    homeShort: "Início",
    login: "Entrar",
    plus: "Plus",
    /** The two entries shown to who is logged, beside the way to the profile. */
    walletLabel: "Carteira e loja",
    wallet: "Carteira",
    shop: "Loja",
    profile: (nickname: string) => `Perfil de ${nickname}`,
    footerLabel: "Rodapé",
    terms: "Termos de Uso",
    privacy: "Políticas de Privacidade",
  },
  badges: {
    plus: { name: "Plus", hint: "Assinante do Plus" },
    early_supporter: {
      name: "Apoiador inicial",
      hint: `Apoiador inicial: um dos ${EARLY_SUPPORTER_LIMIT} primeiros assinantes do Plus`,
    },
  },
  account: {
    loadFailed: "Não foi possível consultar a sua conta agora.",
    errors: {
      unauthorized: "A sua sessão acabou. Entre de novo para continuar.",
      handleTaken: "Este @nome já está em uso. Escolha outro.",
      handleReserved: "Este @nome é reservado. Escolha outro.",
      handleChangeTooSoon: `O @nome só pode ser trocado a cada ${HANDLE_CHANGE_INTERVAL_DAYS} dias.`,
      plusRequired: "Este recurso é só para quem assina o Plus.",
      billingUnavailable: "A assinatura do Plus não está disponível agora. Tente de novo mais tarde.",
      alreadySubscribed: "Você já tem uma assinatura do Plus em andamento.",
      invalid: "Os dados enviados foram recusados. Confira e tente de novo.",
      rateLimited: "Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.",
      error: "Algo deu errado. Tente de novo em instantes.",
    },
  },
  handle: {
    label: "Seu @nome",
    prefix: "@",
    display: (handle: string) => `@${handle}`,
    rule: `De ${HANDLE_MIN_LENGTH} a ${HANDLE_MAX_LENGTH} caracteres: letras minúsculas, números e sublinhado.`,
    checking: "Verificando se está livre…",
    available: "Este @nome está livre.",
    taken: "Este @nome já está em uso. Escolha outro.",
    reserved: "Este @nome é reservado. Escolha outro.",
    invalid: `Use de ${HANDLE_MIN_LENGTH} a ${HANDLE_MAX_LENGTH} caracteres: só letras minúsculas, números e sublinhado.`,
    checkFailed: "Não foi possível verificar agora. Você pode tentar concluir mesmo assim.",
  },
  login: {
    title: "Entrar",
    intro: "Acesse sua conta.",
    providers: { google: "Entrar com Google", discord: "Entrar com Discord" },
    /** Beside the name of a provider that is not configured yet: its button stays off. */
    soon: "Em breve",
    failed: "Não foi possível concluir o login. Tente de novo.",
  },
  onboarding: {
    title: "Só falta mais um passo",
    intro: "Escolha seu @nome e aceite os Termos de Uso.",
    /** One sentence, one checkbox: the two links sit inside it. */
    consent: {
      before: `Declaro que sou maior de ${MINIMUM_AGE} anos e aceito os `,
      terms: "Termos de Uso",
      and: " e as ",
      privacy: "Políticas de Privacidade",
      after: ".",
    },
    consentRequired: `Para ter conta é preciso declarar que você é maior de ${MINIMUM_AGE} anos e aceitar os Termos de Uso e as Políticas de Privacidade.`,
    handleHint: `Esse nome é a sua identificação oficial. Pode ser trocado a cada ${HANDLE_CHANGE_INTERVAL_DAYS} dias.`,
    handleRequired: "Escolha um @nome.",
    submit: "Concluir",
    submitting: "Concluindo…",
  },
  profile: {
    title: "Perfil",
    avatarHint: "A foto vem da conta com que você entrou.",
    badgesLabel: "Selos",
    nicknameTitle: "Apelido",
    nicknameLabel: "Seu apelido nas salas",
    nicknameHint: "É o nome que aparece nas salas.",
    nicknameInvalid: `De ${NICKNAME_MIN_LENGTH} a ${NICKNAME_MAX_LENGTH} caracteres.`,
    handleTitle: "@nome",
    handleLabel: "Novo @nome",
    handleLocked: (date: string) =>
      `Você trocou de @nome há pouco. A próxima troca fica disponível em ${date}.`,
    handleChangeHint: `Depois de trocar, a próxima troca só fica disponível em ${HANDLE_CHANGE_INTERVAL_DAYS} dias.`,
    handleSubmit: "Trocar @nome",
    handleSame: "Este já é o seu @nome.",
    /** Discreet text link under the name: the plan has its own page. */
    planLink: "Ver o meu plano",
    plusLink: "Conheça o Plus",
    sessionTitle: "Sessão",
    logout: "Sair da conta",
    loggingOut: "Saindo…",
    deleteTitle: "Excluir a conta",
    deleteExplain:
      "Excluir a conta apaga os seus dados pessoais: @nome, apelido, endereço da foto, o aceite dos Termos de Uso e a declaração de idade. O saldo de prata e de ouro e os itens da loja são apagados junto. O @nome fica livre e o link fixo deixa de existir. Não dá para desfazer.",
    deletePlusWarning:
      "Você tem um Plus em andamento. Excluir a conta encerra os benefícios; se o plano for mensal, cancele a assinatura antes, na página do plano.",
    deleteStart: "Quero excluir a minha conta",
    deleteConfirmLabel: (handle: string) => `Para confirmar, digite @${handle}`,
    deleteConfirm: "Excluir a conta para sempre",
    deleting: "Excluindo…",
  },
  plus: {
    title: "Plus",
    lead: `O ${APP_NAME} oferece plano pago para ajudar no crescimento da plataforma.`,
    benefitsTitle: "O que você ganha ajudando",
    benefits: [
      {
        title: `Qualidade acima de ${FREE_QUALITY_SHORT}`,
        text: `Sua tela e sua câmera em ${PLUS_QUALITY}, em conexão direta.`,
      },
      {
        title: `${PLUS_VIDEOS_PER_PERSON} vídeos ao mesmo tempo`,
        text: `Telas e câmeras juntas. Sem o Plus são ${VIDEOS_PER_PERSON}.`,
      },
      {
        title: "Vídeo em retransmissão",
        text: `Quando a conexão direta não é possível, seu vídeo segue pela retransmissão, em ${RELAY_QUALITY}. Pago em ouro: ${RELAY_VIDEO_PRICE} para cada pessoa que assiste por esse caminho.`,
      },
      {
        title: "Sala protegida",
        text: `Toda a mídia passa pela retransmissão, para esconder o IP de quem participa, com ${PROTECTED_ROOM_SIZE}. Paga em ouro: ${PROTECTED_ROOM_PRICE}.`,
      },
      { title: "Link fixo", text: "Uma sala permanente no endereço do seu @nome." },
      { title: "Tema de sala", text: "Escolha as cores da sua sala entre os temas prontos." },
      { title: "Selo ao lado do nome", text: "Quem está na sala vê que você apoia o projeto." },
    ],
    /** The monthly gold of the paid Plus, said also as time of protected room. */
    gold: {
      title: `${PLUS_GOLD} a cada ${PLUS_GOLD_INTERVAL_DAYS} dias`,
      text: `Vem com o Plus pago e cobre cerca de ${PLUS_GOLD_TIME} de sala protegida. O ouro não expira.`,
    },
    earlySupporter: `Os ${EARLY_SUPPORTER_LIMIT} primeiros assinantes ganham também o selo permanente de apoiador inicial.`,
    cyclesTitle: "Escolha o ciclo",
    cycles: {
      monthly: {
        name: "Mensal",
        per: "por mês",
        /** One entry per bullet of the card. */
        how: ["Pix Automático", "Cobrança recorrente", PLUS_GUARANTEE],
        choose: "Assinar o mensal",
      },
      annual: {
        name: "Anual",
        per: "por ano",
        how: ["Pix QR Code", "Cobrança única", PLUS_GUARANTEE],
        choose: "Assinar o anual",
      },
    },
    /** Beside the name of the annual plan: how much less than twelve months of the monthly plan. */
    annualDiscount: (percent: number) => `${percent}% de desconto`,
    /** Always under the plan cards, centered. */
    paymentsNote: `O pagamento é processado por provedor externo e os dados não são armazenados pela plataforma ${APP_NAME}.`,
    /** For who already has the Plus: the offer page points to the page of the plan. */
    current: { text: "Você já tem o Plus.", link: "Ver o meu plano" },
    loginToSubscribe: "Você entra na sua conta antes de pagar.",
    status: {
      title: "Sua assinatura",
      activeRenews: (cycle: string, date: string) => `Plus ${cycle} ativo. Renova em ${date}.`,
      activeUntil: (cycle: string, date: string) =>
        `Plus ${cycle} ativo. Vale até ${date} e não renova sozinho.`,
      pastDue: `O último pagamento não passou. Estamos tentando de novo (até ${PLUS_RETRY_ATTEMPTS} tentativas em ${PLUS_RETRY_WINDOW_DAYS} dias) e os seus benefícios continuam enquanto isso.`,
      canceled: (date: string) => `Assinatura cancelada. Os benefícios valem até ${date}.`,
      ended: `Seu Plus acabou. O link fixo fica reservado para você por ${FIXED_LINK_RESERVE_DAYS} dias.`,
      cycle: { monthly: "mensal", annual: "anual", gift: "de presente" },
      resubscribeLater: "Você poderá assinar de novo quando o período atual acabar.",
    },
    annualExpiry: (days: number, date: string) =>
      days <= 0
        ? `Seu Plus anual vence hoje (${date}). Ele não renova sozinho.`
        : days === 1
          ? `Seu Plus anual vence amanhã (${date}). Ele não renova sozinho.`
          : `Seu Plus anual vence em ${days} dias (${date}). Ele não renova sozinho.`,
    cancel: {
      start: "Cancelar a assinatura",
      explain: (date: string) =>
        `Cancelando, não haverá novas cobranças e o Plus continua valendo até ${date}, o fim do período já pago.`,
      confirm: "Confirmar o cancelamento",
      canceling: "Cancelando…",
      keep: "Manter a assinatura",
    },
    checkout: {
      title: (cycle: string) => `Assinar o Plus ${cycle}`,
      cpfLabel: "CPF",
      cpfPlaceholder: "000.000.000-00",
      /** The only line under the field. */
      cpfWhy: "O CPF é exigido pelo provedor para gerar a cobrança por Pix.",
      cpfInvalid: "CPF inválido. Confira os números.",
      submit: "Gerar o QR Code",
      submitting: "Gerando a cobrança…",
      back: "Escolher outro ciclo",
      qrTitle: "Pague com Pix",
      qrAlt: "QR Code do Pix",
      qrHow: {
        monthly:
          "Abra o app do seu banco, leia o QR Code e autorize o Pix Automático. O primeiro mês é pago na hora.",
        annual: "Abra o app do seu banco e leia o QR Code, ou use o Pix copia e cola.",
      },
      brCodeLabel: "Pix copia e cola",
      amount: "Valor",
      expiresAt: "Válido até",
      pending: "Aguardando o pagamento…",
      paidTitle: "Pagamento confirmado",
      paid: `Seu Plus está ativo. Você já transmite em ${PLUS_QUALITY}, pode ligar ${PLUS_VIDEOS_PER_PERSON} vídeos ao mesmo tempo e abrir sala protegida, e tem o link fixo no seu @nome, o tema de sala e o selo.`,
      paidAction: "Ver o meu plano",
      expired: "O QR Code venceu antes do pagamento.",
      failed: "O pagamento não foi concluído.",
      retry: "Gerar outro QR Code",
    },
  },
  plan: {
    title: "Seu plano",
    badgesLabel: "Selos do plano",
    details: {
      state: "Situação",
      states: { active: "Ativo", past_due: "Em atraso", canceled: "Cancelado", ended: "Encerrado" },
      cycle: "Ciclo",
      giftCycle: "Presente",
      renewsOn: "Renova em",
      validUntil: "Vale até",
    },
    fixedLinkTitle: "Seu link fixo",
    fixedLinkHint: "Uma sala permanente no seu @nome. Ela não expira quando esvazia.",
    fixedLinkLabel: "Endereço do seu link fixo",
    fixedLinkOpen: "Abrir a sala",
    /** The fixed-link room as a protected room: turned on and off by its owner, with the room empty. */
    fixedProtected: {
      title: "Sala protegida no link fixo",
      about: `Ligada, a sala do seu link fixo abre como sala protegida: toda a mídia passa pela retransmissão, para esconder o IP de quem participa, com ${PROTECTED_ROOM_SIZE}.`,
      price: `Custa ${PROTECTED_ROOM_PRICE}, debitado do seu ouro por minuto.`,
      rule: "Só dá para ligar ou desligar com a sala vazia.",
      state: { on: "Sala protegida ligada.", off: "Sala protegida desligada." },
      turnOn: "Ligar a sala protegida",
      turnOff: "Desligar a sala protegida",
      roomInUse:
        "Tem gente na sala do seu link fixo. Espere a sala esvaziar para ligar ou desligar a sala protegida.",
      walletLink: "Ver o meu ouro",
    },
  },
  welcome: {
    title: (nickname: string) => `Boas-vindas, ${nickname}!`,
    ready: (handle: string) => `Sua conta está pronta. Seu @nome é @${handle}.`,
    /** One sentence: only the middle part is the link. */
    manifesto: {
      before: "Quer saber por que este lugar existe? ",
      link: "Leia o nosso manifesto",
      after: ".",
    },
    plansOpen: "Conhecer o Plus",
    plans: {
      title: "O que o Plus oferece",
      benefits: (fixedLinkPath: string) => [
        `Qualidade acima de ${FREE_QUALITY_SHORT}, ${PLUS_QUALITY}`,
        `${PLUS_VIDEOS_PER_PERSON} vídeos ao mesmo tempo`,
        "Vídeo em retransmissão e sala protegida, pagos em ouro",
        `${PLUS_GOLD} a cada ${PLUS_GOLD_INTERVAL_DAYS} dias: cerca de ${PLUS_GOLD_TIME} de sala protegida`,
        `Link fixo em ${fixedLinkPath}`,
        "Tema de sala",
        "Selo ao lado do nome",
      ],
      action: "Conhecer os planos",
    },
    home: "Ir para o início",
  },
  legal: {
    version: (version: string) => `Versão de ${version}`,
    pendingLabel: "Pendente de preenchimento pelo responsável:",
    terms: { title: "Termos de Uso", sections: TERMS_SECTIONS },
    privacy: { title: "Políticas de Privacidade", sections: PRIVACY_SECTIONS },
  },
  /** Notice at the top after the legal texts change: the date, `before`, the link and `after`. */
  termsBanner: {
    label: "Aviso sobre os Termos de Uso",
    before: ": atualizamos os ",
    link: "Termos de Uso",
    after: ". Continuar usando o serviço vale como aceite.",
    close: "Fechar aviso",
    /** What the close button shows: only the letter. */
    closeMark: "x",
  },
  wallet: {
    title: "Carteira",
    loadFailed: "Não foi possível carregar a sua carteira agora.",
    /** "990 de ouro": an amount with its currency. */
    amount: coins,
    balances: {
      title: "Seus saldos",
      names: { silver: "Prata", gold: "Ouro" },
      about: {
        silver: "A prata você ganha, não compra. Ela só compra cosméticos da loja.",
        gold: "O ouro você compra por Pix ou recebe com o Plus pago. Ele compra cosméticos, paga a sala protegida e o vídeo em retransmissão e pode ser enviado de presente.",
      },
      /** Under the gold balance: the same balance as time ("1 h 30 min") of protected room. */
      protectedTime: (time: string) => `Cerca de ${time} de sala protegida`,
      shopLink: "Ir para a loja",
    },
    ledger: {
      title: "Extrato",
      loading: "Carregando o extrato…",
      empty: "Nenhum movimento ainda.",
      failed: "Não foi possível carregar o extrato.",
      more: "Carregar mais",
      loadingMore: "Carregando…",
      /** In place of the @handle of the other account of a gift, when it no longer exists. */
      deletedAccount: "conta excluída",
      /** A movement as it was signed: "+300 de prata", "−100 de ouro". */
      amount: (signed: string, currency: Currency) => `${signed} de ${CURRENCY_NAMES[currency]}`,
      reasons: {
        welcome: "Prata de boas-vindas",
        plus_gold: "Ouro do Plus",
        gold_purchase: "Compra de ouro",
        relay_video: "Vídeo em retransmissão",
        protected_room: "Sala protegida",
        shop_purchase: (item: string | null) => (item ? `Compra na loja: ${item}` : "Compra na loja"),
        gift_sent: (who: string) => `Ouro enviado para ${who}`,
        gift_received: (who: string) => `Ouro recebido de ${who}`,
        plus_gift: (who: string) => `Plus de presente para ${who}`,
      },
    },
    buy: {
      title: "Comprar ouro",
      intro: "Pagamento único por Pix. O ouro entra na carteira quando o pagamento é confirmado.",
      choose: "Comprar",
      /** Accessible name of the button of a pack: "Comprar 990 de ouro por R$ 9,90". */
      chooseLabel: (gold: string, price: string) => `Comprar ${gold} por ${price}`,
      checkoutTitle: (gold: string) => `Comprar ${gold}`,
      back: "Escolher outro pacote",
      qrHow: "Abra o app do seu banco e leia o QR Code, ou use o Pix copia e cola.",
      paidTitle: "Pagamento confirmado",
      paid: (gold: string) => `Pagamento confirmado: ${gold} creditados na sua carteira.`,
      paidAction: "Concluir",
      unavailable: "A compra de ouro não está disponível agora. Tente de novo mais tarde.",
    },
    send: {
      title: "Enviar ouro",
      intro: "Envie ouro a outra conta pelo @nome. Prata não pode ser enviada.",
      sentToday: (sent: string, limit: string) => `Enviado hoje: ${sent} de ${limit} de ouro.`,
      handleLabel: "@nome de quem recebe o ouro",
      amountLabel: "Quanto ouro enviar",
      submit: "Enviar ouro",
      confirmText: (amount: string, handle: string) =>
        `Enviar ${amount} para @${handle}? O envio não se desfaz.`,
      confirm: "Confirmar o envio",
      sending: "Enviando…",
      done: (amount: string, handle: string) => `Você enviou ${amount} para @${handle}.`,
    },
    giftPlus: {
      title: "Presentear Plus",
      intro: `Dê ${PLUS_GIFT_DAYS} dias de Plus a outra conta por ${PLUS_GIFT_PRICE}. Se a pessoa já tem o Plus, os dias somam ao período atual. O Plus de presente não renova.`,
      handleLabel: "@nome de quem recebe o Plus",
      submit: "Presentear Plus",
      confirmText: (handle: string) =>
        `Presentear @${handle} com ${PLUS_GIFT_DAYS} dias de Plus por ${PLUS_GIFT_PRICE}? O presente não se desfaz.`,
      confirm: "Confirmar o presente",
      sending: "Presenteando…",
      done: (handle: string) => `@${handle} recebeu ${PLUS_GIFT_DAYS} dias de Plus.`,
    },
    handlePlaceholder: "@nome",
    handleInvalid: "Informe o @nome de quem vai receber.",
    amountInvalid: "Informe um valor inteiro, a partir de 1.",
    /** Always at the foot of the wallet. */
    notice:
      "Prata e ouro não viram dinheiro: não há saque, reembolso em dinheiro nem troca de ouro por prata.",
    errors: {
      unauthorized: "A sua sessão acabou. Entre de novo para continuar.",
      insufficientFunds: "Saldo insuficiente.",
      dailyLimit: `Esse envio passa do limite diário de ${GOLD_DAILY_LIMIT}.`,
      recipientNotFound: "Não existe conta com esse @nome.",
      selfGift: "Não dá para presentear a própria conta.",
      alreadyOwned: "Você já tem este item.",
      notOwned: "Este item ainda não é seu.",
      notFound: "Não encontramos o que você pediu. Atualize a página e tente de novo.",
      billingUnavailable: "A compra de ouro não está disponível agora. Tente de novo mais tarde.",
      invalid: "Os dados enviados foram recusados. Confira e tente de novo.",
      rateLimited: "Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.",
      error: "Algo deu errado. Tente de novo em instantes.",
    },
  },
  shop: {
    title: "Loja",
    lead: "Cosméticos para o seu nome, o seu avatar e as suas reações. O que você compra é seu para sempre.",
    loadFailed: "Não foi possível carregar a loja agora.",
    empty: "A loja está vazia agora.",
    balancesLabel: "Seus saldos",
    walletLink: "Ver a carteira",
    groups: {
      name_color: "Cores do nome",
      name_gradient: "Degradês do nome",
      avatar_frame: "Molduras do avatar",
      reaction_pack: "Pacotes de reações",
    },
    /** The price is one; the person picks the currency when buying. */
    price: (value: string) => `${value} de prata ou de ouro`,
    previewLabel: (name: string) => `Pré-visualização de ${name}`,
    buy: "Comprar",
    buyLabel: (name: string) => `Comprar ${name}`,
    confirmText: (name: string, price: string) => `Comprar ${name} por ${price}? Escolha como pagar.`,
    payWith: { silver: "Pagar com prata", gold: "Pagar com ouro" },
    buying: "Comprando…",
    owned: "Comprado",
    equipped: "Equipado",
    equip: "Equipar",
    equipLabel: (name: string) => `Equipar ${name}`,
    unequip: "Desequipar",
    unequipLabel: (name: string) => `Desequipar ${name}`,
    insufficientLink: "Ir para a carteira",
  },
  turnstile: {
    failed: "Não foi possível concluir a verificação contra robôs.",
    retry: "Tentar a verificação de novo",
    checking: "Verificando…",
  },
  home: {
    title: APP_NAME,
    /** One entry per line: the break between them is part of the copy. */
    tagline: ["Compartilhe sua tela em dois cliques.", "Sem cadastro e sem anúncio."],
    create: "Criar sala",
    creating: "Criando a sala…",
    hint: "Voz, tela, webcam e chat.",
    /** Visitor: plain line right under the create button, only the last word is the link. */
    account: { question: "Já tem conta?", login: "Entrar" },
    manifesto: {
      title: "Nosso manifesto",
      action: "Saiba mais",
    },
    /** Only who has the Plus opens one: what it is, the price and the time the balance pays for. */
    protectedRoom: {
      open: "Criar sala protegida",
      title: "Sala protegida",
      about: `Toda a voz e todo o vídeo passam pela retransmissão, para esconder o IP de quem participa. Tem ${PROTECTED_ROOM_SIZE}.`,
      price: `Custa ${PROTECTED_ROOM_PRICE}, debitado do seu ouro por minuto.`,
      /** `gold` is "750 de ouro" and `time` is "1 h 30 min". */
      balance: (gold: string, time: string) => `Seu saldo de ${gold} cobre cerca de ${time}.`,
      balanceEmpty: "Seu saldo de ouro não cobre nenhum minuto de sala protegida.",
      balanceLoading: "Carregando o seu saldo…",
      balanceFailed: "Não foi possível carregar o seu saldo.",
      rule: "O tipo da sala não muda depois de criada. Se o ouro acabar, a sala avisa e encerra para todos.",
      confirm: "Confirmar e criar",
      walletLink: "Ir para a carteira",
      /** For an account without the Plus: one plain line, only the last part is the link. */
      plusOnly: { text: "A sala protegida é do Plus.", link: "Conheça o Plus" },
    },
    errors: {
      turnstileFailed:
        "A verificação contra robôs não passou. Refaça a verificação e tente criar a sala de novo.",
      rateLimited: "Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.",
      error: "Não foi possível criar a sala agora. Tente de novo em instantes.",
      plusRequired: "A sala protegida é só para quem assina o Plus.",
      insufficientFunds: "Seu ouro não é suficiente para abrir a sala protegida.",
      protectedUnavailable: "A sala protegida não está disponível agora. Tente de novo mais tarde.",
      unauthorized: "A sua sessão acabou. Entre de novo para criar a sala protegida.",
    },
  },
  manifesto: {
    /** Browser tab title while the page is open. */
    pageTitle: `Manifesto · ${APP_NAME}`,
    title: "Tela compartilhada é companhia.",
    /**
     * One entry per paragraph. When reporting exists in the product, the last paragraph ends with
     * " E quem vê algo errado pode denunciar." (see MANIFESTO.md).
     */
    paragraphs: [
      "A gente acredita que dividir a tela é uma forma de estar junto. Quem mostra, convida. Quem assiste, faz companhia.",
      "Em agosto de 2026, uma decisão oficial suspendeu o vídeo e o compartilhamento de tela do Discord no Brasil. A medida veio depois de casos graves envolvendo menores. Proteger crianças e adolescentes é dever de toda plataforma, inclusive desta.",
      "Com a suspensão, interrompeu-se um hábito de muita gente: o filme visto a dois em cidades diferentes, a partida acompanhada pelos amigos, o trabalho mostrado a quem pediu para ver.",
      `A gente fez o ${APP_NAME} para que esses encontros continuem: um lugar simples, com regras claras, onde quem cria a sala cuida dela.`,
    ],
    closing: "A gente só quer se divertir junto.",
    ageNotice: `O ${APP_NAME} é uma plataforma para maiores de ${MINIMUM_AGE} anos.`,
  },
  lobby: {
    title: "Entrar na sala",
    nicknameLabel: "Seu apelido",
    nicknamePlaceholder: "Como quer ser chamado",
    /** Shown only while the nickname is outside the accepted length. */
    nicknameInvalid: `De ${NICKNAME_MIN_LENGTH} a ${NICKNAME_MAX_LENGTH} caracteres.`,
    previewTitle: "Prévia de câmera e microfone",
    previewStart: "Testar câmera e microfone",
    previewStarting: "Pedindo permissão…",
    previewCameraLabel: "Prévia da sua câmera",
    previewNoCamera: "Câmera indisponível ou sem permissão.",
    previewNoMicrophone: "Microfone indisponível ou sem permissão.",
    previewUnavailable:
      "Não foi possível acessar a câmera nem o microfone. Você pode entrar mesmo assim e só assistir.",
    micLevelLabel: "Nível do microfone",
    mutedHint: "Você entra com o microfone mudo e liga quando quiser.",
    joiningAs: "Entrando como",
    loginLink: "Entrar com sua conta",
    join: "Entrar",
    joining: "Entrando na sala…",
  },
  room: {
    loading: "Abrindo a sala…",
    reconnecting: "A conexão caiu. Reconectando…",
    codeLabel: "Código da sala:",
    fixedLabel: "Sala de link fixo de",
    /** Between the name of the product and the room, in the header: "sualive / abc123". */
    breadcrumbSeparator: "/",
    roomTheme: {
      open: "Tema da sala",
      label: "Tema da sala, para todos",
      names: ROOM_THEME_NAMES,
    },
    themeToDark: "Usar o tema escuro",
    themeToLight: "Usar o tema claro",
    occupancy: (participants: number, capacity: number) => `${participants}/${capacity}`,
    occupancyLabel: (participants: number, capacity: number) =>
      `${participants} de ${capacity} pessoas na sala`,
    tabs: {
      label: "Painel da sala",
      chat: "Chat",
      people: (count: number) => `Pessoas (${count})`,
      unread: "novas mensagens",
    },
    /** Read after a link that opens in another tab, so the call goes on. */
    newTab: "(abre em outra aba)",
  },
  roomEnd: {
    ended: {
      title: "Esta sala acabou",
      message: "A sala foi encerrada ou o link nunca existiu. Você pode criar outra em um clique.",
      action: "Criar outra sala",
    },
    /** The protected room that ended because the gold of its owner ran out (`endReason: "no_gold"`). */
    endedNoGold: {
      title: "A sala protegida encerrou",
      message:
        "A sala protegida encerrou porque o saldo do dono acabou. Ela não continua como sala direta, para não expor o IP de ninguém.",
    },
    full: {
      title: "Sala cheia",
      /** `capacity`: how many people this room holds, as the server said. */
      message: (capacity: number, isProtected: boolean) =>
        `Esta sala já tem ${capacity} pessoas, o máximo da sala ${isProtected ? "protegida" : "direta"}. Tente de novo quando alguém sair.`,
      action: "Tentar de novo",
    },
    banned: {
      title: "Você foi banido desta sala",
      message: "O dono ou um moderador da sala bloqueou a sua entrada até a sala acabar.",
    },
    kicked: {
      title: "Você foi removido da sala",
      message: "O dono ou um moderador da sala removeu você. Se quiser, pode tentar entrar de novo.",
      action: "Entrar de novo",
    },
    replaced: {
      title: "Você abriu esta sala em outra aba",
      message: "A sala continua aberta na outra aba. Para voltar a usá-la aqui, é só um clique.",
      action: "Usar esta aba",
    },
    error: {
      title: "Algo deu errado na sala",
      message: "Tivemos um problema inesperado. Tente abrir a sala de novo.",
      action: "Tentar de novo",
    },
  },
  stage: {
    label: "Palco de vídeo",
    empty: "Ninguém está transmitindo vídeo",
    emptyHint: "Ligue a câmera ou compartilhe a tela para aparecer aqui.",
    waiting: "Carregando o vídeo…",
    kind: { screen: "tela", camera: "câmera" },
    videoLabel: (nickname: string, kind: "screen" | "camera", isLocal: boolean) =>
      `${nickname}${isLocal ? " (você)" : ""} · ${kind === "screen" ? "tela" : "câmera"}`,
    feature: (nickname: string, kind: "screen" | "camera") =>
      `Destacar ${kind === "screen" ? "a tela" : "a câmera"} de ${nickname}`,
    thumbnails: "Outros vídeos",
    unknownPerson: "Participante",
    speaking: "falando",
    /** Video on demand: the cards of the videos the person is not watching, and the way out of one. */
    watch: {
      listLabel: "Vídeos para assistir",
      count: (watched: number, max: number) => `Você assiste ${watched} de ${max} vídeos`,
      limit: (max: number) =>
        `Você já assiste ${max} vídeos, o máximo ao mesmo tempo. Pare de assistir um deles para abrir outro.`,
      kind: { screen: "Tela", camera: "Câmera" },
      action: "Assistir",
      actionLabel: (nickname: string, kind: "screen" | "camera") =>
        `Assistir ${kind === "screen" ? "a tela" : "a câmera"} de ${nickname}`,
      requesting: "Abrindo o vídeo…",
      /** On the stage of who watches nothing, while there are videos to pick. */
      none: "Você não assiste nenhum vídeo",
      noneHint: "Escolha um dos vídeos da sala para assistir.",
      blocked: {
        relay_no_plus:
          "Sem vídeo: a conexão entre vocês passa pela retransmissão, e para enviar vídeo por ela quem transmite precisa do Plus. A voz continua.",
        relay_no_gold:
          "Sem vídeo: a conexão entre vocês passa pela retransmissão, e quem transmite está sem ouro para pagar por ela. A voz continua.",
      },
      stop: "Parar de assistir",
      stopLabel: (nickname: string, kind: "screen" | "camera") =>
        `Parar de assistir ${kind === "screen" ? "a tela" : "a câmera"} de ${nickname}`,
    },
    /** For who transmits: who watches each own video and what the relay costs or blocks. */
    broadcast: {
      label: "Sobre o que você transmite",
      viewers: (count: number) =>
        count === 0 ? "Ninguém assiste" : count === 1 ? "1 pessoa assiste" : `${count} pessoas assistem`,
      viewersLabel: (count: number, kind: "screen" | "camera") =>
        `${count === 0 ? "Ninguém assiste" : count === 1 ? "1 pessoa assiste" : `${count} pessoas assistem`} ${
          kind === "screen" ? "a sua tela" : "a sua câmera"
        }`,
      /** `names` arrives joined ("Ana e Bia"); `count` is how many people it names. */
      blocked: {
        relay_no_plus: (names: string, count: number, kind: "screen" | "camera") =>
          `${names} ${count === 1 ? "não recebe" : "não recebem"} ${
            kind === "screen" ? "a sua tela" : "a sua câmera"
          }: a conexão passa pela retransmissão, e o vídeo por ela é um recurso do Plus. A voz continua.`,
        relay_no_gold: (names: string, count: number, kind: "screen" | "camera") =>
          `${names} ${count === 1 ? "não recebe" : "não recebem"} ${
            kind === "screen" ? "a sua tela" : "a sua câmera"
          }: a conexão passa pela retransmissão, que é paga em ouro, e o seu ouro acabou. A voz continua.`,
      },
      plusLink: "Conheça o Plus",
      walletLink: "Abrir a carteira",
      /** `perPair` and `total` arrive already formatted ("45"). A pair = one own video to one person. */
      relayPaying: (pairs: number, perPair: string, total: string) =>
        pairs === 1
          ? `Retransmissão paga: 1 par de vídeo (um vídeo seu para uma pessoa que o recebe por retransmissão), a ${perPair} de ouro por hora.`
          : `Retransmissão paga: ${pairs} pares de vídeo (cada vídeo seu para cada pessoa que o recebe por retransmissão), a ${perPair} de ouro por hora por par: ${total} de ouro por hora no total.`,
      relayNoGold:
        "Seu ouro acabou: o seu vídeo parou para quem o recebia por retransmissão. A voz continua.",
    },
  },
  people: {
    label: "Pessoas na sala",
    owner: "dono",
    moderator: "moderador",
    promote: "Tornar moderador",
    demote: "Tirar de moderador",
    /** "Ana", "Ana e Bia", "Ana, Bia e Caio". */
    names: (names: readonly string[]) =>
      names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`,
    micMuted: "microfone mudo",
    micOn: "microfone ligado",
    handRaised: "mão levantada",
    speaking: "falando agora",
    connection: {
      connecting: "conectando…",
      connected: "",
      reconnecting: "reconectando…",
      failed: "sem conexão",
    },
    relayed: "conexão retransmitida",
    moderate: (nickname: string) => `Moderar ${nickname}`,
    mute: "Silenciar",
    kick: "Remover",
    ban: "Banir",
    confirmKick: (nickname: string) => `Remover ${nickname} da sala? A pessoa pode entrar de novo pelo link.`,
    confirmBan: (nickname: string) => `Banir ${nickname}? A pessoa não volta até a sala acabar.`,
    confirmKickAction: "Remover",
    confirmBanAction: "Banir",
  },
  /** Sending gold to someone in the room. Amounts arrive already formatted ("1.000"). */
  gifts: {
    send: (nickname: string) => `Enviar ouro para ${nickname}`,
    amountLabel: "Valor em ouro",
    balance: (gold: string) => `Seu saldo: ${gold} de ouro`,
    remainingToday: (gold: string) => `Hoje você ainda pode enviar ${gold} de ouro`,
    walletLoading: "Carregando o seu saldo…",
    walletError: "Não foi possível carregar o seu saldo.",
    next: "Continuar",
    confirmQuestion: (gold: string, nickname: string) => `Enviar ${gold} de ouro para ${nickname}?`,
    confirm: "Confirmar envio",
    sending: "Enviando…",
    sent: (gold: string, nickname: string) => `Você enviou ${gold} de ouro para ${nickname}.`,
    /** Seen by everyone in the room. */
    notice: (from: string, gold: string, to: string) => `${from} enviou ${gold} de ouro para ${to}`,
    invalidAmount: (max: string) => `Digite um valor inteiro de 1 a ${max}.`,
    errors: {
      insufficient_funds: "Você não tem ouro suficiente para este envio.",
      daily_limit: "Este envio passa do seu limite de ouro enviado por dia.",
      not_allowed: "Não dá para enviar ouro a esta pessoa.",
      not_found: "Esta pessoa não está mais na sala.",
      error: "Não foi possível enviar o ouro. Tente de novo.",
      lost: "Não deu para confirmar o envio. Confira o extrato da sua carteira antes de tentar de novo.",
    },
  },
  /** The protected room: what it is and how long the gold of its owner still covers. */
  protectedRoom: {
    badge: "Sala protegida",
    /** Name of the badge as a button: it opens the explanation. */
    about: "Sala protegida: o que significa",
    explanation: (capacity: number, maxVideos: number) =>
      `A mídia passa pela retransmissão, e os participantes não veem o IP uns dos outros. Até ${capacity} pessoas e ${maxVideos} vídeos ao mesmo tempo.`,
    /** A stretch of time, rounded: "menos de 1 min", "cerca de 42 min", "cerca de 1 h 20 min". */
    duration: (hours: number, minutes: number) =>
      hours === 0 && minutes === 0
        ? "menos de 1 min"
        : `cerca de ${[hours > 0 ? `${hours} h` : "", minutes > 0 ? `${minutes} min` : ""].filter(Boolean).join(" ")}`,
    /** Followed by the duration: "O saldo do dono cobre cerca de 42 min". */
    remainingLead: "O saldo do dono cobre",
    warning: (duration: string) =>
      `O saldo do dono está acabando: cobre ${duration} de sala protegida. Sem recarga, a sala encerra para todos.`,
    grace: "O saldo do dono acabou. Sem recarga, a sala protegida encerra para todos em",
    graceTimerLabel: "Tempo até a sala encerrar",
    ownerWallet: "Recarregar na carteira",
    sendToOwner: "Enviar ouro ao dono",
    giftHint: "Quem tem conta pode enviar ouro ao dono pela lista de pessoas.",
  },
  controls: {
    label: "Controles da sala",
    micOn: "Ligar microfone",
    micOff: "Silenciar microfone",
    micShort: "Microfone",
    cameraOn: "Ligar câmera",
    cameraOff: "Parar câmera",
    cameraShort: "Câmera",
    screenOn: "Compartilhar tela",
    screenOff: "Parar de compartilhar a tela",
    screenShort: "Tela",
    handRaise: "Levantar a mão",
    handLower: "Baixar a mão",
    handShort: "Mão",
    reactions: "Reações",
    reactionsShort: "Reagir",
    react: (reaction: string) => `Reagir com ${reaction}`,
    copyLink: "Copiar o link da sala",
    copyShort: "Copiar link",
    leave: "Sair da sala",
    /** Asked before leaving; the answers are `confirm` and the common "cancel". */
    leaveConfirm: { question: "Quer realmente sair da sala?", confirm: "Sair" },
    /** At the right of the actions: both open in another tab, so the call goes on. */
    accountLabel: "Conta e plano",
    profile: "Abrir o seu perfil em outra aba",
    planShort: "Plus",
    plan: "Plus: abrir o seu plano em outra aba",
    plusOfferShort: "Conheça o Plus",
    plusOffer: "Conheça o Plus (abre em outra aba)",
  },
  chat: {
    label: "Mensagens do chat",
    empty: "Nenhuma mensagem ainda. Diga oi!",
    inputLabel: "Mensagem",
    placeholder: "Escreva uma mensagem",
    send: "Enviar mensagem",
    newMessages: "Novas mensagens",
    counter: (length: number, max: number) => `${length}/${max}`,
    limitReached: (max: number) => `Limite de ${max} caracteres atingido.`,
  },
  notices: {
    dismiss: "Dispensar aviso",
    /** Only the protected room has a ceiling of videos; `max` is the one the server sent. */
    videoRoomLimit: (max: number) =>
      `A sala protegida já tem ${max} vídeos ao mesmo tempo, o máximo. Espere alguém parar para transmitir.`,
    watchLimit: (max: number) =>
      `Você já assiste ${max} vídeos, o máximo ao mesmo tempo. Pare de assistir um deles para abrir outro.`,
    videoPersonLimit: `Você já transmite ${VIDEOS_PER_PERSON} vídeo, o máximo por pessoa. Pare o vídeo atual antes de iniciar outro.`,
    chatRateLimited: "Você enviou mensagens rápido demais. Espere alguns segundos.",
    mutedByOwner: "O dono ou um moderador da sala silenciou o seu microfone.",
    mediaPermissionDenied: {
      microphone: "O navegador não liberou o microfone. Autorize o acesso nas permissões do site.",
      camera: "O navegador não liberou a câmera. Autorize o acesso nas permissões do site.",
      screen: "O compartilhamento de tela foi cancelado ou não foi autorizado.",
    },
    turnstileFailed: "A verificação contra robôs não passou. Refaça a verificação e tente de novo.",
    rateLimited: "Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.",
    /** Inside the room: reactions, raising the hand and the microphone switched too fast. */
    roomRateLimited: "Você está fazendo isso rápido demais. Espere alguns segundos e tente de novo.",
    videoPersonLimitPlus: `Você já transmite ${PLUS_VIDEOS_PER_PERSON} vídeos, o máximo por pessoa. Pare um deles antes de iniciar outro.`,
    linkCopied: "Link da sala copiado.",
  },
  error: {
    notFound: {
      title: "Página não encontrada",
      message: "O endereço que você abriu não existe ou mudou de lugar.",
    },
    crash: {
      title: "Algo deu errado",
      message: "Tivemos um problema ao mostrar esta página. Tente de novo em instantes.",
    },
    backHome: "Voltar ao início",
  },
} as const;
