// Configuração da URL base - altere aqui se trocar o domínio do Railway
const FIREBIRD_BRIDGE_BASE_URL = 'https://firebird-bridge-production.up.railway.app';

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

// Exporta a URL base para referência
export { FIREBIRD_BRIDGE_BASE_URL };
