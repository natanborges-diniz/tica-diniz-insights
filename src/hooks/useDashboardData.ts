import { useQuery } from '@tanstack/react-query';
import { fetchResumoEmpresaVendedor, ResumoEmpresaVendedor } from '@/services/firebirdBridge';

interface DashboardFilters {
  dataInicio: string;
  dataFim: string;
  lojaId?: number;
}

interface KPIs {
  faturamentoTotal: number;
  quantidadeVendas: number;
  ticketMedio: number;
  lojasAtivas: number;
  totalDevolucoes: number;
}

interface VendaPorDia {
  data: string;
  faturamento: number;
}

interface VendaPorLoja {
  loja: string;
  faturamento: number;
  quantidade: number;
  ticketMedio: number;
  percentual?: number;
}

interface Loja {
  id_loja: number;
  nome: string;
}

// Lista de lojas hardcoded (mesma do firebird-bridge)
const LOJAS_LISTA: Loja[] = [
  { id_loja: 595, nome: 'Diniz Primitiva I' },
  { id_loja: 597, nome: 'Diniz Primitiva II' },
  { id_loja: 599, nome: 'Diniz Antônio Agú' },
  { id_loja: 601, nome: 'Diniz União' },
  { id_loja: 603, nome: 'Diniz Super' },
  { id_loja: 605, nome: 'Diniz Carapicuíba' },
  { id_loja: 607, nome: 'Diniz Itapevi' },
  { id_loja: 609, nome: 'Diniz Jandira' },
  { id_loja: 769, nome: 'Diniz Barueri' },
];

function processarDadosBridge(dados: ResumoEmpresaVendedor[], lojaId?: number) {
  // Filtrar por loja se necessário
  let dadosFiltrados = dados;
  if (lojaId) {
    const lojaInfo = LOJAS_LISTA.find(l => l.id_loja === lojaId);
    if (lojaInfo) {
      dadosFiltrados = dados.filter(d => 
        d.EMPRESA.toUpperCase().includes(lojaInfo.nome.toUpperCase().split(' ').slice(1).join(' '))
      );
    }
  }

  // Filtrar apenas vendas (excluir linhas de devolução pura)
  const vendas = dadosFiltrados.filter(d => d.QTDTRANSACAO > 0);
  
  return { dadosFiltrados, vendas };
}

export function useDashboardKPIs(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard-kpis-bridge', filters],
    queryFn: async (): Promise<KPIs> => {
      const dados = await fetchResumoEmpresaVendedor(filters.dataInicio, filters.dataFim);
      const { dadosFiltrados } = processarDadosBridge(dados, filters.lojaId);

      const faturamentoTotal = dadosFiltrados.reduce((sum, d) => sum + (d.TOTALVENDIDO || 0), 0);
      const quantidadeVendas = dadosFiltrados.reduce((sum, d) => sum + (d.QTDTRANSACAO || 0), 0);
      const totalDevolucoes = dadosFiltrados.reduce((sum, d) => sum + (d.TOTALDEVOLUCAO || 0), 0);
      const ticketMedio = quantidadeVendas > 0 ? faturamentoTotal / quantidadeVendas : 0;
      const lojasAtivas = new Set(dadosFiltrados.map(d => d.EMPRESA)).size;

      return {
        faturamentoTotal,
        quantidadeVendas,
        ticketMedio,
        lojasAtivas,
        totalDevolucoes,
      };
    },
  });
}

export function useVendasPorDia(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['vendas-por-dia-bridge', filters],
    queryFn: async (): Promise<VendaPorDia[]> => {
      // O endpoint atual não retorna dados por dia, então retornamos vazio
      // Futuramente pode ser criado um endpoint específico no bridge
      return [];
    },
  });
}

export function useVendasPorLoja(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['vendas-por-loja-bridge', filters],
    queryFn: async (): Promise<VendaPorLoja[]> => {
      const dados = await fetchResumoEmpresaVendedor(filters.dataInicio, filters.dataFim);
      const { dadosFiltrados } = processarDadosBridge(dados, filters.lojaId);

      // Agrupar por empresa
      const porLoja = dadosFiltrados.reduce((acc, d) => {
        const loja = d.EMPRESA;
        if (!acc[loja]) {
          acc[loja] = { faturamento: 0, quantidade: 0 };
        }
        acc[loja].faturamento += d.TOTALVENDIDO || 0;
        acc[loja].quantidade += d.QTDTRANSACAO || 0;
        return acc;
      }, {} as Record<string, { faturamento: number; quantidade: number }>);

      const resultado = Object.entries(porLoja)
        .map(([loja, dados]) => ({
          loja,
          faturamento: dados.faturamento,
          quantidade: dados.quantidade,
          ticketMedio: dados.quantidade > 0 ? dados.faturamento / dados.quantidade : 0,
        }))
        .sort((a, b) => b.faturamento - a.faturamento);

      // Calcular percentual
      const totalGeral = resultado.reduce((sum, r) => sum + r.faturamento, 0);
      return resultado.map(r => ({
        ...r,
        percentual: totalGeral > 0 ? (r.faturamento / totalGeral) * 100 : 0,
      }));
    },
  });
}

export function useLojas() {
  return useQuery({
    queryKey: ['lojas-lista'],
    queryFn: async (): Promise<Loja[]> => {
      return LOJAS_LISTA;
    },
  });
}
