import { APP_NAME } from "@sualive/config";

const TAGLINE =
  "Sala de chamada com compartilhamento de tela que abre por um link, sem cadastro e sem anúncio.";

/** Every user-visible string lives here (pt-BR). Components never hardcode copy. */
export const texts = {
  meta: {
    description: TAGLINE,
  },
  home: {
    title: APP_NAME,
    tagline: TAGLINE,
    notice: "Em construção",
    noticeDetail: "Ainda estamos montando tudo por aqui. Volte em breve.",
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
