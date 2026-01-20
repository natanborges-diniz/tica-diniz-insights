const express = require('express');
const cors = require('cors');
const Firebird = require('node-firebird');

const app = express();
app.use(cors());
app.use(express.json());

// Configuração Firebird - usar variáveis de ambiente em produção
const firebaseConfig = {
  host: process.env.FB_HOST || '201.20.35.230',
  port: parseInt(process.env.FB_PORT || '3050'),
  database: process.env.FB_DATABASE || 'E:\\FTPBackup\\Integracao\\SPOSASCO.DATAWEB.CERT',
  user: process.env.FB_USER || 'SYSDBA',
  password: process.env.FB_PASSWORD || 'masterkey',
  lowercase_keys: false,
  role: null,
  pageSize: 4096
};

// ============================================
// CONSTANTES DE NEGÓCIO
// ============================================

// Empresas que não devem aparecer nos filtros (lixo ou sem operação)
const EMPRESAS_EXCLUIDAS = [3, 5, 7, 8, 10, 11, 12];

// Empresas que devem ser unificadas (18 -> 13 = DINIZ SUPER SHOPPING)
const EMPRESAS_UNIFICADAS = { 18: 13 };

// Mapeamento de nomes corrigidos (sobrescreve nome vindo do Firebird)
const EMPRESAS_NOMES_CORRIGIDOS = {
  6: 'DINIZ UNIÃO',
  13: 'DINIZ SUPER SHOPPING'
};

// Helper para obter cláusula WHERE de empresas ativas
function getWhereEmpresasAtivas(alias = 'e') {
  return `${alias}.codempresa NOT IN (${EMPRESAS_EXCLUIDAS.join(',')})`;
}

// Helper para executar queries
function executeQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    Firebird.attach(firebaseConfig, (err, db) => {
      if (err) {
        console.error('Erro conexão:', err);
        return reject(err);
      }
      
      db.query(sql, params, (err, result) => {
        db.detach();
        if (err) {
          console.error('Erro query:', err);
          return reject(err);
        }
        resolve(result || []);
      });
    });
  });
}

// Função para criar resposta padronizada
function apiResponse(res, data, error = null) {
  if (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      ok: false,
      data: null,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Erro inesperado no servidor',
        details: null
      }
    });
  }
  return res.json({
    ok: true,
    data: data,
    error: null
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// API v1 - Empresas (com filtro de ativas)
// ============================================
app.get('/api/v1/empresas', async (req, res) => {
  try {
    const sql = `
      SELECT 
        CODEMPRESA AS cod_empresa, 
        NOMEFANTASIA AS empresa_nome,
        CODEMPRESA AS empresa_cod_logico,
        NOMEFANTASIA AS empresa_nome_logico
      FROM EMPRESA
      WHERE ATIVO = 1
        AND ${getWhereEmpresasAtivas('EMPRESA')}
      ORDER BY NOMEFANTASIA
    `;
    
    console.log('[API] GET /api/v1/empresas');
    const rows = await executeQuery(sql);
    
    // Aplicar unificação de empresas (18 -> 13) e nomes corrigidos
    const empresasMap = new Map();
    for (const row of rows) {
      const codLogico = EMPRESAS_UNIFICADAS[row.COD_EMPRESA] || row.COD_EMPRESA;
      if (!empresasMap.has(codLogico)) {
        // Usar nome corrigido se existir, senão usar nome do Firebird
        const nomeCorrigido = EMPRESAS_NOMES_CORRIGIDOS[codLogico] || row.EMPRESA_NOME;
        empresasMap.set(codLogico, {
          cod_empresa: codLogico,
          empresa_nome: nomeCorrigido,
          empresa_cod_logico: codLogico,
          empresa_nome_logico: nomeCorrigido
        });
      }
    }
    
    const empresas = Array.from(empresasMap.values()).sort((a, b) => 
      a.empresa_nome.localeCompare(b.empresa_nome)
    );
    
    return apiResponse(res, empresas);
  } catch (error) {
    return apiResponse(res, null, error);
  }
});

// ============================================
// API v1 - Parcelas Financeiras (suporta empresa=null para TODAS)
// ============================================
app.get('/api/v1/financeiro/parcelas', async (req, res) => {
  try {
    const { dataInicio, dataFim, empresa, tipo, situacao, campoData } = req.query;

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ 
        ok: false, 
        data: null,
        error: { code: 'INVALID_PARAMS', message: 'Parâmetros obrigatórios: dataInicio, dataFim' }
      });
    }

    // Determinar campo de data para filtro
    const campoDataMap = {
      'EMISSAO': 'fl.dataemissao',
      'VENCIMENTO': 'fp.datavencimento',
      'PAGAMENTO': 'fp.datapagamento'
    };
    const campoDataField = campoDataMap[campoData] || campoDataMap['VENCIMENTO'];

    // Montar WHERE base
    let whereClauses = [
      `${campoDataField} >= '${dataInicio}'`,
      `${campoDataField} <= '${dataFim}'`,
      getWhereEmpresasAtivas('e')
    ];

    // Filtro de empresa (se informado e não for "null", "TODAS" ou vazio)
    if (empresa && empresa !== 'null' && empresa !== 'TODAS' && empresa !== '') {
      whereClauses.push(`e.codempresa = ${parseInt(empresa)}`);
    }

    // Filtro de tipo (PAGAR / RECEBER)
    if (tipo === 'PAGAR') {
      whereClauses.push("fl.pagar = 'T'");
    } else if (tipo === 'RECEBER') {
      whereClauses.push("fl.pagar = 'F'");
    }

    // Filtro de situação (calculada)
    if (situacao === 'PAGA') {
      whereClauses.push('fp.datapagamento IS NOT NULL');
    } else if (situacao === 'EM ATRASO') {
      whereClauses.push('fp.datapagamento IS NULL');
      whereClauses.push('fp.datavencimento < CURRENT_DATE');
    } else if (situacao === 'EM ABERTO') {
      whereClauses.push('fp.datapagamento IS NULL');
      whereClauses.push('fp.datavencimento >= CURRENT_DATE');
    }

    const whereSQL = whereClauses.join(' AND ');

    const sql = `
      SELECT
        e.codempresa AS cod_empresa,
        e.nomefantasia AS empresa_nome,
        fl.idfinlancamento AS cod_lancamento,
        fl.pagar AS lancamento_pagar,
        fl.previsao AS lancamento_previsao,
        fl.documento AS lancamento_documento,
        p.codpessoa AS pessoa_cod_pessoa,
        p.nome AS pessoa_nome,
        fp.idfinlancamentoparcela AS parcela_id,
        fl.dataemissao AS parcela_data_emissao,
        fp.datavencimento AS parcela_data_vencimento,
        fp.datapagamento AS parcela_data_pagamento,
        fp.datarecebimento AS parcela_data_recebimento,
        fp.valor AS parcela_valor,
        fp.valororiginal AS parcela_valor_original,
        COALESCE(fp.valorpago, 0) AS parcela_valor_pago,
        CASE
          WHEN fp.datapagamento IS NOT NULL THEN 'PAGA'
          WHEN fp.datavencimento < CURRENT_DATE THEN 'EM ATRASO'
          ELSE 'EM ABERTO'
        END AS parcela_situacao,
        cc.idfincontaclassificacao AS contacla_codigo,
        cc.numero AS contacla_numero,
        cc.descricao AS contacla_descricao,
        fpg.idformapagamento AS formapagto_codigo,
        fpt.idformapagamentotipo AS formapagto_tipo_codigo,
        fpt.descricao AS formapagto_tipo_nome
      FROM finlancamento fl
      INNER JOIN finlancamentoparcela fp ON fp.idfinlancamento = fl.idfinlancamento
      INNER JOIN empresa e ON e.codempresa = fl.codempresa
      LEFT JOIN pessoa p ON p.codpessoa = fl.codpessoa
      LEFT JOIN fincontaclassificacao cc ON cc.idfincontaclassificacao = fl.idfincontaclassificacao
      LEFT JOIN formapagamento fpg ON fpg.idformapagamento = fp.idformapagamento
      LEFT JOIN formapagamentotipo fpt ON fpt.idformapagamentotipo = fpg.idformapagamentotipo
      WHERE ${whereSQL}
      ORDER BY fp.datavencimento, fl.idfinlancamento
    `;

    console.log('[API] GET /api/v1/financeiro/parcelas', { empresa: empresa || 'TODAS', dataInicio, dataFim });
    const rows = await executeQuery(sql);
    return apiResponse(res, rows);
  } catch (error) {
    return apiResponse(res, null, error);
  }
});

