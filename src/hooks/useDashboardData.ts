import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

// Flag para usar bridge Firebird (ativar quando bridge estiver deployado)
const USE_FIREBIRD_BRIDGE = false;

async function fetchFromBridge(endpoint: string, filters: DashboardFilters) {
  const params = new URLSearchParams({
    endpoint,
    dataInicio: filters.dataInicio,
    dataFim: filters.dataFim,
  });
  
  if (filters.lojaId) {
    params.append('codEmpresa', filters.lojaId.toString());
  }

  const { data, error } = await supabase.functions.invoke('firebird-query', {
    body: null,
    headers: {},
  });

  // Fallback: chamada direta se edge function não funcionar
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/firebird-query?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Erro ao buscar dados do Firebird');
  }

  return response.json();
}

export function useDashboardKPIs(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard-kpis', filters],
    queryFn: async (): Promise<KPIs> => {
      if (USE_FIREBIRD_BRIDGE) {
        return fetchFromBridge('kpis', filters);
      }

      // Fallback: usar dados do Supabase (tabela venda)
      let query = supabase
        .from('venda')
        .select('total, cod_empresa')
        .gte('data_emissao', filters.dataInicio)
        .lte('data_emissao', filters.dataFim);

      if (filters.lojaId) {
        query = query.eq('cod_empresa', filters.lojaId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const vendas = data || [];
      const faturamentoTotal = vendas.reduce((sum, v) => sum + (v.total || 0), 0);
      const quantidadeVendas = vendas.length;
      const ticketMedio = quantidadeVendas > 0 ? faturamentoTotal / quantidadeVendas : 0;
      const lojasAtivas = new Set(vendas.map(v => v.cod_empresa)).size;

      return {
        faturamentoTotal,
        quantidadeVendas,
        ticketMedio,
        lojasAtivas,
      };
    },
  });
}

export function useVendasPorDia(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['vendas-por-dia', filters],
    queryFn: async (): Promise<VendaPorDia[]> => {
      if (USE_FIREBIRD_BRIDGE) {
        return fetchFromBridge('vendas-por-dia', filters);
      }

      // Fallback: usar dados do Supabase
      let query = supabase
        .from('venda')
        .select('data_emissao, total')
        .gte('data_emissao', filters.dataInicio)
        .lte('data_emissao', filters.dataFim)
        .order('data_emissao', { ascending: true });

      if (filters.lojaId) {
        query = query.eq('cod_empresa', filters.lojaId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Agrupar por data
      const porDia = (data || []).reduce((acc, v) => {
        const dia = v.data_emissao?.split('T')[0] || '';
        if (!acc[dia]) acc[dia] = 0;
        acc[dia] += v.total || 0;
        return acc;
      }, {} as Record<string, number>);

      return Object.entries(porDia)
        .map(([data, faturamento]) => ({ data, faturamento }))
        .sort((a, b) => a.data.localeCompare(b.data));
    },
  });
}

export function useVendasPorLoja(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['vendas-por-loja', filters],
    queryFn: async (): Promise<VendaPorLoja[]> => {
      if (USE_FIREBIRD_BRIDGE) {
        return fetchFromBridge('vendas-por-loja', filters);
      }

      // Fallback: usar dados do Supabase
      let query = supabase
        .from('venda')
        .select('total, cod_empresa, loja_nome')
        .gte('data_emissao', filters.dataInicio)
        .lte('data_emissao', filters.dataFim);

      if (filters.lojaId) {
        query = query.eq('cod_empresa', filters.lojaId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Agrupar por loja
      const porLoja = (data || []).reduce((acc, v) => {
        const lojaKey = v.loja_nome || `Loja ${v.cod_empresa}`;
        if (!acc[lojaKey]) {
          acc[lojaKey] = { faturamento: 0, quantidade: 0 };
        }
        acc[lojaKey].faturamento += v.total || 0;
        acc[lojaKey].quantidade += 1;
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
    queryKey: ['lojas'],
    queryFn: async (): Promise<Loja[]> => {
      const { data, error } = await supabase
        .from('empresa')
        .select('cod_empresa, nome_fantasia')
        .order('nome_fantasia', { ascending: true });

      if (error) throw error;

      return (data || []).map(e => ({
        id_loja: e.cod_empresa,
        nome: e.nome_fantasia || `Empresa ${e.cod_empresa}`,
      }));
    },
  });
}
