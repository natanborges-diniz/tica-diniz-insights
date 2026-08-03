# Último erro UTILITIES do BTG

## O que aconteceu

Última tentativa: **03/08/2026 19:25 (SP)** — borderô de Barueri (empresa 16).

- Mensagem do lote: "O BTG recusou a inclusão dos pagamentos no lote (1 falha)... validação local: **Linha iniciada em 8 é arrecadação — use o tipo UTILITIES**"
- Item que travou: `SABESP COMPANHIA DE AGUA E ESGOTO - ÁGUA 2026-6/12` — R$ 122,60, vencimento 01/08/2026.
- Linha digitável começa com **8** (conta de concessionária), mas o lançamento está marcado como boleto comum (`BANKSLIP`).
- Nada foi debitado; o item voltou para preparo (status PREVISTO).

## Causa confirmada

O código só troca `BANKSLIP` por `UTILITIES` quando o lançamento tem vínculo com um título do DDA. Esse lançamento tem a linha digitável salva, mas **não tem vínculo com DDA**, então o tipo permaneceu `BANKSLIP` e a validação local barrou o envio.

## Correção proposta

1. Passar a decidir o tipo pela **própria linha digitável**, independente de haver título DDA: linha com 48 dígitos ou iniciando em 8 → `UTILITIES`; caso contrário → `BANKSLIP`.
2. Aplicar a mesma regra nos pontos onde o lançamento é criado/classificado com boleto, para o registro já nascer com o tipo certo.
3. Melhorar a mensagem de bloqueio: em vez de texto técnico, indicar "conta de concessionária — será enviada como arrecadação" e permitir reenviar direto.

### Detalhes técnicos

- `supabase/functions/financeiro-lancamentos/index.ts`: remover a dependência de `lanc.btg_dda_id` na definição de `paymentType` (linhas ~1355-1362), usando `dda?.linha_digitavel || dados.linha_digitavel`.
- Revisar os pontos que gravam `btg_payment_type: "BANKSLIP"` fixo (linhas ~527, ~2144, ~2198) para derivar do primeiro dígito da linha.
- Sem migration; apenas deploy de `financeiro-lancamentos`.
