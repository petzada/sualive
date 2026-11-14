import {
  APP_NAME,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  ROOM_MAX_PEOPLE,
  ROOM_MAX_VIDEOS,
  VIDEOS_PER_PERSON,
} from "@sualive/config";

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
    cancel: "Cancelar",
    backHome: "Voltar ao início",
  },
  turnstile: {
    label: "Verificação contra robôs",
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
    hint: `Voz, tela, webcam e chat. Até ${ROOM_MAX_PEOPLE} pessoas.`,
    errors: {
      turnstileFailed:
        "A verificação contra robôs não passou. Refaça a verificação e tente criar a sala de novo.",
      rateLimited: "Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.",
      error: "Não foi possível criar a sala agora. Tente de novo em instantes.",
    },
  },
  lobby: {
    title: "Entrar na sala",
    nicknameLabel: "Seu apelido",
    nicknamePlaceholder: "Como quer ser chamado",
    /** Shown only while the nickname is outside the accepted length. */
    nicknameInvalid: `De ${NICKNAME_MIN_LENGTH} a ${NICKNAME_MAX_LENGTH} caracteres.`,
    previewTitle: "Prévia de câmera e microfone",
    previewIntro: "Opcional: confira como você aparece e se o microfone capta sua voz antes de entrar.",
    previewStart: "Testar câmera e microfone",
    previewStarting: "Pedindo permissão…",
    previewCameraLabel: "Prévia da sua câmera",
    previewNoCamera: "Câmera indisponível ou sem permissão.",
    previewNoMicrophone: "Microfone indisponível ou sem permissão.",
    previewUnavailable:
      "Não foi possível acessar a câmera nem o microfone. Você pode entrar mesmo assim e só assistir.",
    micLevelLabel: "Nível do microfone",
    mutedHint: "Você entra com o microfone mudo e liga quando quiser.",
    join: "Entrar",
    joining: "Entrando na sala…",
  },
  room: {
    loading: "Abrindo a sala…",
    reconnecting: "A conexão caiu. Reconectando…",
    codeLabel: "Código da sala:",
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
    leaveShort: "Sair",
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
