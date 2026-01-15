// src/hooks/useVendasDiarias.ts
// Hook para carregamento em 2 níveis:
// Nível 1: Resumos diários do cache (sempre carrega)
// Nível 2: Detalhes individuais por dia (sob demanda)

import { useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getDetalheDia, AuditoriaLight } from "@/services/auditoriaService";

// ============================================
// INTERFACES
// ============================================

export interface ResumoDiario {
  data: string;
  codEmpresa: number;
  empresa: string;
  formasPagamento: {
    [forma: string]: {
      totalVendido: number;
      totalBruto: number;
      totalDesconto: number;
      qtdVendas: number;
    };
  };
  totalDia: number;
  totalBrutoDia: number;
  totalDescontoDia: number;
  qtdVendasDia: number;
}

export interface DetalheDia {
  data: string;
  codEmpresa: number;
  itens: AuditoriaLight[];
  carregando: boolean;
  erro: string | null;
}

export interface UseVendasDiariasParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
}

export interface UseVendasDiariasResult {
  // Dados
  resumosDiarios: ResumoDiario[];
  detalhesExpandidos: Map<string, DetalheDia>;
  
  // Loading/Error
  loading: boolean;
  error: string | null;
  
  // Ações
  carregarResumos: () => Promise<void>;
  expandirDia: (data: string, codEmpresa: number) => Promise<void>;
  recolherDia: (data: string, codEmpresa: number) => void;
  isExpanded: (data: string, codEmpresa: number) => boolean;
  getDetalhes: (data: string, codEmpresa: number) => DetalheDia | undefined;
}

// Cache de nomes de empresas
let empresasCache: Map<number, string> | null = null;

async function getEmpresasMap(): Promise<Map<number, string>> {
  if (empresasCache) return empresasCache;
  
  const { data } = await supabase.from('empresa').select('cod_empresa, nome_fantasia');
  empresasCache = new Map();
  data?.forEach((e) => {
    empresasCache!.set(e.cod_empresa, e.nome_fantasia || `Loja ${e.cod_empresa}`);
  });
  
  return empresasCache;
}

// ============================================
// HOOK PRINCIPAL
// ============================================

