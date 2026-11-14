import {
  APP_NAME,
  EARLY_SUPPORTER_LIMIT,
  FIXED_LINK_RESERVE_DAYS,
  HANDLE_CHANGE_INTERVAL_DAYS,
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  MINIMUM_AGE,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  PLUS_RETRY_ATTEMPTS,
  PLUS_RETRY_WINDOW_DAYS,
  PLUS_VIDEO_QUALITY,
  PLUS_VIDEOS_PER_PERSON,
  ROOM_MAX_PEOPLE,
  ROOM_MAX_VIDEOS,
  VIDEOS_PER_PERSON,
} from "@sualive/config";
import type { RoomTheme } from "@sualive/config";

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

const PLUS_QUALITY = `${PLUS_VIDEO_QUALITY.height}p a ${PLUS_VIDEO_QUALITY.frameRate} fps`;

/**
 * Numbers that only the legal pages state. Not parameters of `@sualive/config` yet: nothing on the
 * server reads them.
 */
const REFUND_PAYOUT_BUSINESS_DAYS = 7;
const BILLING_RECORDS_YEARS = 5;
const ACCESS_LOG_MONTHS = 6;
const LIABILITY_WINDOW_MONTHS = 12;

/** Who operates the service and the only channel for questions, complaints and data requests. */
const OPERATOR = "MARCIO PETIGROSSO, empresa brasileira inscrita no CNPJ sob o nº 63.940.273/0001-36";
const CONTACT_EMAIL = "contato@sualive.com.br";

