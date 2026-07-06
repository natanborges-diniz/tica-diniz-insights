// src/hooks/useVendasDiarias.ts
// Hook para carregar resumos diários do cache Supabase (apenas resumo, sem detalhamento)

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EmpresaParam, aplicarFiltroEmpresaSupabase } from "@/services/firebirdBridge";

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

export interface UseVendasDiariasParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
}

export interface UseVendasDiariasResult {
  resumosDiarios: ResumoDiario[];
  loading: boolean;
  error: string | null;
  carregarResumos: () => Promise<void>;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Gerar chave única para dia + empresa
  const getKey = useCallback((data: string, codEmpresa: number) => `${data}|${codEmpresa}`, []);

  // Carregar resumos diários do cache Supabase
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

  return {
    resumosDiarios,
    loading,
    error,
    carregarResumos,
  };
}
