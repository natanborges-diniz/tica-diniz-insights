// Configuração da URL base - usa variável de ambiente ou fallback para Railway
const FIREBIRD_BRIDGE_BASE_URL = 
  import.meta.env.VITE_FIREBIRD_BRIDGE_BASE_URL || 
  'https://firebird-bridge-production.up.railway.app';

export interface ResumoEmpresaVendedor {
  EMPRESA: string;
  VENDEDOR: string;
  TOTALORIGINAL: number;
  TOTALVENDIDO: number;
  TICKETMEDIO: number;
  TOTALDEVOLUCAO: number;
  QTDTRANSACAO: number;
  QTDDEVOLUCAO: number;
}

interface ApiResponse {
  data: ResumoEmpresaVendedor[];
}

export async function fetchResumoEmpresaVendedor(
  dataInicio: string,
  dataFim: string
): Promise<ResumoEmpresaVendedor[]> {
  const url = `${FIREBIRD_BRIDGE_BASE_URL}/api/v1/vendas/resumo-empresa-vendedor?dataInicio=${dataInicio}&dataFim=${dataFim}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar dados: ${response.status} ${response.statusText}`);
  }

  const result: ApiResponse = await response.json();
  return result.data;
}

export interface ResumoFormaPagamento {
  EMPRESA: string;
  VENDEDOR: string;
  FORMAPAGAMENTO: string;
  TOTALGERAL: number;
  QTD_VENDAS: number;
}

export async function fetchResumoFormasPagamento(
  dataInicio: string,
  dataFim: string
): Promise<ResumoFormaPagamento[]> {
  const url = `${FIREBIRD_BRIDGE_BASE_URL}/api/v1/vendas/resumo-formas-pagamento?dataInicio=${dataInicio}&dataFim=${dataFim}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar formas de pagamento: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

export interface AnaliseEstoqueAcao {
  EMPRESA: string;
  NOME_FORNECEDOR: string;
  GRIFE: string;
  CODIGO_BARRA: string;
  DESCRICAO_PRODUTO: string;
  QUANTIDADE_ESTOQUE: number;
  DIAS_ESTOQUE: number;
  ACAO_SUGERIDA: string;
}

export async function fetchAnaliseEstoqueAcao(
  codEmpresa: number | string
): Promise<AnaliseEstoqueAcao[]> {
  const cod = String(codEmpresa);
  const url = `${FIREBIRD_BRIDGE_BASE_URL}/api/v1/estoque/analise-acao?codEmpresa=${encodeURIComponent(cod)}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Erro ao buscar análise de estoque: ${res.status}`);
  }

  const json = await res.json();
  return json.data;
}

// Exporta a URL base para referência
export { FIREBIRD_BRIDGE_BASE_URL };