// ============================================
// API v1 - DRE Gerencial (suporta empresa=null para TODAS)
// ============================================
app.get('/api/v1/financeiro/dre', async (req, res) => {
  try {
    const { dataInicio, dataFim, empresa } = req.query;

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ 
        ok: false, 
        data: null,
        error: { code: 'INVALID_PARAMS', message: 'Parâmetros obrigatórios: dataInicio, dataFim' }
      });
    }

    // Montar WHERE
    let whereClauses = [
      `fp.datavencimento >= '${dataInicio}'`,
      `fp.datavencimento <= '${dataFim}'`,
      getWhereEmpresasAtivas('e')
    ];

    // Filtro de empresa (se informado e não for "null", "TODAS" ou vazio)
    if (empresa && empresa !== 'null' && empresa !== 'TODAS' && empresa !== '') {
      whereClauses.push(`e.codempresa = ${parseInt(empresa)}`);
    }

    const whereSQL = whereClauses.join(' AND ');

    const sql = `
      SELECT
        EXTRACT(YEAR FROM fp.datavencimento) || '-' || LPAD(EXTRACT(MONTH FROM fp.datavencimento), 2, '0') AS COMPETENCIA,
        e.codempresa AS COD_EMPRESA,
        e.nomefantasia AS EMPRESA_NOME,
        cc.idfincontaclassificacao AS CONTACLA_CODIGO,
        cc.numero AS CONTACLA_NUMERO,
        cc.descricao AS CONTACLA_DESCRICAO,
        SUM(CASE WHEN fl.pagar = 'T' THEN -fp.valor ELSE fp.valor END) AS VALOR_TOTAL
      FROM finlancamento fl
      INNER JOIN finlancamentoparcela fp ON fp.idfinlancamento = fl.idfinlancamento
      INNER JOIN empresa e ON e.codempresa = fl.codempresa
      LEFT JOIN fincontaclassificacao cc ON cc.idfincontaclassificacao = fl.idfincontaclassificacao
      WHERE ${whereSQL}
      GROUP BY
        EXTRACT(YEAR FROM fp.datavencimento) || '-' || LPAD(EXTRACT(MONTH FROM fp.datavencimento), 2, '0'),
        e.codempresa, e.nomefantasia,
        cc.idfincontaclassificacao, cc.numero, cc.descricao
      ORDER BY COMPETENCIA, cc.numero
    `;

    console.log('[API] GET /api/v1/financeiro/dre', { empresa: empresa || 'TODAS', dataInicio, dataFim });
    const rows = await executeQuery(sql);
    return apiResponse(res, rows);
  } catch (error) {
    return apiResponse(res, null, error);
  }
});

