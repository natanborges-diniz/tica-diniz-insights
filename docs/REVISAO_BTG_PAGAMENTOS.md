# Revisão — API de Pagamentos BTG vs. nosso sistema

**Data:** 03/08/2026
**Motivo:** falha recorrente no envio de borderô — `500: Houve um erro durante a execução do pagamento. Cheque seu extrato antes de tentar novamente. (btg:enterprise:banking:payments:error:unexpected-error)`
**Fontes:** `developers.empresas.btgpactual.com` — [Pagamentos e Transferências](https://developers.empresas.btgpactual.com/docs/pagamentos), [Criar iniciação de pagamento](https://developers.empresas.btgpactual.com/reference/post_companyid-banking-payments), [Gestão de lote](https://developers.empresas.btgpactual.com/reference/gestão-de-lote-de-pagamento), [Ficha técnica de Pagamentos](https://developers.empresas.btgpactual.com/reference/pagamentos-1) (atualizada 12/05/2026)
**Código revisado:** `supabase/functions/financeiro-lancamentos/index.ts` (envio de borderô, linhas ~640–805), `supabase/functions/btg-pagamentos/index.ts`, `supabase/functions/btg-poll-status/index.ts`, `supabase/functions/btg-auth/index.ts`, `supabase/functions/_shared/boleto.ts`

> **Status:** aplicado em 03/08/2026. B1–B6, A1–A4, M1–M3 corrigidos em
> `_shared/btgPayment.ts` (novo), `financeiro-lancamentos`, `btg-pagamentos` e
> `btg-poll-status`. 30 testes novos em `src/lib/financeiro/__tests__/btgPayment.test.ts`;
> suíte completa em 549 testes verdes.
>
> **Pendente de dado, não de código:** `btg_contas_bancarias.conta` precisa estar
> preenchida por empresa — é ela que alimenta o `debitParty.number` obrigatório.
> O envio agora falha cedo, com mensagem explícita, se estiver vazia.

---

## Diagnóstico do erro

O código de erro genérico é o que o BTG retorna quando **não consegue classificar a falha**. Na tabela oficial de erros, o texto exato "Houve um erro durante a execução do pagamento. Cheque seu extrato antes de tentar novamente." corresponde a `unmapped-error`. Não é uma rejeição de negócio (saldo, boleto vencido, chave inválida — todos esses têm código próprio e mensagem específica).

Um erro não mapeado é o sintoma esperado de **requisição que não casa com nenhum contrato conhecido da API**. É exatamente o nosso caso: o borderô é enviado para uma rota que não existe, com um envelope que não existe, sem três campos obrigatórios.

O texto tranquilizador que o nosso sistema já exibe ("nada foi executado nem debitado") está **correto**: nesta etapa o BTG apenas cria a iniciação; o dinheiro só se move após aprovação no app/internet banking.

---

## Bloqueadores (explicam a falha)

### B1 — A rota usada para adicionar itens ao lote não existe

```ts
// financeiro-lancamentos/index.ts:724
POST /{cnpj}/banking/batch-payments/{batchId}/payments
```

A API de lote tem exatamente **três** rotas:

| Método | Rota | Função |
|---|---|---|
| POST | `/{companyId}/banking/batch-payments` | Abrir Lote |
| PATCH | `/{companyId}/banking/batch-payments/{batchId}` | Processar Lote |
| DELETE | `/{companyId}/banking/batch-payments/{batchId}` | Abandonar Lote |

Não há sub-recurso `/payments`. Os itens entram pelo **endpoint normal de pagamento** (`POST /{companyId}/banking/payments`), levando o `batchId` **dentro do corpo do item** (campo `batchId` do schema `BankSlipPaymentIssue` — "Id do lote de pagamentos").

> Fluxo correto: abrir lote → N × `POST /banking/payments` com `batchId` no item → `PATCH` para fechar.

### B2 — Falta o envelope `items`

O corpo de `POST /{companyId}/banking/payments` é `{ "items": [ { ... } ] }`. Enviamos o objeto do pagamento na raiz.

> Nota da doc: **1 pagamento por requisição**. Para vários itens aparecerem como um lote na área de aprovações, é justamente o fluxo de lote acima.

### B3 — `details` (plural) em vez de `detail`

O schema usa `detail`, no singular, em todos os tipos. Nosso código usa `details` em ambas as edge functions (`financeiro-lancamentos:705` e `btg-pagamentos:119+`). Campo desconhecido no corpo → falha de validação.

### B4 — Campos obrigatórios ausentes em todo item

`BankSlipPaymentIssue` exige `amount`, `debitParty` **e** `paymentDate`. Enviamos só `amount`.

- **`debitParty`** — `{ "branchCode": "50", "number": "<conta>" }`. A doc instrui usar agência `50`. Temos os dados em `btg_contas_bancarias.agencia` / `.conta` (hoje só lemos `cnpj` dessa tabela).
- **`paymentDate`** — formato `yyyy-mm-dd`, obrigatório.
- **`scheduledDate`** que enviamos **não existe no schema de entrada**. Ele só aparece nos payloads de webhook (saída). Toda a lógica de `dataAgendamento()` está correta na intenção, mas está preenchendo o campo errado — deve alimentar `paymentDate`.

### B5 — Abertura de lote com corpo errado

```ts
// atual (linha 648)
body: { description: "Borderô ..." }
// esperado
body: { taxId: "<CNPJ da empresa>" }   // taxId é required
```

A resposta traz `batchId`, `expiresAt` e `maxSize` (200). Hoje ignoramos `expiresAt` e `maxSize` — vale persistir os dois e barrar borderôs acima do limite antes de tentar.

### B6 — Fechamento de lote com corpo errado, e sem verificação

```ts
// atual (linha 790-797)
PATCH .../batch-payments/{batchId}  body: { action: "PROCESS" }
// esperado
PATCH .../batch-payments/{batchId}  body: { isFinished: true }   // → 202
```

Além do corpo errado, **não checamos a resposta**: o borderô é marcado `ENVIADO` mesmo que o lote nunca tenha sido fechado. Isso produz borderô "enviado" que nunca aparece para aprovação.

---

## Riscos altos (não bloqueiam hoje, mas cobram depois)

### A1 — Nenhuma requisição envia `x-idempotency-key`

A doc dedica uma seção inteira a isso. A chave vale **24 h** e fica atrelada ao token do operador; repetindo a mesma chave, o BTG devolve a resposta original em vez de duplicar a operação.

Como o nosso fluxo instrui explicitamente o usuário a "é só reenviar", estamos sem a única proteção contra pagamento duplicado. Recomendo UUID **determinístico e persistido** por item (ex.: derivado de `lancamento_id` + tentativa), gravado em `dados_extras` antes do POST.

### A2 — `buildBtgPayload` (btg-pagamentos) diverge do schema em quase todos os tipos

| Tipo | Nosso `details` | `detail` correto |
|---|---|---|
| `PIX_KEY` | `{ pixKey }` | `{ key: { value }, creditParty: { name, taxId } }` — ambos required |
| `TED` / `PIX_MANUAL` | campos planos + `accountType: "CHECKING"` | `{ creditParty: { taxId, name, account: { type, number, branch, bankCode } } }` — `type` ∈ `CC` / `PG` / `PP` |
| `PIX_QR_CODE` | `{ emv }` | `{ emv, creditParty: { name, taxId } }` |
| `DARF` | `revenueCode`, `taxId`, `referenceDate`, `dueDate` | `taxPayer { id, name }`, `expireDate`, `principalAmount`, `baselinePeriodDate`, `treasuryRevenueCode` (4 dígitos) |
| `PIX_REVERSAL` | cai no `default` (repassa cru) | `{ originalEndToEndId }` |
| `BANKSLIP` / `UTILITIES` | ✅ correto | `{ digitableLine }` / `{ digitableLine \| barcode }` |

`accountType: "CHECKING"` não é valor válido → dispara `invalid-json-schema-field-account-type`.

Falta também `agreementId: "INDIVIDUAL_APPROVE"` nos pagamentos avulsos (fora de lote).

### A3 — Dois construtores de payload divergentes

`btg-pagamentos/index.ts` e `financeiro-lancamentos/index.ts` montam o corpo do pagamento de formas diferentes. Qualquer correção feita em um lado não chega ao outro. Extrair para `_shared/btgPayment.ts` com testes unitários (o padrão que `_shared/boleto.ts` já segue bem).

### A4 — `description` sem validação de formato

`invalid-json-schema-field-description`: máximo **140 caracteres**, apenas letras, números e espaços. Passamos `bordero.descricao` sem sanitizar — acento, hífen ou barra derrubam o item.

---

## Riscos médios

### M1 — `GET /banking/batch-payments/{batchId}` não consta na referência

`btg-poll-status/index.ts:177` consulta o lote por essa rota. A referência de banking documenta consulta **por pagamento** (`GET /{companyId}/banking/payments` e `/{paymentId}`), não por lote. Recomendo: polling por `paymentId` + webhooks como fonte primária (`payments.confirmed`, `payments.failed`, `payments.processed`, `payments.reverted`).

### M2 — `normStatus` precisa cobrir a máquina de estados documentada

Estados oficiais: `CREATED`, `CONFIRMED`, `SCHEDULED`, `ADJOURNED`, `PROCESSED`, `REVERTED`, `FAILED`, `CANCELED` (+ `VALIDATED`, `INVALIDATED`, `RETAINED` nos webhooks). Pontos de atenção:

- `CONFIRMED` = houve débito, **mas ainda pode ser estornado** — baixa definitiva só em `PROCESSED`.
- `ADJOURNED` = retentativa automática, **não** é falha.
- `RETAINED` = retido na camada de fraude, exige ação no app.
- O mock de sandbox usa `"PAID"`, que não existe na API real.

### M3 — Sem `tags.externalId`

O schema oferece `tags.externalId`, e ele volta em todos os webhooks. É o melhor gancho de conciliação com `lancamento_id`, e hoje não usamos. Idem `internalDescription` (não sai no comprovante, só nos eventos internos).

---

## O que já está certo

- **Escopos** (`btg-auth:444`): `openid` + `brn:btg:empresas:banking:payments` — exatamente o exigido pela ficha técnica, via Authorization Code (não Client Credentials). ✅
- **`_shared/boleto.ts`**: normalização 44/47/48 e a regra "BANKSLIP não aceita linha iniciada em 8 → UTILITIES" batem com a doc (`invalid-json-schema-field-bank-slip-digitable-line` = 47 ou 48 dígitos; `barcode` = 44). ✅
- **Modelo mental do fluxo**: iniciação ≠ execução; aprovação acontece no app. A mensagem de erro que exibimos ao usuário está correta. ✅
- **Correlação por `paymentId`** para baixa automática: arquitetura certa, só depende de o POST voltar 201 de verdade.

---

## Correção sugerida — `enviarBordero`

```ts
// 1. Abrir lote
const batchRes = await fetch(`${apiBase}/${cnpj}/banking/batch-payments`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ taxId: cnpj }),            // ← taxId, não description
});
const { batchId, expiresAt, maxSize } = await batchRes.json();
if ((lancamentos ?? []).length > (maxSize ?? 200)) throw new Error("Borderô excede o lote");

// 2. Um POST por item, no endpoint normal, com batchId dentro do item
for (const lanc of lancamentos) {
  const idempotencyKey = idempotenciaDoLancamento(lanc.id, batchId);  // uuid persistido

  const item = {
    type: paymentType,                                // BANKSLIP | UTILITIES | PIX_KEY | ...
    detail: paymentDetail,                            // ← singular
    amount: Number(lanc.valor),
    paymentDate: agendarPara,                         // ← yyyy-mm-dd, não scheduledDate
    batchId,                                          // ← vincula ao lote
    debitParty: { branchCode: conta.agencia ?? "50", number: conta.conta },
    description: sanitizar(bordero.descricao, 140),   // alfanumérico + espaços
    internalDescription: `bordero:${bordero.id}`,
    tags: { externalId: lanc.id },
  };

  const payRes = await fetch(`${apiBase}/${cnpj}/banking/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-idempotency-key": idempotencyKey,            // ← anti-duplicidade 24h
    },
    body: JSON.stringify({ items: [item] }),          // ← envelope items
  });
  // 201 → { batchId, contractGuid, operationNeedsApproval }
}

