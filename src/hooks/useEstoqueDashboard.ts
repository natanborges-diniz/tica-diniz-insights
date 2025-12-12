// src/hooks/useEstoqueDashboard.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { useEmpresas } from "./useEmpresas";
import { fetchAnaliseEstoqueAcao, AnaliseEstoqueAcao } from "@/services/firebirdBridge";

export interface StockFiltersState {
  empresaId: number | null;
  fornecedor: string;
  marca: string;
  acao: string;
  busca: string;
}

export function useEstoqueDashboard() {
  const { empresas, isLoading: loadingEmpresas, error: errorEmpresas } = useEmpresas();
  
  const [filters, setFilters] = useState<StockFiltersState>({
    empresaId: null,
    fornecedor: "TODOS",
    marca: "TODAS",
    acao: "TODAS",
    busca: "",
  });

  const [dados, setDados] = useState<AnaliseEstoqueAcao[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NÃO auto-seleciona empresa - usuário deve escolher manualmente

  const fetchData = useCallback(async (codEmpresa: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAnaliseEstoqueAcao(codEmpresa);
      setDados(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido ao buscar dados";
      setError(message);
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Buscar dados quando empresa mudar
  useEffect(() => {
    if (filters.empresaId !== null) {
      fetchData(filters.empresaId);
    }
  }, [filters.empresaId, fetchData]);

  // Dados filtrados
  const filteredData = useMemo(() => {
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
          item.codigoBarra?.toLowerCase().includes(termo)
      );
    }

    return result;
  }, [dados, filters]);

  const reload = useCallback(() => {
    if (filters.empresaId !== null) {
      fetchData(filters.empresaId);
    }
  }, [filters.empresaId, fetchData]);

  return {
    // Empresas
    empresas,
    loadingEmpresas,
    errorEmpresas,
    // Dados
    dados,
    filteredData,
    loading,
    error,
    // Filtros
    filters,
    setFilters,
    // Ações
    reload,
  };
}
