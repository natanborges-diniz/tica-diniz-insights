# Alterações Necessárias no Firebird Bridge (Railway)

**Data:** 2026-01-28  
**Objetivo:** Garantir consistência nos valores de estoque entre endpoints

---

## 📋 RESUMO DO PROBLEMA

O endpoint `/api/v1/vendas/analise-sku` (usado pelo OTB) e o endpoint `/api/v1/estoque/analise-acao` (usado pela Visão Estoque) estavam retornando valores de estoque diferentes para a mesma loja.

**Causa:** O CTE `estoque_atual` no endpoint `/vendas/analise-sku` não tinha o filtro `WHERE e.QUANTIDADE > 0`, fazendo com que somasse registros com quantidade zero ou negativa.

---

## ✅ ALTERAÇÃO 1: Endpoint `/api/v1/vendas/analise-sku`

**Arquivo:** `index.js` (ou onde estiver o endpoint no seu repositório)

**Localização:** Procure pelo endpoint `app.get('/api/v1/vendas/analise-sku', ...)`

**O que mudar:** No CTE `estoque_atual`, adicione `WHERE e.QUANTIDADE > 0`

### ❌ ANTES (INCORRETO):
```sql
estoque_atual AS (
  SELECT 
    e.COD_PRODUTO,
    SUM(e.QUANTIDADE) AS ESTOQUE
  FROM ESTOQUE e
  JOIN empresas_filtradas ef ON ef.COD_EMPRESA = e.COD_EMPRESA
  GROUP BY e.COD_PRODUTO
),
```

### ✅ DEPOIS (CORRETO):
```sql
estoque_atual AS (
  SELECT 
    e.COD_PRODUTO,
    SUM(e.QUANTIDADE) AS ESTOQUE
  FROM ESTOQUE e
  JOIN empresas_filtradas ef ON ef.COD_EMPRESA = e.COD_EMPRESA
  WHERE e.QUANTIDADE > 0
  GROUP BY e.COD_PRODUTO
),
```

---

## ✅ ALTERAÇÃO 2: Novo Endpoint `/api/v1/estoque/analise-acao`

**Se você ainda não tem esse endpoint**, adicione-o ao seu `index.js`:

```javascript
// ============================================
// API v1 - Análise de Estoque para Ação
// Retorna TODOS os SKUs com estoque físico (não depende de vendas)
// IMPORTANTE: Usa a mesma fonte de estoque que /vendas/analise-sku
// para garantir consistência nos valores
// ============================================
app.get('/api/v1/estoque/analise-acao', async (req, res) => {
  try {
    const { empresa } = req.query;

    if (!empresa || empresa === 'ALL' || empresa === 'null' || empresa === '') {
      return res.status(400).json({ 
        ok: false, 
        data: null,
        error: { code: 'INVALID_PARAMS', message: 'Parâmetro obrigatório: empresa (código específico)' }
      });
    }

    const codEmpresa = parseInt(empresa);

    // Query para análise de estoque - MESMA FONTE de estoque do /vendas/analise-sku
    // Retorna todos os SKUs com estoque > 0 na empresa selecionada
    const sql = `
      WITH
      estoque_empresa AS (
        SELECT 
          e.COD_PRODUTO,
          SUM(e.QUANTIDADE) AS QUANTIDADE_ESTOQUE
        FROM ESTOQUE e
        WHERE e.COD_EMPRESA = ${codEmpresa}
          AND e.QUANTIDADE > 0
        GROUP BY e.COD_PRODUTO
      ),
      vendas_180dias AS (
        SELECT
          ti.COD_PRODUTO,
          SUM(ti.QUANTIDADE) AS QTD_VENDIDA,
          MAX(t.DATAEMISSAO) AS DATA_ULTIMA_VENDA
        FROM TRANSACAO t
        JOIN TRANSACAO_ITEM ti ON ti.COD_TRANSACAO = t.COD_TRANSACAO 
          AND (ti.COD_EMPRESA = t.COD_EMPRESAESTOQUE OR ti.COD_EMPRESA = t.COD_EMPRESA)
        JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = ti.COD_NATUREZAOPERACAO
        WHERE nat.TIPO = 1
          AND t.COD_EMPRESAESTOQUE = ${codEmpresa}
          AND t.DATAEMISSAO >= DATEADD(-180 DAY TO CURRENT_DATE)
        GROUP BY ti.COD_PRODUTO
      ),
      ultimo_custo AS (
        SELECT DISTINCT
          ei.COD_PRODUTO,
          FIRST_VALUE(ei.VALORUNITARIO) OVER (PARTITION BY ei.COD_PRODUTO ORDER BY en.DATAEMISSAO DESC) AS CAF,
          FIRST_VALUE(en.DATAEMISSAO) OVER (PARTITION BY ei.COD_PRODUTO ORDER BY en.DATAEMISSAO DESC) AS DATA_ULTIMA_ENTRADA
        FROM ENTRADA_ITEM ei
        JOIN ENTRADA en ON en.COD_ENTRADA = ei.COD_ENTRADA AND en.COD_EMPRESA = ei.COD_EMPRESA
        WHERE ei.COD_EMPRESA = ${codEmpresa}
          AND ei.VALORUNITARIO > 0
      )
      SELECT
        emp.NOMEFANTASIA AS EMPRESA_NOME,
        pf.COD_PESSOA AS FORNECEDOR_COD_PESSOA,
        COALESCE(pf.NOME, 'SEM FORNECEDOR') AS FORNECEDOR_NOME,
        COALESCE(m.DESCRICAO, 'SEM MARCA') AS GRIFE,
        p.CODIGO AS CODIGO_BARRAS,
        p.DESCRICAO AS DESCRICAO_ITEM,
        est.QUANTIDADE_ESTOQUE,
        COALESCE(uc.CAF, 0) AS CAF,
        uc.DATA_ULTIMA_ENTRADA,
        CASE 
          WHEN v.DATA_ULTIMA_VENDA IS NULL THEN 999
          ELSE DATEDIFF(DAY, v.DATA_ULTIMA_VENDA, CURRENT_DATE)
        END AS DIAS_ESTOQUE,
        CASE
          WHEN v.QTD_VENDIDA IS NULL OR v.QTD_VENDIDA = 0 THEN 'LIQUIDAR'
          WHEN DATEDIFF(DAY, v.DATA_ULTIMA_VENDA, CURRENT_DATE) > 90 THEN 'LIQUIDAR'
          WHEN DATEDIFF(DAY, v.DATA_ULTIMA_VENDA, CURRENT_DATE) > 30 THEN 'MANTER'
          ELSE 'COMPRAR'
        END AS ACAO_SUGERIDA
      FROM estoque_empresa est
      JOIN PRODUTO p ON p.COD_PRODUTO = est.COD_PRODUTO
      JOIN EMPRESA emp ON emp.COD_EMPRESA = ${codEmpresa}
      LEFT JOIN MARCA m ON m.COD_MARCA = p.COD_MARCA
      LEFT JOIN PESSOA pf ON pf.COD_PESSOA = p.COD_FORNECEDOR
      LEFT JOIN vendas_180dias v ON v.COD_PRODUTO = p.COD_PRODUTO
      LEFT JOIN ultimo_custo uc ON uc.COD_PRODUTO = p.COD_PRODUTO
      WHERE p.ATIVO = 'T'
      ORDER BY est.QUANTIDADE_ESTOQUE DESC
    `;

    console.log('[API] GET /api/v1/estoque/analise-acao', { empresa: codEmpresa });
    const rows = await executeQuery(sql);
    
    // Normalizar campos para snake_case (padrão do frontend)
    const normalized = rows.map(row => ({
      empresa_nome: row.EMPRESA_NOME,
      fornecedor_cod_pessoa: row.FORNECEDOR_COD_PESSOA,
      fornecedor_nome: row.FORNECEDOR_NOME,
      grife: row.GRIFE,
      codigo_barras: row.CODIGO_BARRAS,
      descricao_item: row.DESCRICAO_ITEM,
      quantidade_estoque: parseInt(row.QUANTIDADE_ESTOQUE || 0),
      caf: parseFloat(row.CAF || 0),
      data_ultima_entrada: row.DATA_ULTIMA_ENTRADA,
      dias_estoque: row.DIAS_ESTOQUE,
      acao_sugerida: row.ACAO_SUGERIDA
    }));
    
    console.log('[API] /estoque/analise-acao retornou', normalized.length, 'SKUs');
    return apiResponse(res, normalized);
  } catch (error) {
    return apiResponse(res, null, error);
  }
});
```

