

# Plano: Corrigir payload Haytek conforme Swagger e atualizar token

## Diagnóstico

Analisei o Swagger oficial (`dev.haytek.com.br/swagger.json`) e encontrei divergências entre o payload que enviamos e o contrato da API:

### Problemas no payload atual

| Campo | Nosso payload | API espera |
|-------|--------------|------------|
| `frame.bridge` | `"18"` (string) | `integer` |
| `frame.height` | `"40"` (string) | `integer` |
| `frame.width` | `"52"` (string) | `integer` |
| `frame.modelImage` | aceita `"013"` | enum `"001"`-`"012"` apenas |
| `eye.addition` (vazio) | `""` | campo **required** — string vazia pode causar rejeição |
| `eye.ndp` (vazio) | `""` | campo **required** |
| `eye.height` (vazio) | `""` | campo **required** |
| `corridor` | `number \| null` | `integer`, enum `[14,15,16,17,18]` |

### Token

O token fornecido tem quebras de linha. Precisa ser salvo limpo na configuração. O proxy já sanitiza espaços, mas a atualização no Admin precisa ser com o valor correto concatenado:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI2OWM2ODAzMmMzNGZjMzU4YmE4NTU3ZmIifQ.RwK3b9gfpKJLPJySoZauT4bLbOqm0aNoueR43kF6qfE
```

## Correções

### 1. `src/pages/PedidoHaytekPage.tsx` — `buildPayload()`

- Converter `frameBridge`, `frameHeight`, `frameWidth` para `parseInt()` antes de enviar
- Remover campos de prescrição vazios em vez de enviar `""` (se o campo estiver vazio, não incluir na eye)
- Limitar `modelImage` ao enum `"001"`-`"012"`

### 2. `src/services/haytekService.ts` — tipos

- Alterar `HaytekFrameInput.bridge`, `height`, `width` de `string` para `number`
- Ajustar `HaytekPedidoPayload.products.corridor` para `number` (já está OK)

### 3. `src/components/haytek/HaytekFormatoAroSelector.tsx`

- Remover opção `"013"` se existir (enum oficial vai até `"012"`)

### 4. `supabase/functions/haytek-proxy/index.ts`

- Garantir sanitização adicional do token: remover `\n`, `\r`, `\t` além de espaços (já faz `.replace(/\s+/g, "")` — OK)
- Log mascarado do token (primeiros 10 + últimos 5 chars) para debug

### 5. Atualizar token no banco

- Usar insert tool para atualizar `fornecedor_configuracao` com o token limpo fornecido

## Resultado esperado

O payload enviado passará a conformar 100% com o Swagger, eliminando potenciais rejeições por tipo/formato. Com o token correto, o pedido deve ser aceito pela API.

