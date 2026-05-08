## Causa raiz (com evidência)

A `base_url_production` no banco está apontando para o **site estático** da Haytek (`https://dev.haytek.com.br`, hospedado em Google Cloud Storage), não para o backend real da API. Por isso todo POST volta com `<Error><Code>AuthenticationRequired</Code>` em XML — é resposta do GCS, não da API.

Inspecionando o JS do próprio Swagger UI da Haytek (https://dev.haytek.com.br), encontrei a configuração oficial dos ambientes:

```js
stg: { apiBase: "https://stg-api.haytek.com.br/external/api/v1/haytek-public" }
prd: { apiBase: "https://api.haytek.com.br/external/api/v1/haytek-public" }
```

Conclusão: produção e staging usam **o mesmo path** (`/external/api/v1/haytek-public`), só muda o host (`stg-api` → `api`).

## Mudanças

### 1. Migração SQL — corrigir `fornecedor_configuracao`
```sql
UPDATE public.fornecedor_configuracao
SET base_url_production = 'https://api.haytek.com.br'
WHERE fornecedor = 'HAYTEK';
```

### 2. `supabase/functions/haytek-proxy/index.ts`
Hoje, em produção, o código força `apiPath = ""` (raiz), assumindo que prd não tem prefixo. Isso está errado — prd usa o **mesmo prefixo do staging**. Ajustar:

- Em `loadHaytekGlobalConfig`, mudar `apiPath = isProd ? "" : "/external/api/v1/haytek-public"` para **sempre** `"/external/api/v1/haytek-public"` (vale para ambos ambientes).
- Atualizar o default fallback de `base_url_production` no código de `https://dev.haytek.com.br` para `https://api.haytek.com.br` (defesa em profundidade caso o DB venha vazio).
- Atualizar o comentário no topo do arquivo (linhas 9–11) refletindo o path único.
- Redeploy do `haytek-proxy`.

### 3. `mem://integrations/haytek/master-specification`
Atualizar a memória com a URL correta de produção e a regra "mesmo path em ambos ambientes" para evitar regressão futura.

## Validação

1. Após o deploy, fazer um teste de envio real do pedido pelo fluxo de OS (mesma OS 95485 que falhou).
2. Conferir nos logs do `haytek-proxy` que a URL agora é `https://api.haytek.com.br/external/api/v1/haytek-public/orders/lab` e que o status volta `201` (ou erro JSON da API real, não XML do GCS).

## Resultado esperado

Pedido de produção é aceito pela API real da Haytek, com o mesmo token JWT já cadastrado.