// 3. Fechar lote — e conferir o 202
const fim = await fetch(`${apiBase}/${cnpj}/banking/batch-payments/${batchId}`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ isFinished: true }),         // ← não { action: "PROCESS" }
});
if (!fim.ok) throw new Error(`Lote não finalizado: ${fim.status}`);
```

> Atenção: o 201 de `POST /banking/payments` devolve `{ batchId, contractGuid, operationNeedsApproval }` — **não** um `paymentId`. A correlação por pagamento precisa vir de `tags.externalId` nos webhooks, ou de `GET /{companyId}/banking/payments` filtrando pelo `batchId`. O trecho atual que grava `payData.paymentId` nunca vai encontrar o campo.

---

## Ordem de execução sugerida

| # | Ação | Impacto |
|---|---|---|
| 1 | B1–B4: rota, envelope `items`, `detail`, `debitParty` + `paymentDate` | Destrava o envio de borderô |
| 2 | B5–B6: `taxId` na abertura, `isFinished: true` no fechamento + checar resposta | Lote chega à mesa de aprovação |
| 3 | A1: `x-idempotency-key` persistido | Elimina risco de pagamento duplicado no reenvio |
| 4 | A3 + A2: `_shared/btgPayment.ts` único, com todos os tipos corrigidos | Corrige PIX/TED/DARF e evita regressão |
| 5 | M3 + M1: `tags.externalId` e polling por pagamento/webhook | Baixa automática confiável |
| 6 | M2: revisar `normStatus` (`CONFIRMED` ≠ liquidado, `ADJOURNED` ≠ falha) | Evita baixa indevida |

Antes de ir para produção, vale rodar um item único em **sandbox com Wiremock** (`https://api.sandbox.empresas.btgpactual.com`) — hoje o caminho sandbox é totalmente mockado localmente e nunca exercita o contrato real.