// ============================================
// API v1 - Resumo por Empresa e Vendedor (com desconto)
// Query sincronizada com Railway - usa CTEs para cálculo correto
// ============================================
app.get('/api/v1/vendas/resumo-empresa-vendedor', async (req, res) => {
  try {
    const { dataInicio, dataFim, empresa, excluirCreditos } = req.query;

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ 
        ok: false, 
        data: null,
        error: { code: 'INVALID_PARAMS', message: 'Parâmetros obrigatórios: dataInicio, dataFim' }
      });
    }

    // Determinar código da empresa para parâmetros
    const codEmpresa = (!empresa || empresa === 'ALL' || empresa === 'null' || empresa === '') 
      ? 0 // 0 = todas empresas (a query usa regra no CTE)
      : parseInt(empresa);
    
    const pExcluiCreditos = excluirCreditos === '1' || excluirCreditos === 'true' ? 1 : 0;

    // Query com CTEs - parâmetros posicionais (5 parâmetros)
    const sql = `
      WITH
      P AS (
        SELECT
          CAST(${codEmpresa} AS INTEGER) AS P_EMPRESA,
          CAST(${codEmpresa} AS INTEGER) AS P_EMPRESA2,
          CAST('${dataInicio}' AS DATE) AS P_DATA_INI,
          CAST('${dataFim}' AS DATE) AS P_DATA_FIM,
          CAST(${pExcluiCreditos} AS INTEGER) AS P_EXCLUI_CREDITOS
        FROM RDB$DATABASE
      ),
      empresas_filtradas AS (
        SELECT e.COD_EMPRESA
        FROM EMPRESA e
        JOIN P ON 1=1
        WHERE e.COD_EMPRESA NOT IN (${EMPRESAS_EXCLUIDAS.join(',')})
          AND (
            P.P_EMPRESA = 0
            OR e.COD_EMPRESA = P.P_EMPRESA
            OR (
              P.P_EMPRESA2 IN (13, 18)
              AND e.COD_EMPRESA IN (13, 18)
            )
          )
      ),
      tbempresa AS (
        SELECT
          e.COD_EMPRESA,
          pe.NOME AS EMPRESA,
          CASE WHEN e.COD_EMPRESA IN (13, 18) THEN 13 ELSE e.COD_EMPRESA END AS EMPRESA_COD_LOGICO,
          CASE WHEN e.COD_EMPRESA IN (13, 18) THEN 'DINIZ SUPER' ELSE pe.NOME END AS EMPRESA_NOME_LOGICO
        FROM EMPRESA e
        JOIN PESSOA pe ON pe.COD_PESSOA = e.COD_EMPRESA
        JOIN empresas_filtradas ef ON ef.COD_EMPRESA = e.COD_EMPRESA
      ),
      itens AS (
        SELECT
          t.COD_EMPRESAESTOQUE AS COD_EMPRESA,
          s.COD_VENDEDOR AS COD_VENDEDOR,
          pv.NOME AS VENDEDOR,
          COUNT(DISTINCT t.COD_TRANSACAO) AS QTD_TRANSACAO,
          SUM(ti.QUANTIDADE) AS QTD_PRODUTOS,
          SUM(
            COALESCE(ti.VALORORIGINAL, 0)
            * COALESCE(ti.QUANTIDADE, 0)
          ) AS TOTAL_BRUTO,
          SUM(
            COALESCE(ti.TOTAL, 0)
            - COALESCE(ti.VALORDESCONTO, 0)
            - COALESCE(ti.TOTALIPI, 0)
          ) AS TOTAL_VENDIDO,
          SUM(
            (COALESCE(ti.VALORORIGINAL, 0) * COALESCE(ti.QUANTIDADE, 0))
            - (COALESCE(ti.TOTAL, 0) - COALESCE(ti.VALORDESCONTO, 0) - COALESCE(ti.TOTALIPI, 0))
          ) AS TOTAL_DESCONTO
        FROM
          P
          JOIN TRANSACAO t ON 1=1
          JOIN tbempresa emp ON emp.COD_EMPRESA = t.COD_EMPRESAESTOQUE
          JOIN SAIDA s
            ON s.COD_SAIDA = t.COD_TRANSACAO
           AND (
             s.COD_EMPRESA = t.COD_EMPRESAESTOQUE
             OR (t.COD_EMPRESA IS NOT NULL AND s.COD_EMPRESA = t.COD_EMPRESA)
           )
          JOIN PESSOA pv ON pv.COD_PESSOA = s.COD_VENDEDOR
          JOIN TRANSACAO_ITEM ti
            ON ti.COD_TRANSACAO = t.COD_TRANSACAO
           AND (
             ti.COD_EMPRESA = t.COD_EMPRESAESTOQUE
             OR (t.COD_EMPRESA IS NOT NULL AND ti.COD_EMPRESA = t.COD_EMPRESA)
           )
          JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = ti.COD_NATUREZAOPERACAO
        WHERE
          nat.TIPO = 1
          AND t.DATAENCERRAMENTO BETWEEN P.P_DATA_INI AND P.P_DATA_FIM
          AND (
            P.P_EXCLUI_CREDITOS = 0
            OR NOT EXISTS (
              SELECT 1
              FROM FINFATURATRANSACAO fft
              JOIN FINLANCAMENTO fl ON fl.COD_FATURATRANSACAO = fft.COD_FATURATRANSACAO
              JOIN FINLANCAMENTOPARCELA flp ON flp.COD_LANCAMENTO = fl.COD_LANCAMENTO
              JOIN FINFORMAPAGAMENTO ffp ON ffp.COD_FORMAPAGAMENTO = flp.COD_FORMAPAGAMENTO
              WHERE fft.COD_FATURATRANSACAO = t.COD_FATURATRANSACAO
                AND ffp.COD_FORMAPAGAMENTOTIPO = 6
            )
          )
        GROUP BY
          t.COD_EMPRESAESTOQUE,
          s.COD_VENDEDOR,
          pv.NOME
      ),
      creditos AS (
        SELECT
          t.COD_EMPRESAESTOQUE AS COD_EMPRESA,
          s.COD_VENDEDOR AS COD_VENDEDOR,
          SUM(
            COALESCE(
              IIF(flp.DATAPAGAMENTO IS NULL, flp.VALOR, flp.VALORPAGO),
              0
            )
          ) AS TOTAL_CREDITOS
        FROM
          P
          JOIN TRANSACAO t ON 1=1
          JOIN tbempresa emp ON emp.COD_EMPRESA = t.COD_EMPRESAESTOQUE
          JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
          JOIN SAIDA s
            ON s.COD_SAIDA = t.COD_TRANSACAO
           AND (
             s.COD_EMPRESA = t.COD_EMPRESAESTOQUE
             OR (t.COD_EMPRESA IS NOT NULL AND s.COD_EMPRESA = t.COD_EMPRESA)
           )
          JOIN FINFATURATRANSACAO fft ON fft.COD_FATURATRANSACAO = t.COD_FATURATRANSACAO
          JOIN FINLANCAMENTO fl ON fl.COD_FATURATRANSACAO = fft.COD_FATURATRANSACAO
          JOIN FINLANCAMENTOPARCELA flp ON flp.COD_LANCAMENTO = fl.COD_LANCAMENTO
          JOIN FINFORMAPAGAMENTO ffp ON ffp.COD_FORMAPAGAMENTO = flp.COD_FORMAPAGAMENTO
        WHERE
          nat.TIPO = 1
          AND t.DATAEMISSAO BETWEEN P.P_DATA_INI AND P.P_DATA_FIM
          AND ffp.COD_FORMAPAGAMENTOTIPO = 6
          AND P.P_EXCLUI_CREDITOS = 0
        GROUP BY
          t.COD_EMPRESAESTOQUE,
          s.COD_VENDEDOR
      )
      SELECT
        emp.COD_EMPRESA,
        emp.EMPRESA,
        emp.EMPRESA_COD_LOGICO,
        emp.EMPRESA_NOME_LOGICO,
        i.COD_VENDEDOR,
        i.VENDEDOR,
        i.QTD_TRANSACAO,
        i.QTD_PRODUTOS,
        i.TOTAL_BRUTO,
        i.TOTAL_VENDIDO,
        i.TOTAL_DESCONTO,
        CASE
          WHEN i.TOTAL_BRUTO = 0 THEN 0
          ELSE (i.TOTAL_DESCONTO / NULLIF(i.TOTAL_BRUTO, 0)) * 100
        END AS PERC_DESCONTO,
        COALESCE(c.TOTAL_CREDITOS, 0) AS TOTAL_CREDITOS,
        (i.TOTAL_VENDIDO - COALESCE(c.TOTAL_CREDITOS, 0)) AS TOTAL_VENDIDO_SEM_CREDITOS
      FROM
        itens i
        JOIN tbempresa emp ON emp.COD_EMPRESA = i.COD_EMPRESA
        LEFT JOIN creditos c
          ON c.COD_EMPRESA = i.COD_EMPRESA
         AND c.COD_VENDEDOR = i.COD_VENDEDOR
      ORDER BY
        emp.EMPRESA_COD_LOGICO,
        i.VENDEDOR
    `;

    console.log('[API] GET /api/v1/vendas/resumo-empresa-vendedor', { empresa: empresa || 'ALL', dataInicio, dataFim, excluirCreditos: pExcluiCreditos });
    const rows = await executeQuery(sql);
    return apiResponse(res, rows);
  } catch (error) {
    return apiResponse(res, null, error);
  }
});

