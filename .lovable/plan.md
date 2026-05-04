
## Contexto descoberto

**Address ID na homologação:** A homologação foi feita com sucesso para as 9 lojas Diniz (SP0156, SP0161, SP0163, SP0165, SP1010, SP2180, SP2987, SP2956, SP3341) **sem nenhum address_id preenchido** no banco. No edge function `haytek-proxy`, o campo `addressId` só é injetado no payload se existir (`if (store.addressId)`), portanto **a HiTech não exigiu este campo em homologação** — ele é opcional. Vamos manter a coluna no banco (para casos futuros) mas tirar do destaque visual da página.

**Estado atual de credenciais:** A tabela `fornecedor_configuracao` tem **uma única linha** para HAYTEK com `api_key_staging` (preenchida) e `api_key_production` (vazia). Isso reflete o modelo "1 token por ambiente" — incompatível com o novo modelo da HiTech, que será **1 token de produção por loja**, mantendo apenas 1 token de staging compartilhado.

**Problema chave:** Hoje o `haytek-proxy` lê `apiKey` de `fornecedor_configuracao` (global). Em produção, ele precisa ler o token específico da loja que está enviando o pedido.

---

## Mudanças propostas

### 1. Banco — adicionar token de produção por empresa

Migration na tabela `haytek_empresa_config`:
- Adicionar coluna `api_key_production text` (nullable)
- Adicionar coluna `ambiente_override text` (nullable, valores: `staging` | `production` | null = usar global)

Assim cada loja pode ter seu próprio token de produção, e o admin pode forçar uma loja específica a operar em staging/produção independentemente.

### 2. Edge Function `haytek-proxy`

Reescrever `loadStoreConfig` + `loadHaytekConfig` para resolver token e ambiente por empresa:

```text
Para cada pedido (codEmpresa):
  1. Carrega haytek_empresa_config da empresa (store_id, api_key_production, ambiente_override)
  2. Carrega fornecedor_configuracao global (base URLs + api_key_staging)
  3. Resolve ambiente:
       - se ambiente_override existe -> usa ele
       - senão usa fornecedor_configuracao.ambiente
  4. Resolve token:
       - se ambiente=production -> usa empresa.api_key_production
                                   (erro CONFIG_ERROR se vazio)
       - se ambiente=staging    -> usa fornecedor_configuracao.api_key_staging
  5. Resolve baseUrl pela base_url_staging/production global
```

O `idempotency_key` e o `hoya_environment` (campo legado usado para registrar ambiente) devem refletir o ambiente real resolvido.

### 3. Página `AdminHaytekConfigPage`

Reorganizar a tabela para refletir o novo modelo:

- Colunas: `Cód.` | `Alias` | `CNPJ` | `Store ID` | `Token Produção` | `Ambiente` | `Status` | `Ação`
- Esconder `Address ID` da tabela principal (deixar editável só num "expand row" opcional, já que não foi necessário em homologação)
- Campo `Token Produção`: input tipo password, mostra apenas últimos 4 caracteres quando salvo (`••••XXXX`), botão "olho" para revelar
- Campo `Ambiente`: select com opções `Staging (global)` | `Produção` — quando setado para Produção, exige `api_key_production` preenchido para considerar "Configurada"
- Cards de KPI:
  - Total empresas
  - Em produção (com token prod ativo)
  - Em staging
- Aviso visual no topo: "Token de staging permanece global em Configuração de Fornecedores. Em produção, cada loja usa seu próprio token."

### 4. Página `AdminFornecedoresPage` (sem mudança funcional grande)

Adicionar uma nota informativa na seção HAYTEK: "Para Haytek/HiTech em produção, configure o token de cada loja em Admin > Configuração Haytek por Empresa. O campo 'API Key Production' aqui é apenas fallback."

Manter o `api_key_production` global como fallback opcional (caso uma loja não tenha token próprio — embora na prática novo modelo deva sempre ter por loja).

### 5. Plano de ativação da Diniz Primitiva I

Após deploy:
1. Admin entra em `/admin/haytek` e cola o token de produção da loja `cod_empresa=1` (DINIZ PRIMITIVA I)
2. Define `Ambiente = Produção` apenas para essa loja
3. As outras 8 continuam em `Staging (global)` até receberem seus próprios tokens
4. Teste real de pedido pela loja 1 → deve bater na URL de produção com o token novo

---

## Detalhes técnicos

**SQL (migration):**
```sql
ALTER TABLE public.haytek_empresa_config
  ADD COLUMN IF NOT EXISTS api_key_production text,
  ADD COLUMN IF NOT EXISTS ambiente_override text 
    CHECK (ambiente_override IN ('staging','production'));
```

**Resolução de token (pseudo):**
```ts
const isProd = (storeCfg.ambiente_override ?? globalCfg.ambiente) === 'production';
const apiKey = isProd 
  ? (storeCfg.api_key_production ?? globalCfg.api_key_production)
  : globalCfg.api_key_staging;
if (!apiKey) throw CONFIG_ERROR('Token não configurado para esta loja/ambiente');
```

**Segurança:** `api_key_production` em `haytek_empresa_config` segue as RLS já existentes (admin-only + service role). O frontend nunca recebe o valor cru — a página exibe apenas máscara `••••XXXX` calculada via Edge Function dedicada `haytek-token-mask` (ou via select que retorna só `RIGHT(api_key_production,4)`). Para simplificar inicialmente, exibimos apenas indicador "Token configurado ✓" sem mostrar nenhum dígito.

**Address ID:** mantido na tabela e no payload (opcional). Removido apenas do destaque da UI principal, acessível via toggle "Mostrar campos avançados".