---

## 🧪 COMO TESTAR APÓS DEPLOY

Após fazer deploy no Railway, teste com:

```bash
# Teste 1: Endpoint OTB (analise-sku)
curl "https://seu-railway-url/api/v1/vendas/analise-sku?empresa=1&dataInicio=2025-01-01&dataFim=2025-12-31"

# Teste 2: Endpoint Visão Estoque (analise-acao)
curl "https://seu-railway-url/api/v1/estoque/analise-acao?empresa=1"
```

**Validação:** Os totais de estoque de ambos endpoints devem ser idênticos para a mesma empresa.

---

## 📊 CAMPOS RETORNADOS

### `/vendas/analise-sku` (OTB):
| Campo | Descrição |
|-------|-----------|
| cod_sku | Código do produto |
| descricao_item | Descrição |
| marca | Marca do produto |
| fornecedor | Nome do fornecedor |
| tipo | Tipo (AR, GC, LG, AC, etc) |
| estoque_atual | **Quantidade em estoque** |
| qtd_produtos | Quantidade vendida no período |
| total_vendido | Valor vendido no período |

### `/estoque/analise-acao` (Visão Estoque):
| Campo | Descrição |
|-------|-----------|
| codigo_barras | Código de barras |
| descricao_item | Descrição |
| grife | Marca |
| fornecedor_nome | Nome do fornecedor |
| quantidade_estoque | **Quantidade em estoque** |
| caf | Custo de aquisição |
| dias_estoque | Dias desde última venda |
| acao_sugerida | LIQUIDAR / MANTER / COMPRAR |

---

## ⚠️ PONTOS CRÍTICOS

1. **Ambos endpoints devem usar `WHERE e.QUANTIDADE > 0`** na CTE de estoque
2. **Não somar registros negativos** - registros com quantidade <= 0 são ajustes contábeis
3. **Testar com a mesma empresa** para validar consistência

---

## 📝 CHECKLIST

- [ ] Alterar CTE `estoque_atual` no `/vendas/analise-sku` adicionando `WHERE e.QUANTIDADE > 0`
- [ ] Adicionar novo endpoint `/estoque/analise-acao` (se não existir)
- [ ] Fazer commit e push para o GitHub
- [ ] Aguardar deploy automático no Railway
- [ ] Testar ambos endpoints com mesma empresa
- [ ] Validar que os totais de estoque batem
