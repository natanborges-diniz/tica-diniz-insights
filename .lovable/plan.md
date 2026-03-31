

## Plano: Comprovante de Pagamento (Picote) com dados da Rede

### Contexto

A API e.Rede já retorna no response da transação todos os dados do "picote": `tid`, `nsu`, `authorizationCode`, `date`, `time`, `returnCode`, `returnMessage`, `reference`, `amount`, `installments`, `cardBin` (primeiros 6 dígitos). Esses dados já estão sendo salvos em `dados_extras.rede_response` na tabela `payment_links`, mas não estão sendo exibidos nem devolvidos ao Connect & Flow.

### O que será feito

**1. Edge Function `payment-links` — Enriquecer retorno e webhook**

- No `result` do `processar_pagamento` (linha 284), incluir os campos do picote extraídos do `redeData`:
  - `nsu`, `authorizationCode`, `date`, `time`, `cardBin` (últimos 4 dígitos mascarados), `installments`, `amount`, `returnMessage`
- No webhook para o Connect & Flow (linha 272), adicionar os mesmos campos: `nsu`, `date`, `time`, `cardBin`, `installments`

**2. Checkout (`CheckoutPage.tsx`) — Tela de sucesso com comprovante**

- Ao receber sucesso, armazenar os dados do picote no state (retorno do `processar_pagamento`)
- Substituir a tela de sucesso simples por um **comprovante visual** estilo picote com:
  - TID, NSU, Código de Autorização
  - Data e hora do processamento
  - Valor, parcelas, últimos 4 dígitos do cartão
  - Descrição da compra
  - Nome do cliente

**3. Tela de Links (`PaymentLinksPage.tsx`) — Detalhe do picote para links pagos**

- Na tabela, para links com status `PAGO`, adicionar botão "Ver Comprovante"
- Ao clicar, abrir um Sheet/Dialog com os dados do `dados_extras.rede_response`:
  - TID, NSU, Autorização, Data/Hora, Valor, Parcelas, Bandeira/BIN

**4. Connect & Flow — Consumo do webhook enriquecido**

- O payload do webhook já enviado para `payment-webhook` será ampliado com `nsu`, `date`, `time`, `cardBin`, `installments`
- O bot no Connect & Flow poderá montar uma mensagem de confirmação com os dados do picote para enviar ao solicitante via WhatsApp

### Detalhes técnicos

Campos disponíveis no response da e.Rede (já salvos em `dados_extras`):
```text
tid               — Identificador único da transação (20 chars)
nsu               — Sequencial Rede (até 12 chars)  
authorizationCode — Código autorização emissor (6 chars)
date              — Data formato yyyyMMdd
time              — Hora formato HH:mm:ss
returnCode        — Código retorno ("00" = aprovado)
returnMessage     — Mensagem retorno
reference         — Referência do pedido
amount            — Valor em centavos
installments      — Parcelas
cardBin           — BIN do cartão (6 primeiros dígitos)
last4             — Últimos 4 dígitos do cartão
```

Nenhuma migração de banco necessária — os dados já estão em `dados_extras` (JSONB).

### Arquivos a modificar

| Arquivo | Alteração |
|---|---|
| `supabase/functions/payment-links/index.ts` | Enriquecer `result` e webhook com campos do picote |
| `src/pages/CheckoutPage.tsx` | Tela de sucesso com comprovante visual |
| `src/pages/PaymentLinksPage.tsx` | Botão "Ver Comprovante" + Sheet de detalhes |