// ============================================
// API v1 - Resumo por Forma de Pagamento
// Query sincronizada com Railway - usa CTEs com cálculo proporcional
// ============================================
app.get('/api/v1/vendas/resumo-formas-pagamento', async (req, res) => {
  try {
    const { dataInicio, dataFim, empresa, excluirCreditos, incluirDevolucoes } = req.query;

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ 
        ok: false, 
        data: null,
        error: { code: 'INVALID_PARAMS', message: 'Parâmetros obrigatórios: dataInicio, dataFim' }
      });
    }

    // Determinar código da empresa para parâmetros
    const codEmpresa = (!empresa || empresa === 'ALL' || empresa === 'null' || empresa === '') 
      ? 0 // 0 = todas empresas
      : parseInt(empresa);
    
    const pExcluiCreditos = excluirCreditos === '1' || excluirCreditos === 'true' ? 1 : 0;
    const pIncluiDevolucoes = incluirDevolucoes === '1' || incluirDevolucoes === 'true' ? 1 : 0;

    // Query com CTEs - 10 parâmetros (empresa×2, datas vendas, datas convênio, datas devolução, flags)
    const sql = `
      WITH
      P AS (
        SELECT
          CAST(${codEmpresa} AS INTEGER) AS P_EMPRESA,
          CAST('${dataInicio}' AS DATE) AS P_DATA_VENDAS_INI,
          CAST('${dataFim}' AS DATE) AS P_DATA_VENDAS_FIM,
          CAST(${pExcluiCreditos} AS INTEGER) AS P_EXCLUI_CREDITOS,
          CAST(${pIncluiDevolucoes} AS INTEGER) AS P_INCLUI_DEVOLUCOES
        FROM RDB$DATABASE
      ),
      empresas_filtradas AS (
        SELECT e.COD_EMPRESA
        FROM EMPRESA e
        WHERE e.COD_EMPRESA NOT IN (${EMPRESAS_EXCLUIDAS.join(',')})
          ${codEmpresa === 0 ? '' : `AND (e.COD_EMPRESA = ${codEmpresa} OR (${codEmpresa} IN (13, 18) AND e.COD_EMPRESA IN (13, 18)))`}
      ),
      tbempresa AS (
        SELECT
          e.COD_EMPRESA,
          p.NOME AS EMPRESA,
          CASE WHEN e.COD_EMPRESA IN (13, 18) THEN 13 ELSE e.COD_EMPRESA END AS EMPRESA_COD_LOGICO,
          CASE WHEN e.COD_EMPRESA IN (13, 18) THEN 'DINIZ SUPER' ELSE p.NOME END AS EMPRESA_NOME_LOGICO
        FROM EMPRESA e
        JOIN PESSOA p ON p.COD_PESSOA = e.COD_EMPRESA
        JOIN empresas_filtradas ef ON ef.COD_EMPRESA = e.COD_EMPRESA
      ),
      transacoes_vendas AS (
        SELECT 
          t.COD_TRANSACAO,
          t.COD_EMPRESA,
          t.COD_EMPRESAESTOQUE,
          t.COD_FATURATRANSACAO,
          t.DATAEMISSAO
        FROM TRANSACAO t
        JOIN empresas_filtradas ef ON ef.COD_EMPRESA = t.COD_EMPRESAESTOQUE
        JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
        WHERE nat.TIPO = 1
          AND t.DATAEMISSAO BETWEEN '${dataInicio}' AND '${dataFim}'
      ),
      itens_por_transacao AS (
        SELECT
          ti.COD_TRANSACAO,
          ti.COD_EMPRESA,
          SUM(COALESCE(ti.VALORORIGINAL, 0) * COALESCE(ti.QUANTIDADE, 0)) AS TOTAL_BRUTO,
          SUM(COALESCE(ti.TOTAL, 0) - COALESCE(ti.TOTALIPI, 0)) AS TOTAL_VENDIDO
        FROM TRANSACAO_ITEM ti
        WHERE EXISTS (SELECT 1 FROM transacoes_vendas tv WHERE tv.COD_TRANSACAO = ti.COD_TRANSACAO AND tv.COD_EMPRESA = ti.COD_EMPRESA)
        GROUP BY ti.COD_TRANSACAO, ti.COD_EMPRESA
      ),
      pagamentos_por_transacao AS (
        SELECT
          tv.COD_TRANSACAO,
          tv.COD_EMPRESA,
          ffp.COD_FORMAPAGAMENTOTIPO,
          SUM(
            COALESCE(
              IIF(flp.DATAPAGAMENTO IS NULL, flp.VALOR, flp.VALORPAGO),
              0
            )
          ) AS TOTAL_PAGO_FORMA
        FROM transacoes_vendas tv
        JOIN FINFATURATRANSACAO fft ON fft.COD_FATURATRANSACAO = tv.COD_FATURATRANSACAO
        JOIN FINLANCAMENTO fl ON fl.COD_FATURATRANSACAO = fft.COD_FATURATRANSACAO
        JOIN FINLANCAMENTOPARCELA flp ON flp.COD_LANCAMENTO = fl.COD_LANCAMENTO
        JOIN FINFORMAPAGAMENTO ffp ON ffp.COD_FORMAPAGAMENTO = flp.COD_FORMAPAGAMENTO
        GROUP BY tv.COD_TRANSACAO, tv.COD_EMPRESA, ffp.COD_FORMAPAGAMENTOTIPO
      ),
      pagamentos_totais AS (
        SELECT
          COD_TRANSACAO,
          COD_EMPRESA,
          SUM(TOTAL_PAGO_FORMA) AS TOTAL_PAGO_TRANSACAO
        FROM pagamentos_por_transacao
        GROUP BY COD_TRANSACAO, COD_EMPRESA
      )
      
      SELECT
        emp.EMPRESA,
        emp.EMPRESA_COD_LOGICO,
        emp.EMPRESA_NOME_LOGICO,
        vendedor.NOME AS VENDEDOR,
        CASE pag.COD_FORMAPAGAMENTOTIPO
          WHEN 1 THEN 'DINHEIRO'
          WHEN 2 THEN 'CHEQUE'
          WHEN 3 THEN
            CASE
              WHEN fct.CREDITO = 'T' THEN 'CARTAO CREDITO'
              ELSE 'CARTAO DEBITO'
            END
          WHEN 4 THEN 'BANCO'
          WHEN 5 THEN 'CARNE'
          WHEN 6 THEN 'CREDITOS'
          ELSE 'OUTROS'
        END AS FORMAPAGAMENTO,
        SUM(pag.TOTAL_PAGO_FORMA) AS TOTALGERAL,
        COUNT(DISTINCT tv.COD_TRANSACAO) AS QTD_VENDAS,
        SUM(
          COALESCE(itens.TOTAL_BRUTO, 0)
          * pag.TOTAL_PAGO_FORMA
          / NULLIF(pt.TOTAL_PAGO_TRANSACAO, 0)
        ) AS TOTAL_BRUTO,
        SUM(
          (COALESCE(itens.TOTAL_BRUTO, 0) - COALESCE(itens.TOTAL_VENDIDO, 0))
          * pag.TOTAL_PAGO_FORMA
          / NULLIF(pt.TOTAL_PAGO_TRANSACAO, 0)
        ) AS TOTAL_DESCONTO,
        CASE
          WHEN SUM(COALESCE(itens.TOTAL_BRUTO, 0)) = 0 THEN 0
          ELSE (
            SUM(
              (COALESCE(itens.TOTAL_BRUTO, 0) - COALESCE(itens.TOTAL_VENDIDO, 0))
              * pag.TOTAL_PAGO_FORMA
              / NULLIF(pt.TOTAL_PAGO_TRANSACAO, 0)
            )
            / NULLIF(
              SUM(
                COALESCE(itens.TOTAL_BRUTO, 0)
                * pag.TOTAL_PAGO_FORMA
                / NULLIF(pt.TOTAL_PAGO_TRANSACAO, 0)
              ),
              0
            )
          ) * 100
        END AS PERC_DESCONTO
      FROM transacoes_vendas tv
      JOIN tbempresa emp ON emp.COD_EMPRESA = tv.COD_EMPRESAESTOQUE
      JOIN SAIDA s ON s.COD_SAIDA = tv.COD_TRANSACAO AND s.COD_EMPRESA = tv.COD_EMPRESA
      JOIN PESSOA vendedor ON vendedor.COD_PESSOA = s.COD_VENDEDOR
      JOIN pagamentos_por_transacao pag ON pag.COD_TRANSACAO = tv.COD_TRANSACAO AND pag.COD_EMPRESA = tv.COD_EMPRESA
      JOIN pagamentos_totais pt ON pt.COD_TRANSACAO = tv.COD_TRANSACAO AND pt.COD_EMPRESA = tv.COD_EMPRESA
      LEFT JOIN itens_por_transacao itens ON itens.COD_TRANSACAO = tv.COD_TRANSACAO AND itens.COD_EMPRESA = tv.COD_EMPRESA
      LEFT JOIN FINFORMAPAGAMENTO ffp ON ffp.COD_FORMAPAGAMENTOTIPO = pag.COD_FORMAPAGAMENTOTIPO
      LEFT JOIN FINFORMAPAGAMENTOCARTAO ffc ON ffc.COD_FORMAPAGAMENTOCARTAO = ffp.COD_FORMAPAGAMENTO
      LEFT JOIN FINCARTAOCREDITOTIPO fct ON fct.COD_CARTAOCREDITOTIPO = ffc.COD_CARTAOCREDITOTIPO
      WHERE (${pExcluiCreditos} = 0 OR pag.COD_FORMAPAGAMENTOTIPO <> 6)
      GROUP BY
        emp.EMPRESA,
        emp.EMPRESA_COD_LOGICO,
        emp.EMPRESA_NOME_LOGICO,
        vendedor.NOME,
        CASE pag.COD_FORMAPAGAMENTOTIPO
          WHEN 1 THEN 'DINHEIRO'
          WHEN 2 THEN 'CHEQUE'
          WHEN 3 THEN
            CASE
              WHEN fct.CREDITO = 'T' THEN 'CARTAO CREDITO'
              ELSE 'CARTAO DEBITO'
            END
          WHEN 4 THEN 'BANCO'
          WHEN 5 THEN 'CARNE'
          WHEN 6 THEN 'CREDITOS'
          ELSE 'OUTROS'
        END
      
      UNION ALL
      
      SELECT
        emp.EMPRESA,
        emp.EMPRESA_COD_LOGICO,
        emp.EMPRESA_NOME_LOGICO,
        vendedor.NOME AS VENDEDOR,
        'CONVENIO' AS FORMAPAGAMENTO,
        SUM(tcp.VALOR) AS TOTALGERAL,
        COUNT(DISTINCT t.COD_TRANSACAO) AS QTD_VENDAS,
        SUM(COALESCE(itens.TOTAL_BRUTO, 0)) AS TOTAL_BRUTO,
        SUM(COALESCE(itens.TOTAL_BRUTO, 0) - COALESCE(itens.TOTAL_VENDIDO, 0)) AS TOTAL_DESCONTO,
        CASE
          WHEN SUM(COALESCE(itens.TOTAL_BRUTO, 0)) = 0 THEN 0
          ELSE (
            SUM(COALESCE(itens.TOTAL_BRUTO, 0) - COALESCE(itens.TOTAL_VENDIDO, 0))
            / NULLIF(SUM(COALESCE(itens.TOTAL_BRUTO, 0)), 0)
          ) * 100
        END AS PERC_DESCONTO
      FROM TRANSACAO t
      JOIN empresas_filtradas ef ON ef.COD_EMPRESA = t.COD_EMPRESAESTOQUE
      JOIN tbempresa emp ON emp.COD_EMPRESA = t.COD_EMPRESAESTOQUE
      JOIN TRANSACAOCONVENIOPARCELA tcp ON tcp.COD_TRANSACAO = t.COD_TRANSACAO AND tcp.COD_EMPRESA = t.COD_EMPRESA
      JOIN SAIDA s ON s.COD_SAIDA = t.COD_TRANSACAO AND s.COD_EMPRESA = t.COD_EMPRESA
      JOIN PESSOA vendedor ON vendedor.COD_PESSOA = s.COD_VENDEDOR
      LEFT JOIN itens_por_transacao itens ON itens.COD_TRANSACAO = t.COD_TRANSACAO AND itens.COD_EMPRESA = t.COD_EMPRESA
      WHERE t.DATAEMISSAO BETWEEN '${dataInicio}' AND '${dataFim}'
      GROUP BY
        emp.EMPRESA,
        emp.EMPRESA_COD_LOGICO,
        emp.EMPRESA_NOME_LOGICO,
        vendedor.NOME
      
      UNION ALL
      
      SELECT
        emp.EMPRESA,
        emp.EMPRESA_COD_LOGICO,
        emp.EMPRESA_NOME_LOGICO,
        vendedor.NOME AS VENDEDOR,
        'DEVOLUCAO' AS FORMAPAGAMENTO,
        SUM(td.TOTAL) * -1 AS TOTALGERAL,
        COUNT(DISTINCT td.COD_TRANSACAO) AS QTD_VENDAS,
        SUM(COALESCE(itens.TOTAL_BRUTO, 0)) * -1 AS TOTAL_BRUTO,
        SUM(COALESCE(itens.TOTAL_BRUTO, 0) - COALESCE(itens.TOTAL_VENDIDO, 0)) * -1 AS TOTAL_DESCONTO,
        CASE
          WHEN SUM(COALESCE(itens.TOTAL_BRUTO, 0)) = 0 THEN 0
          ELSE (
            SUM(COALESCE(itens.TOTAL_BRUTO, 0) - COALESCE(itens.TOTAL_VENDIDO, 0))
            / NULLIF(SUM(COALESCE(itens.TOTAL_BRUTO, 0)), 0)
          ) * 100
        END AS PERC_DESCONTO
      FROM TRANSACAO td
      JOIN empresas_filtradas ef ON ef.COD_EMPRESA = td.COD_EMPRESAESTOQUE
      JOIN tbempresa emp ON emp.COD_EMPRESA = td.COD_EMPRESAESTOQUE
      JOIN ENTRADANOTAFISCALDEVOLUCAO enfd ON td.COD_TRANSACAO = enfd.COD_ENTRADANOTAFISCALDEVOLUCAO AND td.COD_EMPRESA = enfd.COD_EMPRESA
      JOIN PESSOA vendedor ON vendedor.COD_PESSOA = enfd.COD_VENDEDOR
      LEFT JOIN itens_por_transacao itens ON itens.COD_TRANSACAO = td.COD_TRANSACAO AND itens.COD_EMPRESA = td.COD_EMPRESA
      WHERE ${pIncluiDevolucoes} = 1
        AND td.DATAENCERRAMENTO BETWEEN '${dataInicio}' AND '${dataFim}'
      GROUP BY
        emp.EMPRESA,
        emp.EMPRESA_COD_LOGICO,
        emp.EMPRESA_NOME_LOGICO,
        vendedor.NOME
    `;

    console.log('[API] GET /api/v1/vendas/resumo-formas-pagamento', { empresa: empresa || 'ALL', dataInicio, dataFim, excluirCreditos: pExcluiCreditos, incluirDevolucoes: pIncluiDevolucoes });
    const rows = await executeQuery(sql);
    return apiResponse(res, rows);
  } catch (error) {
    return apiResponse(res, null, error);
  }
});

