# Resposta direta

- **Infoco Optical Business (este projeto)**: SIM — é onde a correção precisa acontecer. A `payment-links` é quem monta e envia o payload para o webhook (Connect & Flow), e hoje envia `brand=null`/`date=null`/`time=null` porque não consulta a Rede via GET após a aprovação.
- **InFoco Messenger**: NÃO — varri o repositório (`payment-webhook`, `brand`, `dados_extras`, `rede_response`, `cf_notify`, `picote`, `comprovante`, `bandeira`) e ele **não consome** os campos do comprovante nem hospeda o webhook. O destino do POST é `https://kvggebtnqmxydtwaumqz.supabase.co/functions/v1/payment-webhook` (projeto Connect & Flow), não o Messenger. O Messenger só lida com agendamentos/conversas.

# O que mudar no OB

### 1. `supabase/functions/payment-links/index.ts` (caso `processar_pagamento`)

Após confirmar `isApproved` e antes de montar o `webhookPayload`, fazer um GET enriquecido na Rede para obter a bandeira (a Rede só devolve `brand` no GET `/v1/transactions/{tid}`, não no POST):

```ts
// Enriquecer com GET (a Rede só retorna brand/dateTime completos no GET)
let enriched = redeData;
try {
  const getRes = await fetch(`${SUPABASE_URL}/functions/v1/rede-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-service-key": INTERNAL_SERVICE_SECRET },
    body: JSON.stringify({
      action: "consultar_transacao",
      cod_empresa: link.cod_empresa,
      params: { tid: redeData.tid },
    }),
  });
  if (getRes.ok) {
    const getJson = await getRes.json();
    enriched = { ...redeData, ...(getJson?.data ?? getJson) };
  }
} catch (e) {
  console.warn("[payment-links] GET enrich falhou:", (e as Error).message);
}
```

Trocar `redeData` por `enriched` no `webhookPayload` e no `result`. Substituir `date`/`time` por valores derivados de `dateTime` (que vem com timezone `-03:00`):

```ts
const dt = enriched.dateTime || null;          // "2026-05-07T14:33:21-03:00"
const dateBR = dt ? dt.slice(0, 10) : null;    // "2026-05-07"
const timeBR = dt ? dt.slice(11, 19) : null;   // "14:33:21" (BRT)

const webhookPayload = {
  payment_link_id: link_id,
  status: "PAGO",
  tid: enriched.tid,
  nsu: enriched.nsu,
  authorization: enriched.authorizationCode,
  dateTime: dt,
  date: dateBR,
  time: timeBR,
  valor: link.valor,
  installments: enriched.installments,
  cardBin: enriched.cardBin,
  last4: enriched.last4,
  brand: enriched.brand?.name || enriched.brandName || null,
  brandName: enriched.brand?.name || enriched.brandName || null,
  kind: enriched.kind || null,
  origem_ref: link.origem_ref,
  origem: link.origem,
};
```

Aplicar a mesma derivação no objeto `result` (linhas 416–436) para o frontend ver os valores corretos também.

### 2. Memória `mem://integrations/chatbot/payment-webhook-contract`

Atualizar o contrato do payload listando os novos campos garantidos (`dateTime`, `date` BRT, `time` BRT, `brand`, `brandName`, `kind`) e marcando que `date`/`time` agora são sempre derivados de `dateTime` (timezone `-03:00`).

# Arquivos editados

- `supabase/functions/payment-links/index.ts`
- `mem://integrations/chatbot/payment-webhook-contract`

# Fora do escopo

- **InFoco Messenger** — sem alterações.
- **Connect & Flow** (projeto que renderiza o picote) — recebe o payload novo automaticamente; se o picote dele lê `brand`/`time`, passará a exibir corretamente sem mudança de código lá. Se ainda assim algo não aparecer, o ajuste seria no template do picote naquele projeto, não aqui.
