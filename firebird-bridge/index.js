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

// Helper para obter cláusula WHERE de empresas ativas
function getWhereEmpresasAtivas(alias = 'e') {
  return `${alias}.codempresa NOT IN (${EMPRESAS_EXCLUIDAS.join(',')})`;
}

// ============================================
// HELPERS DE RESPOSTA v2 — ENVELOPE PADRONIZADO
// ============================================

/**
 * Retorna resposta de sucesso no formato envelope v2
 * @param {Response} res - Express response
 * @param {Array} data - Array de dados
 * @param {Object} meta - Metadados opcionais (elapsed_ms, endpoint, etc.)
 */
function success(res, data, meta = {}) {
  return res.json({
    ok: true,
    data: data,
    error: null,
    meta: { count: data.length, ...meta }
  });
}

/**
 * Retorna resposta de erro no formato envelope v2
 * @param {Response} res - Express response
 * @param {string} code - Código de erro padronizado (VALIDATION_ERROR, FIREBIRD_TIMEOUT, etc.)
 * @param {string} message - Mensagem legível para o usuário
 * @param {number} statusCode - HTTP status code
 * @param {*} details - Detalhes adicionais de debug (opcional)
 */
function error(res, code, message, statusCode = 500, details = null) {
  return res.status(statusCode).json({
    ok: false,
    data: null,
    error: { code, message },
    ...(details && { details })
  });
}

/**
 * Classifica um erro do Firebird/Node em código padronizado
 * @param {Error} err - O erro capturado
 * @returns {{ code: string, statusCode: number, message: string }}
 */
function classifyError(err) {
  const msg = (err.message || '').toLowerCase();

  // Timeout do Firebird
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('econnreset') || msg.includes('epipe')) {
    return {
      code: 'FIREBIRD_TIMEOUT',
      statusCode: 503,
      message: 'Firebird não respondeu a tempo. Tente novamente em alguns segundos.'
    };
  }

  // Conexão recusada / Firebird offline
  if (msg.includes('econnrefused') || msg.includes('connection refused') || msg.includes('unable to complete')) {
    return {
      code: 'FIREBIRD_DISCONNECTED',
      statusCode: 503,
      message: 'Sem conexão com o banco de dados Firebird. Verifique o status do servidor.'
    };
  }

  // Erro de query SQL
  if (msg.includes('dynamic sql error') || msg.includes('dsql') || msg.includes('token unknown') || msg.includes('column unknown')) {
    return {
      code: 'QUERY_ERROR',
      statusCode: 500,
      message: 'Erro na execução da consulta SQL.'
    };
  }

  // Fallback genérico
  return {
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    message: err.message || 'Erro inesperado no servidor.'
  };
}

// Variável para rastrear versão da bridge
const BRIDGE_VERSION = '2.4.0';

// Helper para executar queries com timeout
const QUERY_TIMEOUT_MS = parseInt(process.env.QUERY_TIMEOUT_MS || '30000');

function executeQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Firebird query timeout: operação excedeu ' + QUERY_TIMEOUT_MS + 'ms'));
    }, QUERY_TIMEOUT_MS);

    Firebird.attach(firebaseConfig, (err, db) => {
      if (err) {
        clearTimeout(timer);
        console.error('Erro conexão:', err);
        return reject(err);
      }
      
      db.query(sql, params, (err, result) => {
        clearTimeout(timer);
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

// ============================================
// Health check — formato v2
// ============================================
app.get('/health', (req, res) => {
  // Liveness check simples (processo Node está rodando)
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: BRIDGE_VERSION });
});

app.get('/api/v1/health', async (req, res) => {
  const start = Date.now();
  const dbTimeoutMs = parseInt(process.env.HEALTH_DB_TIMEOUT_MS || '800');

  try {
    // Readiness check: tenta query simples no Firebird
    const testPromise = executeQuery('SELECT 1 AS TEST_VAL FROM RDB$DATABASE');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Health check timeout')), dbTimeoutMs)
    );

    await Promise.race([testPromise, timeoutPromise]);
    const elapsed = Date.now() - start;

    return success(res, [{
      status: 'up',
      firebird: 'connected',
      latency_ms: elapsed,
      version: BRIDGE_VERSION
    }], { elapsed_ms: elapsed, endpoint: '/api/v1/health' });
  } catch (err) {
    const elapsed = Date.now() - start;
    // Bridge está online mas Firebird inacessível = degraded
    return res.status(503).json({
      ok: true, // Bridge process is running
      data: [{
        status: 'degraded',
        firebird: 'disconnected',
        latency_ms: elapsed,
        version: BRIDGE_VERSION,
        error_detail: err.message
      }],
      error: null,
      meta: { elapsed_ms: elapsed, endpoint: '/api/v1/health' }
    });
  }
});

// ============================================
// API v1 - Empresas (com filtro de ativas)
// ============================================
app.get('/api/v1/empresas', async (req, res) => {
  try {
    const start = Date.now();
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
    
    const empresas = rows.map(row => ({
      cod_empresa: row.COD_EMPRESA,
      empresa_nome: row.EMPRESA_NOME,
      empresa_cod_logico: row.COD_EMPRESA,
      empresa_nome_logico: row.EMPRESA_NOME_LOGICO || row.EMPRESA_NOME
    })).sort((a, b) => 
      a.empresa_nome.localeCompare(b.empresa_nome)
    );
    
    return success(res, empresas, { elapsed_ms: Date.now() - start, endpoint: '/api/v1/empresas' });
  } catch (err) {
    const classified = classifyError(err);
    return error(res, classified.code, classified.message, classified.statusCode, { original: err.message });
  }
});

// ============================================
// API v1 - Parcelas Financeiras (suporta empresa=null para TODAS)
// ============================================
app.get('/api/v1/financeiro/parcelas', async (req, res) => {
  try {
    const start = Date.now();
    const { dataInicio, dataFim, empresa, tipo, situacao, campoData } = req.query;

    if (!dataInicio || !dataFim) {
      return error(res, 'VALIDATION_ERROR', 'Parâmetros obrigatórios: dataInicio, dataFim', 400);
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
    return success(res, rows, { elapsed_ms: Date.now() - start, endpoint: '/api/v1/financeiro/parcelas' });
  } catch (err) {
    const classified = classifyError(err);
    return error(res, classified.code, classified.message, classified.statusCode, { original: err.message });
  }
});

// ============================================
// API v1 - DRE Gerencial (suporta empresa=null para TODAS)
// ============================================
app.get('/api/v1/financeiro/dre', async (req, res) => {
  try {
    const start = Date.now();
    const { dataInicio, dataFim, empresa } = req.query;

    if (!dataInicio || !dataFim) {
      return error(res, 'VALIDATION_ERROR', 'Parâmetros obrigatórios: dataInicio, dataFim', 400);
    }

    // Montar WHERE
    let whereClauses = [
      `fp.datavencimento >= '${dataInicio}'`,
      `fp.datavencimento <= '${dataFim}'`,
      getWhereEmpresasAtivas('e')
    ];

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
    return success(res, rows, { elapsed_ms: Date.now() - start, endpoint: '/api/v1/financeiro/dre' });
  } catch (err) {
    const classified = classifyError(err);
    return error(res, classified.code, classified.message, classified.statusCode, { original: err.message });
  }
});

// ============================================
// API v1 - Resumo por Empresa e Vendedor (com desconto)
// Query sincronizada com Railway - usa CTEs para cálculo correto
// ============================================
app.get('/api/v1/vendas/resumo-empresa-vendedor', async (req, res) => {
  try {
    const start = Date.now();
    const { dataInicio, dataFim, empresa, excluirCreditos } = req.query;

    if (!dataInicio || !dataFim) {
      return error(res, 'VALIDATION_ERROR', 'Parâmetros obrigatórios: dataInicio, dataFim', 400);
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
    return success(res, rows, { elapsed_ms: Date.now() - start, endpoint: '/api/v1/vendas/resumo-empresa-vendedor' });
  } catch (err) {
    const classified = classifyError(err);
    return error(res, classified.code, classified.message, classified.statusCode, { original: err.message });
  }
});

// ============================================
// API v1 - Resumo por Forma de Pagamento
// Query sincronizada com Railway - usa CTEs com cálculo proporcional
// ============================================
app.get('/api/v1/vendas/resumo-formas-pagamento', async (req, res) => {
  try {
    const start = Date.now();
    const { dataInicio, dataFim, empresa, excluirCreditos, incluirDevolucoes } = req.query;

    if (!dataInicio || !dataFim) {
      return error(res, 'VALIDATION_ERROR', 'Parâmetros obrigatórios: dataInicio, dataFim', 400);
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
    return success(res, rows, { elapsed_ms: Date.now() - start, endpoint: '/api/v1/vendas/resumo-formas-pagamento' });
  } catch (err) {
    const classified = classifyError(err);
    return error(res, classified.code, classified.message, classified.statusCode, { original: err.message });
  }
});

// ============================================
// API v1 - Resumo Diário Simples (para sincronização de cache)
// Query CORRIGIDA: Usa COD_TRANSACAO + COD_EMPRESA como chave única
// ============================================
app.get('/api/v1/vendas/resumo-diario-simples', async (req, res) => {
  try {
    const start = Date.now();
    const { dataInicio, dataFim, empresa, excluirCreditos } = req.query;

    if (!dataInicio || !dataFim) {
      return error(res, 'VALIDATION_ERROR', 'Parâmetros obrigatórios: dataInicio, dataFim', 400);
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
    return success(res, rows, { elapsed_ms: Date.now() - start, endpoint: '/api/v1/vendas/resumo-diario-simples' });
  } catch (err) {
    const classified = classifyError(err);
    return error(res, classified.code, classified.message, classified.statusCode, { original: err.message });
  }
});

// ============================================
// ENDPOINTS LEGADOS (mantidos para compatibilidade)
// Estes endpoints NÃO usam envelope v2 — serão removidos após migração completa
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
  } catch (err) {
    console.error('Erro /api/kpis:', err);
    res.status(500).json({ error: err.message });
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
  } catch (err) {
    console.error('Erro /api/vendas-por-dia:', err);
    res.status(500).json({ error: err.message });
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
  } catch (err) {
    console.error('Erro /api/vendas-por-loja:', err);
    res.status(500).json({ error: err.message });
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
  } catch (err) {
    console.error('Erro /api/empresas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// API v1 - Análise de SKU para OTB (Open to Buy)
// Retorna TODOS os tipos de produtos: armações, lentes, acessórios
// ============================================
app.get('/api/v1/vendas/analise-sku', async (req, res) => {
  try {
    const start = Date.now();
    const { dataInicio, dataFim, empresa } = req.query;

    if (!dataInicio || !dataFim) {
      return error(res, 'VALIDATION_ERROR', 'Parâmetros obrigatórios: dataInicio, dataFim', 400);
    }

    // Filtro de empresa
    const codEmpresa = (!empresa || empresa === 'ALL' || empresa === 'null' || empresa === '') 
      ? 0 
      : parseInt(empresa);

    const sql = `
      WITH
      empresas_filtradas AS (
        SELECT e.COD_EMPRESA
        FROM EMPRESA e
        WHERE e.COD_EMPRESA NOT IN (${EMPRESAS_EXCLUIDAS.join(',')})
          ${codEmpresa === 0 ? '' : `AND e.COD_EMPRESA = ${codEmpresa}`}
      ),
      vendas_periodo AS (
        SELECT
          ti.COD_PRODUTO,
          SUM(ti.QUANTIDADE) AS QTD_VENDIDA,
          SUM(COALESCE(ti.TOTAL, 0) - COALESCE(ti.TOTALIPI, 0)) AS TOTAL_VENDIDO,
          MAX(t.DATAEMISSAO) AS DATA_ULTIMA_VENDA
        FROM TRANSACAO t
        JOIN empresas_filtradas ef ON ef.COD_EMPRESA = t.COD_EMPRESAESTOQUE
        JOIN TRANSACAO_ITEM ti ON ti.COD_TRANSACAO = t.COD_TRANSACAO 
          AND (ti.COD_EMPRESA = t.COD_EMPRESAESTOQUE OR ti.COD_EMPRESA = t.COD_EMPRESA)
        JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = ti.COD_NATUREZAOPERACAO
        WHERE nat.TIPO = 1
          AND t.DATAEMISSAO BETWEEN '${dataInicio}' AND '${dataFim}'
        GROUP BY ti.COD_PRODUTO
      ),
      estoque_atual AS (
        SELECT 
          e.COD_PRODUTO,
          SUM(e.QUANTIDADE) AS ESTOQUE
        FROM ESTOQUE e
        JOIN empresas_filtradas ef ON ef.COD_EMPRESA = e.COD_EMPRESA
        WHERE e.QUANTIDADE > 0
        GROUP BY e.COD_PRODUTO
      ),
      ultimo_custo AS (
        SELECT DISTINCT
          ei.COD_PRODUTO,
          FIRST_VALUE(ei.VALORUNITARIO) OVER (PARTITION BY ei.COD_PRODUTO ORDER BY en.DATAEMISSAO DESC) AS PRECO_CUSTO,
          FIRST_VALUE(en.DATAEMISSAO) OVER (PARTITION BY ei.COD_PRODUTO ORDER BY en.DATAEMISSAO DESC) AS DATA_CUSTO
        FROM ENTRADA_ITEM ei
        JOIN ENTRADA en ON en.COD_ENTRADA = ei.COD_ENTRADA AND en.COD_EMPRESA = ei.COD_EMPRESA
        WHERE ei.VALORUNITARIO > 0
      )
      SELECT
        p.COD_PRODUTO AS COD_SKU,
        p.DESCRICAO AS DESCRICAO_ITEM,
        COALESCE(m.DESCRICAO, 'SEM MARCA') AS MARCA,
        COALESCE(pf.NOME, 'SEM FORNECEDOR') AS FORNECEDOR,
        COALESCE(tp.DESCRICAO, 'OUTROS') AS TIPO,
        COALESCE(est.ESTOQUE, 0) AS ESTOQUE_ATUAL,
        vp.DATA_ULTIMA_VENDA,
        CASE 
          WHEN vp.DATA_ULTIMA_VENDA IS NULL THEN 999
          ELSE DATEDIFF(DAY, vp.DATA_ULTIMA_VENDA, CURRENT_DATE)
        END AS DIAS_DESDE_ULTIMA_VENDA,
        uc.DATA_CUSTO AS DATA_ULTIMO_CUSTO,
        COALESCE(uc.PRECO_CUSTO, 0) AS PRECO_CUSTO,
        COALESCE(p.PRECO, 0) AS PRECO_VENDA_FINAL,
        COALESCE(vp.QTD_VENDIDA, 0) AS QTD_PRODUTOS,
        COALESCE(vp.TOTAL_VENDIDO, 0) AS TOTAL_VENDIDO
      FROM PRODUTO p
      LEFT JOIN MARCA m ON m.COD_MARCA = p.COD_MARCA
      LEFT JOIN PESSOA pf ON pf.COD_PESSOA = p.COD_FORNECEDOR
      LEFT JOIN PRODUTOTIPO tp ON tp.COD_PRODUTOTIPO = p.COD_PRODUTOTIPO
      LEFT JOIN vendas_periodo vp ON vp.COD_PRODUTO = p.COD_PRODUTO
      LEFT JOIN estoque_atual est ON est.COD_PRODUTO = p.COD_PRODUTO
      LEFT JOIN ultimo_custo uc ON uc.COD_PRODUTO = p.COD_PRODUTO
      WHERE p.ATIVO = 'T'
        AND (vp.QTD_VENDIDA > 0 OR COALESCE(est.ESTOQUE, 0) > 0)
      ORDER BY COALESCE(vp.TOTAL_VENDIDO, 0) DESC
    `;

    console.log('[API] GET /api/v1/vendas/analise-sku', { empresa: empresa || 'ALL', dataInicio, dataFim });
    const rows = await executeQuery(sql);
    
    const normalized = rows.map(row => ({
      cod_sku: row.COD_SKU,
      descricao_item: row.DESCRICAO_ITEM,
      marca: row.MARCA,
      fornecedor: row.FORNECEDOR,
      tipo: row.TIPO,
      estoque_atual: row.ESTOQUE_ATUAL || 0,
      data_ultima_venda: row.DATA_ULTIMA_VENDA,
      dias_desde_ultima_venda: row.DIAS_DESDE_ULTIMA_VENDA || 999,
      data_ultimo_custo: row.DATA_ULTIMO_CUSTO,
      preco_custo: parseFloat(row.PRECO_CUSTO || 0),
      preco_venda_final: parseFloat(row.PRECO_VENDA_FINAL || 0),
      qtd_produtos: parseInt(row.QTD_PRODUTOS || 0),
      total_vendido: parseFloat(row.TOTAL_VENDIDO || 0)
    }));
    
    return success(res, normalized, { elapsed_ms: Date.now() - start, endpoint: '/api/v1/vendas/analise-sku' });
  } catch (err) {
    const classified = classifyError(err);
    return error(res, classified.code, classified.message, classified.statusCode, { original: err.message });
  }
});

// ============================================
// API v1 - Análise de Estoque para Ação
// Retorna TODOS os SKUs com estoque físico (não depende de vendas)
// IMPORTANTE: Usa a mesma fonte de estoque que /vendas/analise-sku
// para garantir consistência nos valores
// ============================================
app.get('/api/v1/estoque/analise-acao', async (req, res) => {
  try {
    const start = Date.now();
    const { empresa } = req.query;

    if (!empresa || empresa === 'ALL' || empresa === 'null' || empresa === '') {
      return error(res, 'VALIDATION_ERROR', 'Parâmetro obrigatório: empresa (código específico)', 400);
    }

    const codEmpresa = parseInt(empresa);

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
    return success(res, normalized, { elapsed_ms: Date.now() - start, endpoint: '/api/v1/estoque/analise-acao' });
  } catch (err) {
    const classified = classifyError(err);
    return error(res, classified.code, classified.message, classified.statusCode, { original: err.message });
  }
});
// ============================================
// API v1 - OS Hub Receitas (para sincronização de cache)
// Retorna OS com dados de receita, lentes e imagens
// F5.2: Inclui JOIN com ITEM para lente_od/oe_descricao
// ============================================
app.get('/api/v1/os/hub-receitas', async (req, res) => {
  try {
    const start = Date.now();
    const { dataInicio, dataFim, codEmpresa, os: codOsParam } = req.query;

    if (!dataInicio || !dataFim) {
      return error(res, 'VALIDATION_ERROR', 'Parâmetros obrigatórios: dataInicio, dataFim', 400);
    }

    const empresa = (!codEmpresa || codEmpresa === 'ALL' || codEmpresa === 'null' || codEmpresa === '')
      ? 0
      : parseInt(codEmpresa);

    // Build OS filter
    const osFilter = codOsParam ? `AND os.COD_ORDEMSERVICO = ${parseInt(codOsParam)}` : '';

    // Map internal empresa IDs to ERP origin codes
    // (internal monitor IDs like 599 map to origin 9)
    const empresaFilter = empresa === 0
      ? `AND e.COD_EMPRESA NOT IN (${EMPRESAS_EXCLUIDAS.join(',')})`
      : `AND (e.COD_EMPRESA = ${empresa} OR e.EMPRESA_COD_LOGICO = ${empresa})`;

    const sql = \`
      SELECT
        os.COD_ORDEMSERVICO AS COD_OS,
        os.NUMERO AS NUMERO_OS,
        e.COD_EMPRESA AS CODEMPRESA,
        emp.NOMEFANTASIA AS EMPRESA,
        cli.NOME AS CLIENTE,
        os.COD_CLIENTE,
        cli.TELEFONE,
        COALESCE(ose.DESCRICAO, '') AS ETAPA,
        CASE
          WHEN os.DATAPREVISAO IS NULL THEN 'SEM_DATA'
          WHEN os.DATAPREVISAO < CURRENT_DATE AND os.DATAHORASAIDA IS NULL THEN 'ATRASADA'
          WHEN os.DATAPREVISAO = CURRENT_DATE THEN 'HOJE'
          ELSE 'NO_PRAZO'
        END AS STATUS_ATRASO,
        CASE
          WHEN os.DATAPREVISAO IS NULL THEN 0
          WHEN os.DATAHORASAIDA IS NOT NULL THEN 0
          ELSE DATEDIFF(DAY, os.DATAPREVISAO, CURRENT_DATE)
        END AS ATRASO_DIAS,
        os.DATAEMISSAO,
        os.DATAPREVISAO,
        os.DATAHORAENTRADA,
        os.DATAHORASAIDA,
        os.TOTAL,
        usu.NOME AS USUARIO,
        /* OD longe */
        os.OD_LONGE_ESF, os.OD_LONGE_CIL, os.OD_LONGE_EIXO,
        os.OD_PERTO_ESF, os.OD_PERTO_CIL, os.OD_PERTO_EIXO,
        os.OD_ADICAO, os.OD_DNP, os.OD_ALTURA,
        /* OE longe */
        os.OE_LONGE_ESF, os.OE_LONGE_CIL, os.OE_LONGE_EIXO,
        os.OE_PERTO_ESF, os.OE_PERTO_CIL, os.OE_PERTO_EIXO,
        os.OE_ADICAO, os.OE_DNP, os.OE_ALTURA,
        /* Prisma */
        os.PRISMA, os.PRISMA1,
        /* Imagens */
        os.IMAGEM_RECEITA, os.URL_IMAGEM_RECEITA,
        os.IMAGEM_ARMACAO, os.URL_IMAGEM_ARMACAO,
        os.IMAGEM_TRACER,
        /* Observações */
        os.OBSERVACAO AS OBSERVACAO_OS,
        os.OBSERVACAO_LENTE,
        os.OBSERVACAO_PENDENCIA,
        /* F5.2: Lens descriptions from item join */
        item_od.DESCRICAO AS LENTE_OD_DESCRICAO,
        item_oe.DESCRICAO AS LENTE_OE_DESCRICAO
      FROM ORDEMSERVICO os
      JOIN EMPRESA e ON e.COD_EMPRESA = os.COD_EMPRESA
      JOIN PESSOA emp ON emp.COD_PESSOA = e.COD_EMPRESA
      LEFT JOIN PESSOA cli ON cli.COD_PESSOA = os.COD_CLIENTE
      LEFT JOIN PESSOA usu ON usu.COD_PESSOA = os.COD_USUARIO
      LEFT JOIN ORDEMSERVICOETAPA ose ON ose.COD_ORDEMSERVICOETAPA = os.COD_ORDEMSERVICOETAPA
      /* F5.2: Join for lens OD description */
      LEFT JOIN ORDEMSERVICOCAIXA osc ON osc.COD_ORDEMSERVICO = os.COD_ORDEMSERVICO
        AND osc.COD_EMPRESA = os.COD_EMPRESA
      LEFT JOIN TRANSACAO_ITEM ti_od ON ti_od.COD_TRANSACAO = osc.COD_TRANSACAO
        AND ti_od.COD_EMPRESA = osc.COD_EMPRESA
        AND ti_od.SEQ = 1
      LEFT JOIN PRODUTO item_od ON item_od.COD_PRODUTO = ti_od.COD_PRODUTO
        AND item_od.DESCRICAO LIKE 'LG%'
      /* F5.2: Join for lens OE description (2nd item) */
      LEFT JOIN TRANSACAO_ITEM ti_oe ON ti_oe.COD_TRANSACAO = osc.COD_TRANSACAO
        AND ti_oe.COD_EMPRESA = osc.COD_EMPRESA
        AND ti_oe.SEQ = 2
      LEFT JOIN PRODUTO item_oe ON item_oe.COD_PRODUTO = ti_oe.COD_PRODUTO
        AND item_oe.DESCRICAO LIKE 'LG%'
      WHERE os.DATAEMISSAO BETWEEN '\${dataInicio}' AND '\${dataFim}'
        \${empresaFilter}
        \${osFilter}
      ORDER BY os.DATAEMISSAO DESC
    \`;

    console.log('[API] GET /api/v1/os/hub-receitas', { empresa: codEmpresa || 'ALL', dataInicio, dataFim, os: codOsParam || 'ALL' });
    const rows = await executeQuery(sql);

    const normalized = rows.map(row => ({
      cod_os: row.COD_OS,
      numero_os: row.NUMERO_OS,
      codempresa: row.CODEMPRESA,
      empresa: (row.EMPRESA || '').trim(),
      cliente: (row.CLIENTE || '').trim(),
      cod_cliente: row.COD_CLIENTE,
      telefone: (row.TELEFONE || '').trim(),
      etapa: (row.ETAPA || '').trim(),
      status_atraso: row.STATUS_ATRASO,
      atraso_dias: row.ATRASO_DIAS || 0,
      dataemissao: row.DATAEMISSAO,
      dataprevisao: row.DATAPREVISAO,
      datahoraentrada: row.DATAHORAENTRADA,
      datahorasaida: row.DATAHORASAIDA,
      total: row.TOTAL || 0,
      usuario: (row.USUARIO || '').trim(),
      od_longe_esf: row.OD_LONGE_ESF,
      od_longe_cil: row.OD_LONGE_CIL,
      od_longe_eixo: row.OD_LONGE_EIXO,
      od_perto_esf: row.OD_PERTO_ESF,
      od_perto_cil: row.OD_PERTO_CIL,
      od_perto_eixo: row.OD_PERTO_EIXO,
      od_adicao: row.OD_ADICAO,
      od_dnp: row.OD_DNP,
      od_altura: row.OD_ALTURA,
      oe_longe_esf: row.OE_LONGE_ESF,
      oe_longe_cil: row.OE_LONGE_CIL,
      oe_longe_eixo: row.OE_LONGE_EIXO,
      oe_perto_esf: row.OE_PERTO_ESF,
      oe_perto_cil: row.OE_PERTO_CIL,
      oe_perto_eixo: row.OE_PERTO_EIXO,
      oe_adicao: row.OE_ADICAO,
      oe_dnp: row.OE_DNP,
      oe_altura: row.OE_ALTURA,
      prisma: (row.PRISMA || '').trim(),
      prisma1: (row.PRISMA1 || '').trim(),
      imagem_receita: (row.IMAGEM_RECEITA || '').trim(),
      url_imagem_receita: (row.URL_IMAGEM_RECEITA || '').trim(),
      imagem_armacao: (row.IMAGEM_ARMACAO || '').trim(),
      url_imagem_armacao: (row.URL_IMAGEM_ARMACAO || '').trim(),
      imagem_tracer: (row.IMAGEM_TRACER || '').trim(),
      observacao_os: (row.OBSERVACAO_OS || '').trim(),
      observacao_lente: (row.OBSERVACAO_LENTE || '').trim(),
      observacao_pendencia: (row.OBSERVACAO_PENDENCIA || '').trim(),
      lente_od_descricao: (row.LENTE_OD_DESCRICAO || '').trim(),
      lente_oe_descricao: (row.LENTE_OE_DESCRICAO || '').trim(),
    }));

    console.log('[API] /os/hub-receitas retornou', normalized.length, 'registros');
    return success(res, normalized, { elapsed_ms: Date.now() - start, endpoint: '/api/v1/os/hub-receitas' });
  } catch (err) {
    const classified = classifyError(err);
    return error(res, classified.code, classified.message, classified.statusCode, { original: err.message });
  }
});

// ============================================
// Debug: Schema discovery — lista colunas de uma tabela Firebird
// ============================================
app.get('/api/debug/schema', async (req, res) => {
  try {
    const start = Date.now();
    const { table } = req.query;
    if (!table) {
      return error(res, 'VALIDATION_ERROR', 'Parâmetro obrigatório: table', 400);
    }

    const sql = `
      SELECT
        rf.RDB$FIELD_POSITION AS POSITION,
        TRIM(rf.RDB$FIELD_NAME) AS FIELD_NAME,
        CASE f.RDB$FIELD_TYPE
          WHEN 7 THEN 'SMALLINT'
          WHEN 8 THEN 'INTEGER'
          WHEN 10 THEN 'FLOAT'
          WHEN 12 THEN 'DATE'
          WHEN 13 THEN 'TIME'
          WHEN 14 THEN 'CHAR'
          WHEN 16 THEN 'BIGINT'
          WHEN 27 THEN 'DOUBLE'
          WHEN 35 THEN 'TIMESTAMP'
          WHEN 37 THEN 'VARCHAR'
          WHEN 261 THEN 'BLOB'
          ELSE 'OTHER(' || f.RDB$FIELD_TYPE || ')'
        END AS FIELD_TYPE,
        f.RDB$FIELD_LENGTH AS FIELD_LENGTH,
        rf.RDB$NULL_FLAG AS NOT_NULL
      FROM RDB$RELATION_FIELDS rf
      JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE
      WHERE rf.RDB$RELATION_NAME = '${table.toUpperCase()}'
      ORDER BY rf.RDB$FIELD_POSITION
    `;

    const rows = await executeQuery(sql);
    const fields = rows.map(r => ({
      position: r.POSITION,
      name: (r.FIELD_NAME || '').trim(),
      type: (r.FIELD_TYPE || '').trim(),
      length: r.FIELD_LENGTH,
      not_null: r.NOT_NULL === 1,
    }));

    return success(res, fields, { table: table.toUpperCase(), elapsed_ms: Date.now() - start, endpoint: '/api/debug/schema' });
  } catch (err) {
    const classified = classifyError(err);
    return error(res, classified.code, classified.message, classified.statusCode, { original: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Firebird Bridge v${BRIDGE_VERSION} rodando na porta ${PORT}`);
  console.log(`Empresas excluídas: ${EMPRESAS_EXCLUIDAS.join(', ')}`);
});
