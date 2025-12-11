// src/services/firebirdBridge.ts
// Cliente HTTP centralizado para Firebird Bridge API

const FIREBIRD_BRIDGE_BASE_URL = 
  import.meta.env.VITE_FIREBIRD_BRIDGE_BASE_URL || 
  'https://firebird-bridge-production.up.railway.app';

// ============================================
// ENVELOPE PADRÃO DA API
// ============================================

interface ApiEnvelope<T> {
  ok: boolean;
  data: T[] | null;
  error: {
    code: string;
    message: string;
    details: object | null;
  } | null;
}

// ============================================
// FUNÇÃO GENÉRICA DE REQUISIÇÃO
// ============================================

export async function apiGet<T>(
  path: string, 
  params?: Record<string, string | number | undefined | null>
): Promise<T[]> {
  const url = new URL(`${FIREBIRD_BRIDGE_BASE_URL}/api/v1${path}`);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });
  }

  // Timeout de 15 segundos
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    console.log(`[FirebirdBridge] Fetching: ${url.toString()}`);
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    // Aplicar regra do envelope { ok, data, error }
    if (result.ok === false || result.error) {
      throw new Error(result.error?.message || result.error?.code || 'Erro na API');
    }

    console.log(`[FirebirdBridge] Success: ${path}`, result.data?.length || result.rows?.length || 0, 'records');

    // Aceitar tanto 'data' quanto 'rows' como campo de dados
    return result.data || result.rows || [];
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error(`[FirebirdBridge] Timeout: ${path}`);
        throw new Error('Timeout: O servidor não respondeu em tempo hábil');
      }
      console.error(`[FirebirdBridge] Error: ${path}`, error.message);
      throw error;
    }
    throw new Error('Erro desconhecido na requisição');
  }
}

// ============================================
// INTERFACES - EMPRESA
// ============================================

// Interface raw da API (snake_case)
interface EmpresaRaw {
  cod_empresa: number;
  empresa_nome: string;
}

// Interface pública (camelCase)
export interface Empresa {
  codEmpresa: number;
  empresaNome: string;
}

export async function fetchEmpresas(): Promise<Empresa[]> {
  const raw = await apiGet<EmpresaRaw>('/empresas');
  return raw.map((r) => ({
    codEmpresa: r.cod_empresa,
    empresaNome: r.empresa_nome,
  }));
}

// ============================================
// INTERFACES - VENDAS RESUMO EMPRESA/VENDEDOR
// ============================================

interface ResumoEmpresaVendedorRaw {
  EMPRESA: string;
  COD_EMPRESA: number;
  VENDEDOR: string;
  COD_VENDEDOR: number;
  TOTALORIGINAL: number;
  TOTALVENDIDO: number;
  TICKETMEDIO: number;
  TOTALDEVOLUCAO: number;
  QTDTRANSACAO: number;
  QTDDEVOLUCAO: number;
}

export interface ResumoEmpresaVendedor {
  codEmpresa: number;
  empresa: string;
  codVendedor: number;
  vendedor: string;
  totalOriginal: number;
  totalVendido: number;
  ticketMedio: number;
  totalDevolucao: number;
  qtdTransacao: number;
  qtdDevolucao: number;
}

export async function fetchResumoEmpresaVendedor(
  dataInicio: string,
  dataFim: string
): Promise<ResumoEmpresaVendedor[]> {
  const raw = await apiGet<ResumoEmpresaVendedorRaw>('/vendas/resumo-empresa-vendedor', {
    dataInicio,
    dataFim,
  });
  
  return raw.map((r) => ({
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresa: r.EMPRESA ?? '',
    codVendedor: r.COD_VENDEDOR ?? 0,
    vendedor: r.VENDEDOR ?? '',
    totalOriginal: r.TOTALORIGINAL ?? 0,
    totalVendido: r.TOTALVENDIDO ?? 0,
    ticketMedio: r.TICKETMEDIO ?? 0,
    totalDevolucao: r.TOTALDEVOLUCAO ?? 0,
    qtdTransacao: r.QTDTRANSACAO ?? 0,
    qtdDevolucao: r.QTDDEVOLUCAO ?? 0,
  }));
}

// ============================================
// INTERFACES - FORMAS DE PAGAMENTO
// ============================================

interface ResumoFormaPagamentoRaw {
  COD_EMPRESA: number;
  EMPRESA: string;
  VENDEDOR?: string;
  FORMA_PAGAMENTO?: string;
  FORMAPAGAMENTO?: string;
  TOTAL?: number;
  TOTALGERAL?: number;
  QTD_TRANSACOES?: number;
  QTD_VENDAS?: number;
}

