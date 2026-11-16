# Medição de custo da retransmissão (entrega 4)

Feita em 16/11/2026, em homologação, com o commit `298304a`. Responde à parte "Medição de custo, antes
de fixar os preços" da entrega 4 do `DECISOES.md` e aos riscos 10 e 11.

## Como foi medido

- Sala protegida (toda a mídia pela retransmissão) com 2 pessoas: uma transmitindo um vídeo e a outra
  assistindo, das 15:34 às 15:44 UTC.
- Uso lido na API de analytics do TURN da Cloudflare (`callsTurnUsageAdaptiveGroups`), por minuto e por
  identificador de credencial.
- A conta de teste recebeu Plus e ouro gravados direto no banco de homologação, com linha no
  livro-razão (referência `medicao-custo-e4:1`), com autorização do dono. Produção não foi tocada.

## O que a Cloudflare cobrou

| Participante | Saída (cobrada: do TURN para o cliente) | Entrada (grátis) |
|---|---|---|
| Quem assistiu | 38,2 MB | 2,4 MB |
| Quem transmitiu | 2,4 MB | 40,4 MB |

- Pior minuto de quem assistia: 12,43 MB (cerca de 1,66 Mbps), coerente com o teto de 1,5 Mbps do vídeo
  retransmitido mais som e sobrecarga. É o pior caso de um par: **0,746 GB por hora**.
- Tela parada: cerca de 0,7 MB por minuto.
- Voz em silêncio: cerca de 0,3 MB por minuto por pessoa que recebe.

## Riscos respondidos

- **Risco 10.** A Cloudflare aceita o identificador por credencial em `generate-ice-servers`, e a
  análise separa o uso de cada sessão. O uso de cada credencial pode ser conferido.
- **Risco 11.** Não há cobrança em dobro: com as duas pontas em retransmissão, a saída total (40,6 MB)
  equivale ao tráfego de um sentido. Só é cobrado o que chega a quem recebe pela retransmissão.

## Preços

Regra: pior caso × 2 ÷ R$ 0,0082, com o GB a R$ 0,275 (US$ 0,05 a R$ 5,50). Os 1.000 GB grátis por mês
não entram na conta.

| Item | Pior caso | Custo por hora | Preço | Antes |
|---|---|---|---|---|
| Vídeo retransmitido, por par assistido | 0,746 GB/h (medido) | R$ 0,205 | 50 de ouro/h | 45 |
| Sala protegida, 6 pessoas e 2 vídeos assistidos por todos | 8,4 GB/h (extrapolado) | R$ 2,32 | 570 de ouro/h | 500 |

A sala protegida de 6 pessoas não foi medida. A extrapolação soma 10 pares de vídeo (7,46 GB/h), o som
da tela a 64 kbps nesses 10 pares (0,29 GB/h) e 30 fluxos de voz falada (0,68 GB/h, estimado: só a voz
em silêncio foi medida).

## O que falta medir

- Sala protegida com 6 pessoas e 2 vídeos, com usuários reais.
- Par retransmitido fora da sala protegida (uma ponta só em retransmissão).
- Voz falada.

Aprovado pelo dono em 16/11/2026: 50 e 570 de ouro por hora.
