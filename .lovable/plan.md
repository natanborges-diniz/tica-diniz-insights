
# Ajuste do path da API Haytek para produção

## Problema
Em produção (`https://dev.haytek.com.br`), o swagger expõe os endpoints diretamente em `/orders/lab`, `/orders/{orderId}` etc. (basePath `/`).

Em staging (`https://stg-api.haytek.com.br`), os endpoints estão em `/external/api/v1/haytek-public/orders/lab`.

Hoje o `haytek-proxy/index.ts` tem o path **hardcoded**:
```ts
const HAYTEK_API_PATH = "/external/api/v1/haytek-public";
```

Isso faz com que em produção a chamada vá para `https://dev.haytek.com.br/external/api/v1/haytek-public/orders/lab`, que não existe → cai num bucket S3 default → retorna XML `<AuthenticationRequired>`.

## Solução
Resolver o `apiPath` por ambiente, vindo da função `loadHaytekGlobalConfig`:

```text
ambiente = staging    → apiPath = "/external/api/v1/haytek-public"
ambiente = production → apiPath = ""   (endpoints diretos: /orders/lab)
```

## Mudanças

### 1. `supabase/functions/haytek-proxy/index.ts`
- Remover constante global `HAYTEK_API_PATH`.
- Em `loadHaytekGlobalConfig`, devolver também `apiPath` calculado a partir de `ambiente`.
- Substituir os 3 usos de `${BASE_URL}${HAYTEK_API_PATH}/...` por `${BASE_URL}${apiPath}/...` nas actions:
  - `criar-pedido` → `${BASE_URL}${apiPath}/orders/lab`
  - `consultar-pedido` → `${BASE_URL}${apiPath}/orders/${orderId}`
  - `atualizar-tracking` → `${BASE_URL}${apiPath}/orders/${orderId}`
- Aceitar `201` (Created) como sucesso explicitamente em `criar-pedido` (hoje funciona porque o filtro é `status >= 400`, mas deixamos comentado).

### 2. Sem mudanças de schema
A coluna `ambiente` em `fornecedor_configuracao` já existe e já está com `production`. Não precisa migration.

### 3. Sem mudanças no frontend
O `PedidoHaytekPage`/`HaytekTrackingPage` chamam o proxy via `supabase.functions.invoke` — não tocam URL.

## Validação após deploy
1. Conferir nos logs do `haytek-proxy`:
   ```
   Env: production | Base: https://dev.haytek.com.br
   criar-pedido URL: https://dev.haytek.com.br/orders/lab
   ```
2. Smoke test: criar pedido em SP0156, validar HTTP 201 + `orderId` retornado.
3. Rollback: reverter `ambiente = 'staging'` (1 update na linha de `fornecedor_configuracao`).

## Fora de escopo (futuro)
- Adicionar action `enviar-tracing-remoto` para `POST /orders/lab/remote-tracing` (multipart/form-data) — endpoint novo do swagger de produção.
- Validar enums `model.Frame.code` (`3PC|ARF|FIN|FIA`) e `model.CustomizationInput.workDistance` (`1.3|2|4`) no formulário Haytek.