export function useVendasDiarias(params: UseVendasDiariasParams): UseVendasDiariasResult {
  const [resumosDiarios, setResumosDiarios] = useState<ResumoDiario[]>([]);
  const [detalhesExpandidos, setDetalhesExpandidos] = useState<Map<string, DetalheDia>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Gerar chave única para dia + empresa
  const getKey = useCallback((data: string, codEmpresa: number) => `${data}|${codEmpresa}`, []);

  // NÍVEL 1: Carregar resumos diários do cache Supabase
  const carregarResumos = useCallback(async () => {
    // Cancelar requisição anterior
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    setError(null);
    
    const startTime = performance.now();
    console.log('[useVendasDiarias] Carregando resumos diários:', params);
    
    try {
      // Buscar dados diários do cache
      let query = supabase
        .from('vendas_agregado_diario')
        .select('*')
        .gte('data', params.dataInicio)
        .lte('data', params.dataFim)
        .order('data', { ascending: false });
      
      if (params.empresa !== 'ALL') {
        const codEmpresa = typeof params.empresa === 'string' 
          ? parseInt(params.empresa, 10) 
          : params.empresa;
        query = query.eq('cod_empresa', codEmpresa);
      }
      
      const { data, error: queryError } = await query;
      
      if (queryError) throw queryError;
      
      if (!data || data.length === 0) {
        console.log('[useVendasDiarias] Cache vazio para o período');
        setResumosDiarios([]);
        setLoading(false);
        return;
      }
      
      // Buscar nomes das empresas
      const empresasMap = await getEmpresasMap();
      
      // Agrupar por data + empresa
      const mapaResumos = new Map<string, ResumoDiario>();
      
      data.forEach((d) => {
        const key = getKey(d.data, d.cod_empresa);
        const existing = mapaResumos.get(key);
        
        const formaKey = d.forma_pagamento || 'OUTROS';
        const valores = {
          totalVendido: Number(d.total_vendido) || 0,
          totalBruto: Number(d.total_bruto) || 0,
          totalDesconto: Number(d.total_desconto) || 0,
          qtdVendas: Number(d.qtd_vendas) || 0,
        };
        
        if (existing) {
          // Somar à forma de pagamento existente ou criar nova
          if (existing.formasPagamento[formaKey]) {
            existing.formasPagamento[formaKey].totalVendido += valores.totalVendido;
            existing.formasPagamento[formaKey].totalBruto += valores.totalBruto;
            existing.formasPagamento[formaKey].totalDesconto += valores.totalDesconto;
            existing.formasPagamento[formaKey].qtdVendas += valores.qtdVendas;
          } else {
            existing.formasPagamento[formaKey] = valores;
          }
          existing.totalDia += valores.totalVendido;
          existing.totalBrutoDia += valores.totalBruto;
          existing.totalDescontoDia += valores.totalDesconto;
          existing.qtdVendasDia += valores.qtdVendas;
        } else {
          mapaResumos.set(key, {
            data: d.data,
            codEmpresa: d.cod_empresa,
            empresa: empresasMap.get(d.cod_empresa) || `Loja ${d.cod_empresa}`,
            formasPagamento: { [formaKey]: valores },
            totalDia: valores.totalVendido,
            totalBrutoDia: valores.totalBruto,
            totalDescontoDia: valores.totalDesconto,
            qtdVendasDia: valores.qtdVendas,
          });
        }
      });
      
      // Ordenar por data (mais recente primeiro)
      const resumos = Array.from(mapaResumos.values()).sort((a, b) => 
        b.data.localeCompare(a.data)
      );
      
      const tempoMs = Math.round(performance.now() - startTime);
      console.log(`[useVendasDiarias] ✓ ${resumos.length} resumos diários em ${tempoMs}ms`);
      
      setResumosDiarios(resumos);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar resumos';
      console.error('[useVendasDiarias] Erro:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [params.empresa, params.dataInicio, params.dataFim, getKey]);

  // NÍVEL 2: Expandir e carregar detalhes de um dia específico
  const expandirDia = useCallback(async (data: string, codEmpresa: number) => {
    const key = getKey(data, codEmpresa);
    
    // Se já tem dados em cache, só marca como expandido
    const existente = detalhesExpandidos.get(key);
    if (existente && existente.itens.length > 0 && !existente.erro) {
      console.log(`[useVendasDiarias] Usando cache para ${key}`);
      return;
    }
    
    console.log(`[useVendasDiarias] Expandindo ${data} para empresa ${codEmpresa}...`);
    
    // Marcar como carregando
    setDetalhesExpandidos(prev => {
      const next = new Map(prev);
      next.set(key, {
        data,
        codEmpresa,
        itens: [],
        carregando: true,
        erro: null,
      });
      return next;
    });
    
    try {
      // Buscar detalhes do dia via API
      const itens = await getDetalheDia(codEmpresa, data);
      
      console.log(`[useVendasDiarias] ✓ ${itens.length} itens para ${key}`);
      
      setDetalhesExpandidos(prev => {
        const next = new Map(prev);
        next.set(key, {
          data,
          codEmpresa,
          itens,
          carregando: false,
          erro: null,
        });
        return next;
      });
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar detalhes';
      console.error(`[useVendasDiarias] Erro ao expandir ${key}:`, message);
      
      setDetalhesExpandidos(prev => {
        const next = new Map(prev);
        next.set(key, {
          data,
          codEmpresa,
          itens: [],
          carregando: false,
          erro: message,
        });
        return next;
      });
    }
  }, [getKey, detalhesExpandidos]);

  // Recolher dia
  const recolherDia = useCallback((data: string, codEmpresa: number) => {
    const key = getKey(data, codEmpresa);
    setDetalhesExpandidos(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, [getKey]);

  // Verificar se está expandido
  const isExpanded = useCallback((data: string, codEmpresa: number) => {
    return detalhesExpandidos.has(getKey(data, codEmpresa));
  }, [detalhesExpandidos, getKey]);

  // Obter detalhes de um dia
  const getDetalhes = useCallback((data: string, codEmpresa: number) => {
    return detalhesExpandidos.get(getKey(data, codEmpresa));
  }, [detalhesExpandidos, getKey]);

  return {
    resumosDiarios,
    detalhesExpandidos,
    loading,
    error,
    carregarResumos,
    expandirDia,
    recolherDia,
    isExpanded,
    getDetalhes,
  };
}