/*
 * TERMOS DE USO E POLÍTICAS DE PRIVACIDADE — LEIA ANTES DE MUDAR O PRODUTO.
 *
 * Os dois textos abaixo descrevem o que o produto faz hoje (entregas 1 e 2) e o que o responsável
 * decidiu em 14/11/2026: operador, contato, foro, reembolso, prazos de guarda e limite de
 * responsabilidade. Toda entrega que mudar algo descrito aqui (dado coletado ou guardado, operador
 * novo, pagamento, moderação, sala pública, denúncia, moeda, envio de arquivo, limite de idade)
 * revisa os dois textos no mesmo PR e muda `TERMS_VERSION` em `@sualive/config`.
 *
 * Prometido no texto e ainda NÃO implementado (pendência de uma próxima entrega):
 * - guarda do registro de acesso (IP, data e hora) por 6 meses, seção "Registros de acesso";
 * - caixa de entrada do `contato@sualive.com.br`, que depende do domínio (fim do MVP).
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
      `A sala é direta: voz e vídeo trafegam entre os navegadores dos participantes, sem passar por um servidor nosso de mídia, com até ${ROOM_MAX_PEOPLE} pessoas. Por isso os participantes de uma mesma sala podem descobrir o endereço IP uns dos outros. Entre apenas em salas de pessoas em quem você confia.`,
      "Não gravamos áudio nem vídeo. O chat existe só enquanto a sala existe e é apagado quando ela acaba. Outros participantes podem gravar ou fotografar a tela por conta própria; não temos como impedir.",
    ],
  },
  {
    title: "Conduta e moderação",
    blocks: [
      "Não use o serviço para atividade ilegal, assédio, ameaça, conteúdo sexual envolvendo menores, violação de direitos de terceiros ou para prejudicar o funcionamento do serviço.",
      "Quem cria a sala é o dono dela e pode silenciar, remover e banir participantes. Cada dono responde pela moderação da própria sala.",
      "Podemos encerrar salas e contas que violem estes Termos de Uso. Não ter gravação não significa não ter regra: atendemos às ordens das autoridades com os registros que a lei nos manda guardar, descritos nas Políticas de Privacidade.",
    ],
  },
  {
    title: "Plus e pagamento",
    blocks: [
      "O Plus é o único plano pago. O pagamento é só por Pix, processado pela Woovi. O plano mensal usa o Pix Automático e renova sozinho até ser cancelado; o plano anual é um Pix único, vale pelo período pago e não renova sozinho.",
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
      "Guardamos: o identificador da sua conta no Google ou no Discord (para reconhecer você no próximo login), o e-mail informado pelo Google ou pelo Discord no login, o @nome, o apelido, o endereço da foto do perfil nesses serviços, o registro do aceite dos Termos de Uso (com a versão aceita) e a declaração de que você tem a idade mínima.",
      "O e-mail serve para entrarmos em contato com você e para enviar avisos de cobrança. Não usamos o e-mail para marketing.",
      "Para manter você logado usamos um cookie de sessão, que só o servidor lê.",
    ],
  },
  {
    title: "Dentro da sala",
    blocks: [
      "Voz, vídeo e tela trafegam direto entre os navegadores dos participantes. Para isso funcionar, os navegadores trocam endereços de rede, e os participantes de uma mesma sala podem ver o endereço IP uns dos outros. Em algumas redes a mídia passa por um servidor de retransmissão da Cloudflare, que não guarda o conteúdo.",
      "Não gravamos áudio nem vídeo. O chat fica guardado só enquanto a sala existe e é apagado quando ela acaba.",
      "O servidor usa o endereço IP para limitar abusos (excesso de tentativas) e para manter um banimento feito pelo dono, até a sala acabar.",
    ],
  },
  {
    title: "Registros de acesso",
    blocks: [
      `Guardamos o registro de acesso ao serviço (endereço IP, data e hora) por ${ACCESS_LOG_MONTHS} meses, como manda o Marco Civil da Internet. Esse registro não inclui o conteúdo das salas e só é entregue a autoridades mediante ordem judicial.`,
    ],
  },
  {
    title: "Pagamento",
    blocks: [
      "O Plus é pago por Pix, processado pela Woovi. Para gerar a cobrança pedimos o seu CPF. Nós não guardamos o CPF: ele só passa pelo nosso servidor a caminho da Woovi, que processa o Pix.",
      `Guardamos o estado da assinatura (ciclo, período pago, situação) e o registro de cada cobrança. Os registros de cobrança ficam guardados por ${BILLING_RECORDS_YEARS} anos, para cumprir obrigações fiscais e responder a reclamações, e depois são apagados.`,
    ],
  },
  {
    title: "Por que tratamos os seus dados",
    blocks: [
      "Para prestar o serviço que você pediu (execução de contrato): a sessão, a conta, a sala e a cobrança do Plus.",
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
      "Quando estas Políticas de Privacidade mudarem, a versão indicada no topo desta página muda junto. Quem tem conta vê, depois do login, uma faixa de aviso no topo do serviço, com a data da mudança e o link para os Termos de Uso atualizados. Continuar usando o serviço depois da mudança vale como aceite da nova versão.",
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
      "Excluir a conta apaga os seus dados pessoais: @nome, apelido, endereço da foto, o aceite dos Termos de Uso e a declaração de idade. O @nome fica livre e o link fixo deixa de existir. Não dá para desfazer.",
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
        title: `Vídeo em ${PLUS_QUALITY}`,
        text: "Sua tela e sua câmera com mais nitidez e fluidez, em qualquer sala.",
      },
      {
        title: `${PLUS_VIDEOS_PER_PERSON} vídeos ao mesmo tempo`,
        text: "Tela e câmera juntas, sem precisar escolher.",
      },
      { title: "Link fixo", text: "Uma sala permanente no endereço do seu @nome." },
      { title: "Tema de sala", text: "Escolha as cores da sua sala entre os temas prontos." },
      { title: "Selo ao lado do nome", text: "Quem está na sala vê que você apoia o projeto." },
    ],
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
      cycle: { monthly: "mensal", annual: "anual" },
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
      paid: `Seu Plus está ativo. Você já transmite em ${PLUS_QUALITY}, pode ligar ${PLUS_VIDEOS_PER_PERSON} vídeos ao mesmo tempo, tem o link fixo no seu @nome, o tema de sala e o selo.`,
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
      renewsOn: "Renova em",
      validUntil: "Vale até",
    },
    fixedLinkTitle: "Seu link fixo",
    fixedLinkHint: "Uma sala permanente no seu @nome. Ela não expira quando esvazia.",
    fixedLinkLabel: "Endereço do seu link fixo",
    fixedLinkOpen: "Abrir a sala",
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
        `Vídeo em ${PLUS_QUALITY}`,
        `${PLUS_VIDEOS_PER_PERSON} vídeos ao mesmo tempo`,
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
    errors: {
      turnstileFailed:
        "A verificação contra robôs não passou. Refaça a verificação e tente criar a sala de novo.",
      rateLimited: "Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.",
      error: "Não foi possível criar a sala agora. Tente de novo em instantes.",
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
    ageNotice: `O ${APP_NAME} é uma plataforma para maiores de 18 anos.`,
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
  },
  roomEnd: {
    ended: {
      title: "Esta sala acabou",
      message: "A sala foi encerrada ou o link nunca existiu. Você pode criar outra em um clique.",
      action: "Criar outra sala",
    },
    full: {
      title: "Sala cheia",
      message: `Esta sala já tem ${ROOM_MAX_PEOPLE} pessoas, o máximo da sala direta. Tente de novo quando alguém sair.`,
      action: "Tentar de novo",
    },
    banned: {
      title: "Você foi banido desta sala",
      message: "O dono da sala bloqueou a sua entrada até a sala acabar.",
    },
    kicked: {
      title: "Você foi removido da sala",
      message: "O dono da sala removeu você. Se quiser, pode tentar entrar de novo.",
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
  },
  people: {
    label: "Pessoas na sala",
    owner: "dono",
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
    videoRoomLimit: `A sala já tem ${ROOM_MAX_VIDEOS} vídeos ao mesmo tempo, o máximo. Espere alguém parar para transmitir.`,
    videoPersonLimit: `Você já transmite ${VIDEOS_PER_PERSON} vídeo, o máximo por pessoa. Pare o vídeo atual antes de iniciar outro.`,
    chatRateLimited: "Você enviou mensagens rápido demais. Espere alguns segundos.",
    mutedByOwner: "O dono da sala silenciou o seu microfone.",
    mediaPermissionDenied: {
      microphone: "O navegador não liberou o microfone. Autorize o acesso nas permissões do site.",
      camera: "O navegador não liberou a câmera. Autorize o acesso nas permissões do site.",
      screen: "O compartilhamento de tela foi cancelado ou não foi autorizado.",
    },
    turnstileFailed: "A verificação contra robôs não passou. Refaça a verificação e tente de novo.",
    rateLimited: "Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.",
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