export interface ResumoFormaPagamento {
  codEmpresa: number;
  empresa: string;
  vendedor: string;
  formaPagamento: string;
  totalGeral: number;
  qtdVendas: number;
}

export async function fetchResumoFormasPagamento(
  dataInicio: string,
  dataFim: string
): Promise<ResumoFormaPagamento[]> {
  const raw = await apiGet<ResumoFormaPagamentoRaw>('/vendas/resumo-formas-pagamento', {
    dataInicio,
    dataFim,
  });
  
  return raw.map((r) => ({
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresa: r.EMPRESA ?? '',
    vendedor: r.VENDEDOR ?? '',
    formaPagamento: r.FORMA_PAGAMENTO ?? r.FORMAPAGAMENTO ?? '',
    totalGeral: r.TOTAL ?? r.TOTALGERAL ?? 0,
    qtdVendas: r.QTD_TRANSACOES ?? r.QTD_VENDAS ?? 0,
  }));
}

// ============================================
// INTERFACES - ANÁLISE ESTOQUE
// ============================================

interface AnaliseEstoqueAcaoRaw {
  COD_EMPRESA?: number;
  EMPRESA: string;
  COD_PRODUTO?: number;
  NOME_FORNECEDOR?: string;
  FORNECEDOR?: string;
  GRIFE?: string;
  MARCA?: string;
  CODIGO_BARRA?: string;
  DESCRICAO_PRODUTO?: string;
  DESCRICAO?: string;
  QUANTIDADE_ESTOQUE?: number;
  ESTOQUE_ATUAL?: number;
  DIAS_ESTOQUE: number;
  ACAO_SUGERIDA: string;
}

export interface AnaliseEstoqueAcao {
  codEmpresa: number;
  empresa: string;
  codProduto: number;
  fornecedor: string;
  marca: string;
  codigoBarra: string;
  descricao: string;
  quantidadeEstoque: number;
  diasEstoque: number;
  acaoSugerida: string;
}

export async function fetchAnaliseEstoqueAcao(
  codEmpresa: number | string
): Promise<AnaliseEstoqueAcao[]> {
  const raw = await apiGet<AnaliseEstoqueAcaoRaw>('/estoque/analise-acao', {
    empresa: codEmpresa,
  });
  
  return raw.map((r) => ({
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresa: r.EMPRESA ?? '',
    codProduto: r.COD_PRODUTO ?? 0,
    fornecedor: r.NOME_FORNECEDOR ?? r.FORNECEDOR ?? '',
    marca: r.GRIFE ?? r.MARCA ?? '',
    codigoBarra: r.CODIGO_BARRA ?? '',
    descricao: r.DESCRICAO_PRODUTO ?? r.DESCRICAO ?? '',
    quantidadeEstoque: r.QUANTIDADE_ESTOQUE ?? r.ESTOQUE_ATUAL ?? 0,
    diasEstoque: r.DIAS_ESTOQUE ?? 0,
    acaoSugerida: r.ACAO_SUGERIDA ?? '',
  }));
}

// ============================================
// INTERFACES - ANÁLISE FAMÍLIA/VENDEDOR
// ============================================

interface AnaliseFamiliaVendedorRaw {
  COD_EMPRESA: number;
  EMPRESA: string;
  COD_VENDEDOR: number;
  VENDEDOR: string;
  FAMILIA: string;
  QTD_TRANSACAO: number;
  QTD_PRODUTOS: number;
  TOTAL_VENDIDO: number;
}

export interface AnaliseFamiliaVendedor {
  codEmpresa: number;
  empresa: string;
  codVendedor: number;
  vendedor: string;
  familia: string;
  qtdTransacao: number;
  qtdProdutos: number;
  totalVendido: number;
}

export async function fetchAnaliseFamiliaVendedor(params: {
  dataInicio: string;
  dataFim: string;
  codEmpresa?: number;
}): Promise<AnaliseFamiliaVendedor[]> {
  const raw = await apiGet<AnaliseFamiliaVendedorRaw>('/vendas/analise-familia-vendedor', {
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
    empresa: params.codEmpresa,
  });
  
  return raw.map((r) => ({
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresa: r.EMPRESA ?? '',
    codVendedor: r.COD_VENDEDOR ?? 0,
    vendedor: r.VENDEDOR ?? '',
    familia: r.FAMILIA ?? '',
    qtdTransacao: r.QTD_TRANSACAO ?? 0,
    qtdProdutos: r.QTD_PRODUTOS ?? 0,
    totalVendido: r.TOTAL_VENDIDO ?? 0,
  }));
}

// Exporta a URL base para referência
export { FIREBIRD_BRIDGE_BASE_URL };
