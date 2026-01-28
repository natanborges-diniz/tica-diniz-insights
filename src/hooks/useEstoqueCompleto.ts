// src/hooks/useEstoqueCompleto.ts
// Hook para buscar dados COMPLETOS de estoque (endpoint /estoque/analise-acao)
// Diferente do useOtb que usa /vendas/analise-sku (só SKUs com vendas)

import { useState, useCallback, useMemo } from "react";
import { getAnaliseEstoqueAcao, AnaliseEstoqueAcao } from "@/services/estoqueService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { toast } from "@/hooks/use-toast";

export interface EstoqueCompletoFilters {
  empresa: EmpresaParam;
  fornecedor: string;
  marca: string;
  acao: string;
  busca: string;
}

export interface EstoqueMetrics {
  totalPecas: number;
  totalSkus: number;
  fornecedoresDistintos: number;
  marcasDistintas: number;
  pecasLiquidar: number;
  pecasManter: number;
  pecasComprar: number;
}

export function useEstoqueCompleto() {
  const [dados, setDados] = useState<AnaliseEstoqueAcao[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [filters, setFilters] = useState<EstoqueCompletoFilters>({
    empresa: null,
    fornecedor: "TODOS",
    marca: "TODAS",
    acao: "TODAS",
    busca: "",
  });

  const carregarDados = useCallback(async (empresa: EmpresaParam, dataInicio?: string, dataFim?: string) => {
    if (empresa === null || empresa === 'ALL') {
      setError("Selecione uma empresa específica para a visão de estoque");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('[useEstoqueCompleto] Carregando estoque para empresa:', empresa, 'período:', dataInicio, '-', dataFim);
      const result = await getAnaliseEstoqueAcao({ empresa, dataInicio, dataFim });
      console.log('[useEstoqueCompleto] Dados carregados:', result.length, 'SKUs');
      setDados(result);
      
      const totalPecas = result.reduce((acc, item) => acc + (item.quantidadeEstoque || 0), 0);
      toast({
        title: "Estoque Carregado",
        description: `${result.length} SKUs • ${totalPecas.toLocaleString('pt-BR')} peças em estoque`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar estoque";
      console.error('[useEstoqueCompleto] Erro:', message);
      setError(message);
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Dados filtrados
  const dadosFiltrados = useMemo(() => {
    let result = dados;

    if (filters.fornecedor !== "TODOS") {
      result = result.filter((item) => item.fornecedor === filters.fornecedor);
    }

    if (filters.marca !== "TODAS") {
      result = result.filter((item) => item.marca === filters.marca);
    }

    if (filters.acao !== "TODAS") {
      result = result.filter((item) => item.acaoSugerida === filters.acao);
    }

    if (filters.busca.trim()) {
      const termo = filters.busca.toLowerCase();
      result = result.filter(
        (item) =>
          item.descricao?.toLowerCase().includes(termo) ||
          item.codigoBarra?.toLowerCase().includes(termo) ||
          item.marca?.toLowerCase().includes(termo) ||
          item.fornecedor?.toLowerCase().includes(termo)
      );
    }

    return result;
  }, [dados, filters]);

  // Métricas calculadas
  const metrics = useMemo((): EstoqueMetrics => {
    const base = dadosFiltrados;
    
    const totalPecas = base.reduce((acc, item) => acc + (item.quantidadeEstoque || 0), 0);
    const totalSkus = base.length;
    const fornecedoresDistintos = new Set(base.map(item => item.fornecedor)).size;
    const marcasDistintas = new Set(base.map(item => item.marca)).size;
    
    const pecasLiquidar = base
      .filter(item => item.acaoSugerida?.toUpperCase().includes('LIQUIDA'))
      .reduce((acc, item) => acc + (item.quantidadeEstoque || 0), 0);
    
    const pecasManter = base
      .filter(item => item.acaoSugerida?.toUpperCase().includes('MANTER'))
      .reduce((acc, item) => acc + (item.quantidadeEstoque || 0), 0);
    
    const pecasComprar = base
      .filter(item => item.acaoSugerida?.toUpperCase().includes('COMPRAR'))
      .reduce((acc, item) => acc + (item.quantidadeEstoque || 0), 0);
    
    return {
      totalPecas,
      totalSkus,
      fornecedoresDistintos,
      marcasDistintas,
      pecasLiquidar,
      pecasManter,
      pecasComprar,
    };
  }, [dadosFiltrados]);

  // Listas para filtros
  const listaFornecedores = useMemo(() => {
    const set = new Set(dados.map(item => item.fornecedor).filter(Boolean));
    return ["TODOS", ...Array.from(set).sort()];
  }, [dados]);

  const listaMarcas = useMemo(() => {
    const set = new Set(dados.map(item => item.marca).filter(Boolean));
    return ["TODAS", ...Array.from(set).sort()];
  }, [dados]);

  const listaAcoes = useMemo(() => {
    const set = new Set(dados.map(item => item.acaoSugerida).filter(Boolean));
    return ["TODAS", ...Array.from(set).sort()];
  }, [dados]);

  return {
    dados,
    dadosFiltrados,
    loading,
    error,
    filters,
    setFilters,
    metrics,
    carregarDados,
    listaFornecedores,
    listaMarcas,
    listaAcoes,
  };
}