// ============================================
// API v1 - Resumo Diário Simples (para sincronização de cache)
// Query CORRIGIDA: Usa COD_TRANSACAO + COD_EMPRESA como chave única
// ============================================
app.get('/api/v1/vendas/resumo-diario-simples', async (req, res) => {
  try {
    const { dataInicio, dataFim, empresa, excluirCreditos } = req.query;

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ 
        ok: false, 
        data: null,
        error: { code: 'INVALID_PARAMS', message: 'Parâmetros obrigatórios: dataInicio, dataFim' }
      });
    }

    const codEmpresa = (!empresa || empresa === 'ALL' || empresa === 'null' || empresa === '') 
      ? 0 
      : parseInt(empresa);
    
    const pExcluiCreditos = excluirCreditos === '1' || excluirCreditos === 'true' ? 1 : 0;

    // Query CORRIGIDA - agrupa por transação primeiro para evitar multiplicação
    const sql = `
      WITH
      empresas_filtradas AS (
        SELECT e.COD_EMPRESA
        FROM EMPRESA e
        WHERE e.COD_EMPRESA NOT IN (${EMPRESAS_EXCLUIDAS.join(',')})
          ${codEmpresa === 0 ? '' : `AND (e.COD_EMPRESA = ${codEmpresa} OR (${codEmpresa} IN (13, 18) AND e.COD_EMPRESA IN (13, 18)))`}
      ),
      transacoes AS (
        SELECT 
          t.COD_TRANSACAO,
          t.COD_EMPRESA,
          CAST(t.DATAEMISSAO AS DATE) AS DATA_VENDA,
          CASE WHEN t.COD_EMPRESAESTOQUE IN (13, 18) THEN 13 ELSE t.COD_EMPRESAESTOQUE END AS COD_EMPRESA_LOGICO,
          t.COD_FATURATRANSACAO
        FROM TRANSACAO t
        JOIN empresas_filtradas ef ON ef.COD_EMPRESA = t.COD_EMPRESAESTOQUE
        JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
        WHERE nat.TIPO = 1
          AND t.DATAEMISSAO >= '${dataInicio}'
          AND t.DATAEMISSAO <= '${dataFim}'
      ),
      itens_por_transacao AS (
        SELECT
          ti.COD_TRANSACAO,
          ti.COD_EMPRESA,
          SUM(COALESCE(ti.VALORORIGINAL, 0) * COALESCE(ti.QUANTIDADE, 0)) AS TOTAL_BRUTO,
          SUM(COALESCE(ti.TOTAL, 0) - COALESCE(ti.TOTALIPI, 0)) AS TOTAL_VENDIDO
        FROM TRANSACAO_ITEM ti
        WHERE EXISTS (SELECT 1 FROM transacoes t WHERE t.COD_TRANSACAO = ti.COD_TRANSACAO AND t.COD_EMPRESA = ti.COD_EMPRESA)
        GROUP BY ti.COD_TRANSACAO, ti.COD_EMPRESA
      ),
      vendedores AS (
        SELECT 
          s.COD_SAIDA AS COD_TRANSACAO,
          s.COD_EMPRESA,
          p.NOME AS VENDEDOR
        FROM SAIDA s
        JOIN PESSOA p ON p.COD_PESSOA = s.COD_VENDEDOR
        WHERE EXISTS (SELECT 1 FROM transacoes t WHERE t.COD_TRANSACAO = s.COD_SAIDA AND t.COD_EMPRESA = s.COD_EMPRESA)
      ),
      pagamentos AS (
        SELECT
          t.COD_TRANSACAO,
          t.COD_EMPRESA,
          ffp.COD_FORMAPAGAMENTOTIPO,
          SUM(COALESCE(IIF(flp.DATAPAGAMENTO IS NULL, flp.VALOR, flp.VALORPAGO), 0)) AS TOTAL_PAGO
        FROM transacoes t
        JOIN FINFATURATRANSACAO fft ON fft.COD_FATURATRANSACAO = t.COD_FATURATRANSACAO
        JOIN FINLANCAMENTO fl ON fl.COD_FATURATRANSACAO = fft.COD_FATURATRANSACAO
        JOIN FINLANCAMENTOPARCELA flp ON flp.COD_LANCAMENTO = fl.COD_LANCAMENTO
        JOIN FINFORMAPAGAMENTO ffp ON ffp.COD_FORMAPAGAMENTO = flp.COD_FORMAPAGAMENTO
        GROUP BY t.COD_TRANSACAO, t.COD_EMPRESA, ffp.COD_FORMAPAGAMENTOTIPO
      ),
      pagamentos_totais AS (
        SELECT COD_TRANSACAO, COD_EMPRESA, SUM(TOTAL_PAGO) AS TOTAL_TRANSACAO
        FROM pagamentos
        GROUP BY COD_TRANSACAO, COD_EMPRESA
      )
      SELECT
        t.DATA_VENDA,
        t.COD_EMPRESA_LOGICO AS COD_EMPRESA,
        v.VENDEDOR,
        CASE p.COD_FORMAPAGAMENTOTIPO
          WHEN 1 THEN 'DINHEIRO'
          WHEN 2 THEN 'CHEQUE'
          WHEN 3 THEN 
            CASE WHEN fct.CREDITO = 'T' THEN 'CARTAO CREDITO' ELSE 'CARTAO DEBITO' END
          WHEN 4 THEN 'BANCO'
          WHEN 5 THEN 'CARNE'
          WHEN 6 THEN 'CREDITOS'
          ELSE 'OUTROS'
        END AS FORMAPAGAMENTO,
        COUNT(DISTINCT t.COD_TRANSACAO || '-' || t.COD_EMPRESA) AS QTD_VENDAS,
        SUM(COALESCE(i.TOTAL_BRUTO, 0) * p.TOTAL_PAGO / NULLIF(pt.TOTAL_TRANSACAO, 0)) AS TOTAL_BRUTO,
        SUM(COALESCE(i.TOTAL_VENDIDO, 0) * p.TOTAL_PAGO / NULLIF(pt.TOTAL_TRANSACAO, 0)) AS TOTAL_VENDIDO,
        SUM((COALESCE(i.TOTAL_BRUTO, 0) - COALESCE(i.TOTAL_VENDIDO, 0)) * p.TOTAL_PAGO / NULLIF(pt.TOTAL_TRANSACAO, 0)) AS TOTAL_DESCONTO
      FROM transacoes t
      JOIN vendedores v ON v.COD_TRANSACAO = t.COD_TRANSACAO AND v.COD_EMPRESA = t.COD_EMPRESA
      JOIN itens_por_transacao i ON i.COD_TRANSACAO = t.COD_TRANSACAO AND i.COD_EMPRESA = t.COD_EMPRESA
      JOIN pagamentos p ON p.COD_TRANSACAO = t.COD_TRANSACAO AND p.COD_EMPRESA = t.COD_EMPRESA
      JOIN pagamentos_totais pt ON pt.COD_TRANSACAO = t.COD_TRANSACAO AND pt.COD_EMPRESA = t.COD_EMPRESA
      LEFT JOIN FINFORMAPAGAMENTO ffp ON ffp.COD_FORMAPAGAMENTOTIPO = p.COD_FORMAPAGAMENTOTIPO
      LEFT JOIN FINFORMAPAGAMENTOCARTAO ffc ON ffc.COD_FORMAPAGAMENTOCARTAO = ffp.COD_FORMAPAGAMENTO
      LEFT JOIN FINCARTAOCREDITOTIPO fct ON fct.COD_CARTAOCREDITOTIPO = ffc.COD_CARTAOCREDITOTIPO
      WHERE (${pExcluiCreditos} = 0 OR p.COD_FORMAPAGAMENTOTIPO <> 6)
      GROUP BY
        t.DATA_VENDA,
        t.COD_EMPRESA_LOGICO,
        v.VENDEDOR,
        CASE p.COD_FORMAPAGAMENTOTIPO
          WHEN 1 THEN 'DINHEIRO'
          WHEN 2 THEN 'CHEQUE'
          WHEN 3 THEN 
            CASE WHEN fct.CREDITO = 'T' THEN 'CARTAO CREDITO' ELSE 'CARTAO DEBITO' END
          WHEN 4 THEN 'BANCO'
          WHEN 5 THEN 'CARNE'
          WHEN 6 THEN 'CREDITOS'
          ELSE 'OUTROS'
        END
      ORDER BY t.DATA_VENDA, t.COD_EMPRESA_LOGICO, v.VENDEDOR
    `;

    console.log('[API] GET /api/v1/vendas/resumo-diario-simples', { empresa: empresa || 'ALL', dataInicio, dataFim, excluirCreditos: pExcluiCreditos });
    const rows = await executeQuery(sql);
    return apiResponse(res, rows);
  } catch (error) {
    return apiResponse(res, null, error);
  }
});

