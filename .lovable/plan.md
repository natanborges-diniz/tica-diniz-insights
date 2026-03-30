

# Plano: Corrigir URL e simplificar autenticação Haytek

## Problema raiz

A URL da API estava **completamente errada**. Comparação:

| Item | Nosso sistema | Correto (fornecedor) |
|------|--------------|---------------------|
| Base URL | `https://dev.haytek.com.br` | `https://stg-api.haytek.com.br` |
| Path pedido | `/orders/lab` | `/external/api/v1/haytek-public/orders/lab` |
| Path consulta | `/orders/{id}` | `/external/api/v1/haytek-public/orders/{id}` |
| Auth | Múltiplas tentativas com headers extras | Apenas `Authorization: Bearer {TOKEN}` |

## Correções

### 1. Atualizar `base_url_staging` no banco

```sql
UPDATE fornecedor_configuracao 
SET base_url_staging = 'https://stg-api.haytek.com.br'
WHERE fornecedor = 'HAYTEK';
```

### 2. Proxy `haytek-proxy/index.ts` — corrigir paths

- Criar pedido: `${BASE_URL}/external/api/v1/haytek-public/orders/lab`
- Consultar pedido: `${BASE_URL}/external/api/v1/haytek-public/orders/${orderId}`
- Simplificar `fetchHaytek`: remover estratégias de fallback, usar apenas `Authorization: Bearer {TOKEN}`
- Remover headers extras (`X-User`, `X-Api-User`, `Username`, etc.) — não são necessários

### 3. Fallback URL padrão

Atualizar o fallback no código de `https://dev.haytek.com.br` para `https://stg-api.haytek.com.br`.

## Resultado esperado

Com a URL e path corretos + autenticação simplificada, o pedido será aceito pela API Haytek.

