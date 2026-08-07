# SPEC — Crediário Loja (boleto automático pela loja)

> Desenhada com o stakeholder em 07/08/2026. O fluxo de consulta de CPF
> continua como é (loja pede, financeiro consulta e decide). O que muda: a
> LIBERAÇÃO passa a ser registrada no sistema e, a partir dela, **a própria
> loja dispara a emissão dos boletos direto no BTG** — sem digitar nada.

## Princípio

A loja **só dispara**. Valores, número de parcelas e primeiro vencimento são
travados na liberação registrada pelo financeiro; os boletos saem no BTG
**rigorosamente** como aprovados. Nenhum campo de valor passa pela loja — a
trava é server-side (edge function via service role; a loja nem tem escrita na
tabela via RLS).

## Fluxo

1. **Loja → financeiro**: solicita consulta de CPF (canal atual, sem mudança).
2. **Financeiro (admin)**: consulta, decide, e registra em `/crediario` →
   "Liberar CPF consultado": loja, CPF, nome, valor total, nº de parcelas
   (parcela = total/n, centavos na última), 1º vencimento, validade opcional,
   flag "precisa de impressão", observação. Coerência validada na criação
   (`gerarParcelasBoleto` lança se parcelas×valor ≠ total).
3. **Loja**: vê em `/crediario` os CPFs liberados da sua loja (RLS por
   `user_empresa_permissions`) e clica **"Gerar N boletos no BTG"**. Só isso.
4. **Sistema**: emite parcela a parcela via `btg-cobrancas` (BANKSLIP,
   `/banking/collections`), grava em `btg_cobrancas` com `liberacao_id` +
   `parcela_numero` e cria o lançamento RECEBER de cada boleto (já existia).
   Falha parcial → status `BOLETOS_PARCIAL`, e o mesmo botão completa só as
   parcelas que faltaram (idempotente por `parcela_numero`).
5. **Retorno**: linha digitável (copiar) e PDF de cada boleto na tela, para a
   loja entregar ao cliente. Liquidação baixa sozinha (webhook/poll de
   cobranças já existentes).
6. **Impressão**: se o financeiro marcou "precisa de impressão", a liberação
   carrega o selo; após imprimir, "Marcar como impresso".

## Estados da liberação

`LIBERADO` → (disparo) → `BOLETOS_EMITIDOS` | `BOLETOS_PARCIAL` → (reenvio) →
`BOLETOS_EMITIDOS`. `CANCELADO` pelo admin a qualquer momento (boletos já
emitidos exigem cancelamento individual na tela de Cobranças). Validade
vencida bloqueia o disparo com mensagem clara.

## Peças

- Migration `20260807160000_crediario_liberacoes.sql` — tabela + RLS
  (admin gerencia; loja só SELECT da sua empresa; escrita via service role)
  + `btg_cobrancas.liberacao_id/parcela_numero` + leitura de cobranças p/ loja.
- `_shared/crediario.ts` — módulo puro: `gerarParcelasBoleto` (mensal,
  clamp de fim de mês, centavos na última), `sanitizarCpf`, `podeDisparar`.
  Testes em `src/lib/financeiro/__tests__/crediario.test.ts`.
- `btg-cobrancas` — `emitirCore` extraído (reuso) + actions `liberar_cpf`,
  `listar_liberacoes`, `disparar_boletos`, `cancelar_liberacao`,
  `marcar_impressao`.
- UI `/crediario` (`CrediarioLojaPage`) — admin libera; loja dispara e copia
  linha digitável/PDF; selo de impressão.

## Fora de escopo (v2)

- Consulta de crédito automatizada (SPC/Serasa) alimentando a liberação.
- Notificação push/WhatsApp para a loja quando o CPF for liberado.
- Entrada no ato (parcela 0 paga na loja) — hoje trata-se fora do carnê.