// ============================================
// ENDPOINTS LEGADOS (mantidos para compatibilidade)
// ============================================

// KPIs do Dashboard - replica a query original
app.get('/api/kpis', async (req, res) => {
  try {
    const { dataInicio, dataFim, codEmpresa } = req.query;
    
    if (!dataInicio || !dataFim) {
      return res.status(400).json({ error: 'dataInicio e dataFim são obrigatórios' });
    }

    let whereEmpresa = '';
    if (codEmpresa) {
      whereEmpresa = `AND t.CODEMPRESA = ${parseInt(codEmpresa)}`;
    }

    const sql = `
      SELECT 
        COUNT(DISTINCT t.IDTRANSACAO) as quantidade_vendas,
        SUM(ti.VALORORIGINAL - COALESCE(ti.VALORDESCONTO, 0) + COALESCE(ti.TOTALIPI, 0)) as faturamento_total,
        COUNT(DISTINCT t.CODEMPRESA) as lojas_ativas
      FROM TRANSACAO t
      INNER JOIN TRANSACAO_ITEM ti ON ti.IDTRANSACAO = t.IDTRANSACAO
      INNER JOIN NATUREZAOPERACAO no ON no.IDNATUREZAOPERACAO = t.IDNATUREZAOPERACAO
      WHERE no.TIPO = 1
        AND t.DATAEMISSAO >= '${dataInicio}'
        AND t.DATAEMISSAO <= '${dataFim}'
        ${whereEmpresa}
    `;

    const result = await executeQuery(sql);
    const row = result[0] || {};
    
    const faturamentoTotal = parseFloat(row.FATURAMENTO_TOTAL || 0);
    const quantidadeVendas = parseInt(row.QUANTIDADE_VENDAS || 0);
    
    res.json({
      faturamentoTotal,
      quantidadeVendas,
      ticketMedio: quantidadeVendas > 0 ? faturamentoTotal / quantidadeVendas : 0,
      lojasAtivas: parseInt(row.LOJAS_ATIVAS || 0)
    });
  } catch (error) {
    console.error('Erro /api/kpis:', error);
    res.status(500).json({ error: error.message });
  }
});

