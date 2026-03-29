

# Plano Atualizado: Integrar Fornecedor Haytek (Dmax)

## Atualizacoes neste plano

1. **Imagens de armacao completas**: Recebidas todas 13 imagens (01-13). Codigos `001` a `013`.
2. **Credenciais sandbox recebidas**: Loja SP0156, usuario `sp.osasco.adm@oticasdiniz.com.br`, Bearer Token fornecido no PDF.
3. **Base URL sandbox**: `https://dev.haytek.com.br`

---

## Etapas de implementacao

### Etapa 1 — Migration

- Tabela `haytek_empresa_config` (cod_empresa, store_id, address_id, cnpj, alias, ativo)
- Tabela `haytek_produtos` (product_id, design, linha, material, nome_comercial, ranges de prescricao, diametro) + seed ~245 SKUs da planilha
- INSERT em `fornecedor_configuracao`: fornecedor='HAYTEK', ambiente='staging', base_url_staging='https://dev.haytek.com.br', api_key_staging=[token do PDF]
- RLS admin-only em ambas tabelas

### Etapa 2 — Imagens de armacao

- Copiar 13 imagens (01.jpg a 13.jpg) para `public/images/haytek-armacao/`
- Criar `HaytekFormatoAroSelector.tsx` — grid visual com 13 opcoes mapeadas para codigos `001`-`013`, baseado no `ZeissFormatoAroSelector`

### Etapa 3 — Edge Function `haytek-proxy`

- Actions: `criar-pedido`, `consultar-pedido`
- Resolve credenciais (base_url + api_key) via `fornecedor_configuracao` por ambiente
- Resolve `storeId` e `addressId` via `haytek_empresa_config` por cod_empresa
- Auth: `Authorization: Bearer {api_key}`
- CORS padrao

### Etapa 4 — Services

- `haytekService.ts`: Types + `criarPedidoHaytek()`, `consultarPedidoHaytek()`
- `haytekMatchingService.ts`: Match OS items contra `haytek_produtos` por design/material/ranges + fallback `fornecedor_produto_depara`

### Etapa 5 — Admin: Aba Haytek em `AdminFornecedoresPage.tsx`

- Adicionar "HAYTEK" ao array de fornecedores
- Campos por empresa: CNPJ, Store ID, Address ID
- Reutilizar `CredenciaisSection` (staging/production toggle existente)

### Etapa 6 — Pagina `PedidoHaytekPage.tsx`

- Recebe `codOs`, `codEmpresa` via query params
- Carrega receita da OS + matching automatico
- Formulario:
  - Prescricao OD/OE (spherical, cylindrical, axis, addition, ndp, height — strings)
  - Prisma opcional (horizontal: Nasal/Temporal + value; vertical: Superior/Inferior + value)
  - Armacao: code (3PC/ARF/FIN/FIA), material (Acetato/Metal), modelImage (seletor visual 001-013), bridge, height, width
  - Treatment: select enum (ARA/ARV/TIN/ANT/TRP/TRS/APA/APV)
  - Corridor: select 14-18 (condicional a progressivos)
  - Coloring: opcional (CNZ/MAR/VDE + D25/D50/D80/T25/T50/T80)
  - Customization: opcional (frameAngle, pantoscopicAngle, vertexDistance, workDistance, version)
  - Services: montagem + corte remoto (opcional)
- Botoes de acao inline por secao (padrao UX existente)
- Registra em `pedidos_fornecedor`

### Etapa 7 — Rota + Deteccao

- Rota `/pedido/haytek` em `App.tsx`
- Detectar "HAYTEK" / "DMAX" nos itens da OS para direcionar ao formulario

---

## Arquivos criados/alterados

| Arquivo | Acao |
|---------|------|
| `supabase/migrations/xxx_haytek_setup.sql` | Tabelas + seed |
| `public/images/haytek-armacao/01-13.jpg` | 13 imagens |
| `supabase/functions/haytek-proxy/index.ts` | Edge function |
| `src/services/haytekService.ts` | Service client |
| `src/services/haytekMatchingService.ts` | Matching |
| `src/components/haytek/HaytekFormatoAroSelector.tsx` | Seletor visual |
| `src/pages/PedidoHaytekPage.tsx` | Pagina de pedido |
| `src/pages/AdminFornecedoresPage.tsx` | Aba HAYTEK |
| `src/App.tsx` | Rota |

## Credenciais sandbox (do PDF)

| Campo | Valor |
|-------|-------|
| Loja | SP0156 |
| Usuario | sp.osasco.adm@oticasdiniz.com.br |
| Token | Fornecido no PDF (sera salvo em `fornecedor_configuracao.api_key_staging`) |
| Base URL | https://dev.haytek.com.br |

## Ordem

| Etapa | Entrega |
|-------|---------|
| 1 | Migration: tabelas + seed catalogo + credenciais sandbox |
| 2 | Imagens de armacao + seletor visual |
| 3 | Edge function haytek-proxy |
| 4 | Service + Matching |
| 5 | Admin: aba Haytek |
| 6 | Pagina de pedido |
| 7 | Rota + deteccao |

