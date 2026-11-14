# Segredos e credenciais

Nenhum valor de segredo entra no repositório, em PR, em log ou em conversa com agente. Os valores ficam
nos **segredos do GitHub Actions** (para o CI publicar) e nos **segredos do Worker** na Cloudflare (para
o código em execução). Este arquivo lista só os nomes.

Para gravar um segredo no GitHub sem que ele apareça na tela, rode no terminal, na pasta do repositório,
e cole o valor quando for pedido:

```bash
gh secret set NOME_DO_SEGREDO
```

Conferir o que já está gravado (mostra só os nomes):

```bash
gh secret list
```

## Entrega 0 — Fundação

| Nome | Onde conseguir |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Painel da Cloudflare → Meu perfil → Tokens de API → Criar token → modelo "Editar Cloudflare Workers". Acrescente permissão de edição em D1. |
| `CLOUDFLARE_ACCOUNT_ID` | Painel da Cloudflare → Workers e Pages → coluna da direita, "ID da conta". |
| `SENTRY_DSN_WEB` e `SENTRY_DSN_API` | Sentry → um projeto para o front (React) e outro para o Worker → Configurações → Chaves do cliente (DSN). O agente pode criar os projetos e ler o DSN pela integração do Sentry. |
| `SENTRY_AUTH_TOKEN` | Sentry → Configurações → Tokens de autenticação, com escopo de envio de releases. Serve para o CI enviar os mapas de código. |

Recursos da Cloudflare que o agente cria pela integração ou pelo CI, sem segredo novo: dois bancos D1
(produção e homologação) e os dois Workers.

## Entrega 1 — Sala direta

| Nome | Onde conseguir |
|---|---|
| `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` | Painel da Cloudflare → Turnstile → Adicionar widget. Um widget por ambiente. |
| `TURN_KEY_ID` e `TURN_KEY_API_TOKEN` | Painel da Cloudflare → Realtime → TURN → Criar chave. |
| `SESSION_SECRET` | Valor aleatório longo, gerado por você. Um por ambiente. |

## Entrega 2 — Conta e Plus

| Nome | Onde conseguir |
|---|---|
| `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs e serviços → Credenciais → ID do cliente OAuth (aplicativo da Web). |
| `DISCORD_CLIENT_ID` e `DISCORD_CLIENT_SECRET` | Discord Developer Portal → Applications → New Application → OAuth2. |
| `WOOVI_APP_ID` | Woovi → API/Plugins → Nova API. Produção usa a conta real; homologação usa a conta criada em app.woovi-sandbox.com. |
| `WOOVI_WEBHOOK_SECRET` | Woovi → API/Plugins → Webhooks, ao cadastrar o endereço do webhook de cada ambiente. |

## Entrega 4 — Sala no servidor

| Nome | Onde conseguir |
|---|---|
| `REALTIME_APP_ID` e `REALTIME_APP_SECRET` | Painel da Cloudflare → Realtime → SFU → Criar aplicativo. |

Segredos que valem por ambiente recebem o sufixo `_STAGING` na versão de homologação.