// Vendas por dia - para gráfico de linha
app.get('/api/vendas-por-dia', async (req, res) => {
  try {
    const { dataInicio, dataFim, codEmpresa } = req.query;
    
    if (!dataInicio || !dataFim) {
      return res.status(400).json({ error: 'dataInicio e dataFim são obrigatórios' });
    }

    let whereEmpresa = '';
    if (codEmpresa) {
      whereEmpresa = `AND t.CODEMPRESA = ${parseInt(codEmpresa)}`;
    }

    const sql = `
      SELECT 
        CAST(t.DATAEMISSAO AS DATE) as data,
        SUM(ti.VALORORIGINAL - COALESCE(ti.VALORDESCONTO, 0) + COALESCE(ti.TOTALIPI, 0)) as faturamento
      FROM TRANSACAO t
      INNER JOIN TRANSACAO_ITEM ti ON ti.IDTRANSACAO = t.IDTRANSACAO
      INNER JOIN NATUREZAOPERACAO no ON no.IDNATUREZAOPERACAO = t.IDNATUREZAOPERACAO
      WHERE no.TIPO = 1
        AND t.DATAEMISSAO >= '${dataInicio}'
        AND t.DATAEMISSAO <= '${dataFim}'
        ${whereEmpresa}
      GROUP BY CAST(t.DATAEMISSAO AS DATE)
      ORDER BY 1
    `;

    const result = await executeQuery(sql);
    
    res.json(result.map(row => ({
      data: row.DATA,
      faturamento: parseFloat(row.FATURAMENTO || 0)
    })));
  } catch (error) {
    console.error('Erro /api/vendas-por-dia:', error);
    res.status(500).json({ error: error.message });
  }
});

