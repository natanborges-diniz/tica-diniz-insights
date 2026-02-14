# Firebird Bridge — Contrato de API v2.4.0

> **Versão do contrato:** 2.4.0  
> **Data:** 2026-02-14  
> **Bridge version:** 2.4.0  
> **Base URL:** `https://firebird-bridge-production.up.railway.app`

---

## 1. Envelope Padrão

### Sucesso (HTTP 200)

```json
{
  "ok": true,
  "data": [ ... ],
  "error": null,
  "meta": {
    "count": 42,
    "elapsed_ms": 230,
    "endpoint": "/api/v1/vendas/resumo-empresa-vendedor"
  }
}
```

### Erro (HTTP 4xx/5xx)

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "FIREBIRD_TIMEOUT",
    "message": "Firebird não respondeu a tempo. Tente novamente em alguns segundos."
  },
  "details": { "original": "timeout after 30000ms" }
}
```

### Regras

| Campo | Tipo | Obrigatório | Notas |
|-------|------|:-----------:|-------|
| `ok` | boolean | ✅ | `true` = sucesso, `false` = erro |
| `data` | array \| null | ✅ | Sempre array em sucesso, `null` em erro |
| `error` | `{ code, message }` \| null | ✅ | `null` em sucesso, objeto em erro |
| `meta` | object | ❌ | Opcional. Presente quando disponível |
| `meta.count` | number | — | Quantidade de itens em `data` |
| `meta.elapsed_ms` | number | — | Tempo de execução no backend (ms) |
| `meta.endpoint` | string | — | Path do endpoint |
| `details` | object | ❌ | Debug info (apenas em erros, ambiente dev) |

### Política de `meta.elapsed_ms`

- **Padrão:** Sempre presente em todos os endpoints v2.
- **Uso:** Telemetria de performance no frontend (logado no console).
- **Pode ser desabilitado?** Não. É considerado campo obrigatório do meta quando meta está presente.

---

## 2. Códigos de Erro Oficiais

| `error.code` | HTTP Status | Descrição | Quando ocorre |
|--------------|:-----------:|-----------|---------------|
| `VALIDATION_ERROR` | 400 | Parâmetro obrigatório ausente ou inválido | Query params faltando (`dataInicio`, `dataFim`, `empresa`) |
| `NOT_FOUND` | 404 | Recurso não encontrado | Endpoint inexistente |
| `FIREBIRD_TIMEOUT` | 503 | Firebird não respondeu dentro do tempo limite | `QUERY_TIMEOUT_MS` excedido (default 30s), ECONNRESET, EPIPE |
| `FIREBIRD_DISCONNECTED` | 503 | Sem conexão com o banco Firebird | ECONNREFUSED, connection refused |
| `QUERY_ERROR` | 500 | Erro na execução da query SQL | Dynamic SQL error, token unknown, column unknown |
| `INTERNAL_ERROR` | 500 | Erro genérico não classificado | Qualquer outro erro |

### Classificação automática (`classifyError`)

```
timeout, timed out, econnreset, epipe     → FIREBIRD_TIMEOUT (503)
econnrefused, connection refused          → FIREBIRD_DISCONNECTED (503)
dynamic sql error, dsql, token unknown    → QUERY_ERROR (500)
*qualquer outro*                          → INTERNAL_ERROR (500)
```

---

## 3. Endpoints v2 — Referência Completa

### 3.1 Health Check

#### `GET /health` (Liveness)

Verifica se o processo Node.js está rodando. **Não usa envelope v2.**

```
Response (200):
{ "status": "ok", "timestamp": "...", "version": "2.4.0" }
```

#### `GET /api/v1/health` (Readiness)

Verifica conectividade com Firebird. **Exceção documentada:** usa envelope v2 mas com semântica especial para `degraded`.

**UP (200):**
```json
{
  "ok": true,
  "data": [{ "status": "up", "firebird": "connected", "latency_ms": 45, "version": "2.4.0" }],
  "error": null,
  "meta": { "elapsed_ms": 45, "endpoint": "/api/v1/health" }
}
```

**DEGRADED (503):**
```json
{
  "ok": true,
  "data": [{ "status": "degraded", "firebird": "disconnected", "latency_ms": 2001, "version": "2.4.0", "error_detail": "Health check timeout" }],
  "error": null,
  "meta": { "elapsed_ms": 2001, "endpoint": "/api/v1/health" }
}
```

> **Nota:** `ok: true` + HTTP 503 significa "Bridge online, Firebird offline". O frontend mapeia: 200→UP, 503→DEGRADED, falha de rede→DOWN.

**Variável de ambiente:** `HEALTH_DB_TIMEOUT_MS` (padrão: 800ms). Ajustar para evitar falsos negativos por latência de rede.

---

### 3.2 Empresas

#### `GET /api/v1/empresas`

Lista empresas ativas (excluindo empresas inativas: 3, 5, 7, 8, 10, 11, 12).

**Request:**
```
GET /api/v1/empresas
```

**Response (200):**
```json
{
  "ok": true,
  "data": [
    {
      "cod_empresa": 1,
      "empresa_nome": "ANTONIO AGU",
      "empresa_cod_logico": 1,
      "empresa_nome_logico": "ANTONIO AGU"
    }
  ],
  "error": null,
  "meta": { "count": 7, "elapsed_ms": 120, "endpoint": "/api/v1/empresas" }
}
```

**Campos de resposta:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `cod_empresa` | number | Código real da empresa |
| `empresa_nome` | string | Nome fantasia |
| `empresa_cod_logico` | number | Código lógico (13+18→13 para "DINIZ SUPER") |
| `empresa_nome_logico` | string | Nome lógico |

---

### 3.3 Vendas — Resumo por Empresa e Vendedor

#### `GET /api/v1/vendas/resumo-empresa-vendedor`

**Request:**

| Param | Tipo | Obrigatório | Default | Descrição |
|-------|------|:-----------:|---------|-----------|
| `dataInicio` | date (YYYY-MM-DD) | ✅ | — | Data início do período |
| `dataFim` | date (YYYY-MM-DD) | ✅ | — | Data fim do período |
| `empresa` | string | ❌ | ALL | Código empresa ou `ALL` |
| `excluirCreditos` | `0` \| `1` | ❌ | `0` | Excluir créditos do cálculo |

**Response (200) — `data[]` shape:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `COD_EMPRESA` | number | Código real da empresa |
| `EMPRESA` | string | Nome da empresa |
| `EMPRESA_COD_LOGICO` | number | Código lógico |
| `EMPRESA_NOME_LOGICO` | string | Nome lógico |
| `COD_VENDEDOR` | number | Código do vendedor |
| `VENDEDOR` | string | Nome do vendedor |
| `QTD_TRANSACAO` | number | Quantidade de transações |
| `QTD_PRODUTOS` | number | Quantidade de produtos vendidos |
| `TOTAL_BRUTO` | number | Total bruto (sem desconto) |
| `TOTAL_VENDIDO` | number | Total vendido (com desconto) |
| `TOTAL_DESCONTO` | number | Total de descontos |
| `PERC_DESCONTO` | number | % de desconto |
| `TOTAL_CREDITOS` | number | Total de créditos (forma pgto 6) |
| `TOTAL_VENDIDO_SEM_CREDITOS` | number | Vendido menos créditos |

> **⚠️ Importante:** Valores são pré-calculados no backend. O frontend **NÃO deve** recalcular percentuais ou métricas derivadas.

---

### 3.4 Vendas — Resumo por Forma de Pagamento

#### `GET /api/v1/vendas/resumo-formas-pagamento`

**Request:**

| Param | Tipo | Obrigatório | Default | Descrição |
|-------|------|:-----------:|---------|-----------|
| `dataInicio` | date | ✅ | — | |
| `dataFim` | date | ✅ | — | |
| `empresa` | string | ❌ | ALL | |
| `excluirCreditos` | `0` \| `1` | ❌ | `0` | |
| `incluirDevolucoes` | `0` \| `1` | ❌ | `0` | Incluir linhas DEVOLUCAO |

**Response (200) — `data[]` shape:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `EMPRESA` | string | Nome da empresa |
| `EMPRESA_COD_LOGICO` | number | Código lógico |
| `EMPRESA_NOME_LOGICO` | string | Nome lógico |
| `VENDEDOR` | string | Nome do vendedor |
| `FORMAPAGAMENTO` | string | DINHEIRO, CHEQUE, CARTAO CREDITO, CARTAO DEBITO, BANCO, CARNE, CREDITOS, CONVENIO, DEVOLUCAO, OUTROS |
| `TOTALGERAL` | number | Total pago nesta forma |
| `QTD_VENDAS` | number | Qtd transações |
| `TOTAL_BRUTO` | number | Total bruto proporcional |
| `TOTAL_DESCONTO` | number | Desconto proporcional |
| `PERC_DESCONTO` | number | % desconto |

---

### 3.5 Vendas — Resumo Diário Simples

#### `GET /api/v1/vendas/resumo-diario-simples`

Usado pela sincronização de cache (`sync-agregados-diarios`).

**Request:**

| Param | Tipo | Obrigatório | Default |
|-------|------|:-----------:|---------|
| `dataInicio` | date | ✅ | — |
| `dataFim` | date | ✅ | — |
| `empresa` | string | ❌ | ALL |
| `excluirCreditos` | `0` \| `1` | ❌ | `0` |

**Response (200) — `data[]` shape:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `DATA_VENDA` | date | Data da venda |
| `COD_EMPRESA` | number | Código lógico da empresa |
| `VENDEDOR` | string | Nome do vendedor |
| `FORMAPAGAMENTO` | string | Forma de pagamento |
| `QTD_VENDAS` | number | Quantidade de vendas |
| `TOTAL_BRUTO` | number | Total bruto proporcional |
| `TOTAL_VENDIDO` | number | Total vendido proporcional |
| `TOTAL_DESCONTO` | number | Desconto proporcional |

> **Campos em UPPERCASE** por design (compatibilidade com sync).

---

### 3.6 Vendas — Análise SKU (OTB)

#### `GET /api/v1/vendas/analise-sku`

**Request:**

| Param | Tipo | Obrigatório | Default |
|-------|------|:-----------:|---------|
| `dataInicio` | date | ✅ | — |
| `dataFim` | date | ✅ | — |
| `empresa` | string | ❌ | ALL |

**Response (200) — `data[]` shape (normalizado snake_case):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `cod_sku` | number | Código do produto |
| `descricao_item` | string | Descrição |
| `marca` | string | Marca |
| `fornecedor` | string | Fornecedor |
| `tipo` | string | Tipo (AR, LG, AC, etc.) |
| `estoque_atual` | number | Estoque físico |
| `data_ultima_venda` | date \| null | |
| `dias_desde_ultima_venda` | number | 999 se nunca vendido |
| `data_ultimo_custo` | date \| null | |
| `preco_custo` | number | Último custo |
| `preco_venda_final` | number | Preço cadastrado |
| `qtd_produtos` | number | Qtd vendida no período |
| `total_vendido` | number | Total vendido no período |

---

### 3.7 Estoque — Análise de Ação

#### `GET /api/v1/estoque/analise-acao`

**Request:**

| Param | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `empresa` | number | ✅ | Código específico (não aceita ALL) |

**Response (200) — `data[]` shape (normalizado snake_case):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `empresa_nome` | string | Nome da empresa |
| `fornecedor_cod_pessoa` | number | Código do fornecedor |
| `fornecedor_nome` | string | Nome do fornecedor |
| `grife` | string | Marca/grife |
| `codigo_barras` | string | Código de barras |
| `descricao_item` | string | Descrição do produto |
| `quantidade_estoque` | number | Estoque físico |
| `caf` | number | Custo de aquisição |
| `data_ultima_entrada` | date \| null | |
| `dias_estoque` | number | Dias desde última venda |
| `acao_sugerida` | string | COMPRAR, MANTER, LIQUIDAR |

---

### 3.8 Financeiro — Parcelas

#### `GET /api/v1/financeiro/parcelas`

**Request:**

| Param | Tipo | Obrigatório | Default | Descrição |
|-------|------|:-----------:|---------|-----------|
| `dataInicio` | date | ✅ | — | |
| `dataFim` | date | ✅ | — | |
| `empresa` | string | ❌ | TODAS | |
| `tipo` | string | ❌ | — | PAGAR, RECEBER |
| `situacao` | string | ❌ | — | PAGA, EM ATRASO, EM ABERTO |
| `campoData` | string | ❌ | VENCIMENTO | EMISSAO, VENCIMENTO, PAGAMENTO |

**Response (200) — `data[]` shape (campos Firebird em UPPERCASE):**

Campos retornados diretamente do Firebird (case original): `COD_EMPRESA`, `EMPRESA_NOME`, `COD_LANCAMENTO`, `LANCAMENTO_PAGAR`, `PESSOA_NOME`, `PARCELA_DATA_VENCIMENTO`, `PARCELA_VALOR`, `PARCELA_SITUACAO`, `CONTACLA_DESCRICAO`, `FORMAPAGTO_TIPO_NOME`, etc.

---

### 3.9 Financeiro — DRE

#### `GET /api/v1/financeiro/dre`

**Request:**

| Param | Tipo | Obrigatório | Default |
|-------|------|:-----------:|---------|
| `dataInicio` | date | ✅ | — |
| `dataFim` | date | ✅ | — |
| `empresa` | string | ❌ | TODAS |

**Response (200) — `data[]` shape:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `COMPETENCIA` | string | YYYY-MM |
| `COD_EMPRESA` | number | |
| `EMPRESA_NOME` | string | |
| `CONTACLA_CODIGO` | number | ID classificação |
| `CONTACLA_NUMERO` | string | Número hierárquico |
| `CONTACLA_DESCRICAO` | string | |
| `VALOR_TOTAL` | number | Positivo=receita, negativo=despesa |

---

## 4. Endpoints Legados (Deprecados)

Estes endpoints **NÃO** seguem o envelope v2 e serão removidos:

| Endpoint | Formato atual | Usado por | Prazo de remoção |
|----------|---------------|-----------|------------------|
| `GET /api/kpis` | Objeto simples `{ faturamentoTotal, ... }` | Ninguém (frontend migrado) | Próximo deploy |
| `GET /api/vendas-por-dia` | Array direto `[{ data, faturamento }]` | Ninguém | Próximo deploy |
| `GET /api/vendas-por-loja` | Array direto `[{ codEmpresa, ... }]` | Ninguém | Próximo deploy |
| `GET /api/empresas` | Array direto `[{ codEmpresa, ... }]` | Ninguém | Próximo deploy |

### Plano de remoção

1. ✅ Confirmar que o frontend não usa nenhum endpoint legado (buscar `'/api/kpis'`, `'/api/vendas-por-dia'`, etc.)
2. ⬜ Remover os 4 endpoints do `index.js`
3. ⬜ Deploy no Railway
4. ⬜ Ativar `bridge_strict_contract` no frontend
5. ⬜ Após 7 dias estáveis, remover fallbacks legados do `firebirdBridge.ts`

---

## 5. Variáveis de Ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `FB_HOST` | `201.20.35.230` | Host do Firebird |
| `FB_PORT` | `3050` | Porta TCP |
| `FB_DATABASE` | `E:\...` | Caminho do banco |
| `FB_USER` | `SYSDBA` | Usuário |
| `FB_PASSWORD` | `masterkey` | Senha |
| `PORT` | `3000` | Porta HTTP do Express |
| `QUERY_TIMEOUT_MS` | `30000` | Timeout global de queries (ms) |
| `HEALTH_DB_TIMEOUT_MS` | `800` | Timeout do health check de readiness (ms) |

---

## 6. Versionamento

| Versão | Data | Mudanças |
|--------|------|----------|
| 2.4.0 | 2026-02-14 | Migração completa dos 9 endpoints para envelope v2. Helpers `success()`/`error()`. `classifyError()`. |
| 2.3.0 | 2026-02-10 | Contrato v2 definido. Frontend com fallback legado. |
| 1.0.0 | 2025-xx-xx | Versão inicial com endpoints legados. |
