

## Plano: Corrigir Erros Haytek (storeName + axis) + Exibir Nome da Loja

### 3 Problemas

1. **`storeName is required`** — payload não inclui nome da loja
2. **`axis is required`** — quando cilíndrico é 0, eixo não é enviado
3. **"Empresa 9" na tela** — linha 570 de `PedidoHaytekPage.tsx` mostra `Empresa {codEmpresa}` em vez do nome da loja

### Correções

#### 1. Edge function: incluir storeName no payload

**Arquivo: `supabase/functions/haytek-proxy/index.ts`**
- Na função `loadStoreConfig`, incluir `alias` no select
- Setar `pedidoPayload.storeName = config.alias` antes de enviar à API

#### 2. Frontend: enviar axis sempre

**Arquivo: `src/pages/PedidoHaytekPage.tsx`**
- Trocar `if (presc.eixo) eye.axis = presc.eixo` por `eye.axis = presc.eixo || "0"`
- Aplica para OD e OE

#### 3. Frontend: mostrar nome da loja em vez de código

**Arquivo: `src/pages/PedidoHaytekPage.tsx`**
- Na query à `haytek_empresa_config` (linha ~288), incluir `alias` no select
- Guardar em novo state `storeName`
- Linha 570: trocar `Empresa {codEmpresa}` por `{storeName || `Empresa ${codEmpresa}`}`

### Arquivos a alterar

| Arquivo | Mudança |
|---|---|
| `supabase/functions/haytek-proxy/index.ts` | `loadStoreConfig` retorna + usa `alias` como `storeName` |
| `src/pages/PedidoHaytekPage.tsx` | axis default "0", exibir nome da loja |