// Vendas por loja - para gráfico de barras e ranking
app.get('/api/vendas-por-loja', async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    
    if (!dataInicio || !dataFim) {
      return res.status(400).json({ error: 'dataInicio e dataFim são obrigatórios' });
    }

    const sql = `
      SELECT 
        e.CODEMPRESA as cod_empresa,
        e.NOMEFANTASIA as loja,
        COUNT(DISTINCT t.IDTRANSACAO) as quantidade,
        SUM(ti.VALORORIGINAL - COALESCE(ti.VALORDESCONTO, 0) + COALESCE(ti.TOTALIPI, 0)) as faturamento
      FROM TRANSACAO t
      INNER JOIN TRANSACAO_ITEM ti ON ti.IDTRANSACAO = t.IDTRANSACAO
      INNER JOIN NATUREZAOPERACAO no ON no.IDNATUREZAOPERACAO = t.IDNATUREZAOPERACAO
      INNER JOIN EMPRESA e ON e.CODEMPRESA = t.CODEMPRESA
      WHERE no.TIPO = 1
        AND t.DATAEMISSAO >= '${dataInicio}'
        AND t.DATAEMISSAO <= '${dataFim}'
      GROUP BY e.CODEMPRESA, e.NOMEFANTASIA
      ORDER BY 4 DESC
    `;

    const result = await executeQuery(sql);
    const totalGeral = result.reduce((sum, row) => sum + parseFloat(row.FATURAMENTO || 0), 0);
    
    res.json(result.map(row => {
      const faturamento = parseFloat(row.FATURAMENTO || 0);
      const quantidade = parseInt(row.QUANTIDADE || 0);
      return {
        codEmpresa: row.COD_EMPRESA,
        loja: row.LOJA,
        quantidade,
        faturamento,
        ticketMedio: quantidade > 0 ? faturamento / quantidade : 0,
        percentual: totalGeral > 0 ? (faturamento / totalGeral) * 100 : 0
      };
    }));
  } catch (error) {
    console.error('Erro /api/vendas-por-loja:', error);
    res.status(500).json({ error: error.message });
  }
});

// Lista de empresas/lojas (legado)
app.get('/api/empresas', async (req, res) => {
  try {
    const sql = `
      SELECT CODEMPRESA as cod_empresa, NOMEFANTASIA as nome_fantasia, CIDADE, UF
      FROM EMPRESA
      WHERE ATIVO = 1
      ORDER BY NOMEFANTASIA
    `;
    
    const result = await executeQuery(sql);
    res.json(result.map(row => ({
      codEmpresa: row.COD_EMPRESA,
      nomeFantasia: row.NOME_FANTASIA,
      cidade: row.CIDADE,
      uf: row.UF
    })));
  } catch (error) {
    console.error('Erro /api/empresas:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Firebird Bridge rodando na porta ${PORT}`);
  console.log(`Empresas excluídas: ${EMPRESAS_EXCLUIDAS.join(', ')}`);
});
