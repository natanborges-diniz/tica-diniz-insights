// src/hooks/useEstoqueDashboard.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { useEmpresas } from "./useEmpresas";
import { fetchAnaliseEstoqueAcao, AnaliseEstoqueAcao } from "@/services/firebirdBridge";

export interface StockFiltersState {
  empresaId: number | null;
  fornecedor: string;
  grife: string;
  acao: string;
  busca: string;
}

export function useEstoqueDashboard() {
  const { empresas, isLoading: loadingEmpresas, error: errorEmpresas } = useEmpresas();
  
  const [filters, setFilters] = useState<StockFiltersState>({
    empresaId: null,
    fornecedor: "TODOS",
    grife: "TODAS",
    acao: "TODAS",
    busca: "",
  });

  const [dados, setDados] = useState<AnaliseEstoqueAcao[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selecionar primeira empresa quando carregar a lista
  useEffect(() => {
    if (!loadingEmpresas && !errorEmpresas && empresas.length > 0 && filters.empresaId === null) {
      setFilters((prev) => ({ ...prev, empresaId: empresas[0].COD_EMPRESA }));
    }
  }, [empresas, loadingEmpresas, errorEmpresas, filters.empresaId]);

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
      result = result.filter((item) => item.NOME_FORNECEDOR === filters.fornecedor);
    }

    if (filters.grife !== "TODAS") {
      result = result.filter((item) => item.GRIFE === filters.grife);
    }

    if (filters.acao !== "TODAS") {
      result = result.filter((item) => item.ACAO_SUGERIDA === filters.acao);
    }

    if (filters.busca.trim()) {
      const termo = filters.busca.toLowerCase();
      result = result.filter(
        (item) =>
          item.DESCRICAO_PRODUTO?.toLowerCase().includes(termo) ||
          item.CODIGO_BARRA?.toLowerCase().includes(termo)
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
