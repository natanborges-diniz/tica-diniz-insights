// src/pages/SalesDashboard.tsx

import { useEffect } from "react";
import { useVendasDashboard } from "@/hooks/useVendasDashboard";
import { useVendasDiarias } from "@/hooks/useVendasDiarias";
import { VendasDashboardLayout } from "@/components/sales-dashboard/VendasDashboardLayout";

export default function SalesDashboard() {
  const {
    dadosPorLoja,
    dadosFormasPagamento,
    dadosComDesconto,
    dataLoaded,
    fontesDados,
    loading,
    loadingDesconto,
    error,
    erroDesconto,
    filters,
    setFilters,
    metrics,
    projecao,
    alertaPeriodo,
    progressoPaginacao,
    reload,
    forceRefresh,
    cacheDisponivel,
  } = useVendasDashboard();

  // Hook para carregamento em 2 níveis (resumos diários + detalhes sob demanda)
  const vendasDiarias = useVendasDiarias({
    empresa: filters.empresa,
    dataInicio: filters.dataInicio,
    dataFim: filters.dataFim,
  });

  // Carregar resumos diários quando filtros mudam
  useEffect(() => {
    if (dataLoaded) {
      vendasDiarias.carregarResumos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.empresa, filters.dataInicio, filters.dataFim, dataLoaded]);

  return (
    <VendasDashboardLayout
      dadosPorLoja={dadosPorLoja}
      dadosFormasPagamento={dadosFormasPagamento}
      dadosComDesconto={dadosComDesconto}
      dataLoaded={dataLoaded}
      fontesDados={fontesDados}
      loading={loading}
      loadingDesconto={loadingDesconto}
      error={error}
      erroDesconto={erroDesconto}
      filters={filters}
      setFilters={setFilters}
      metrics={metrics}
      projecao={projecao}
      alertaPeriodo={alertaPeriodo}
      progressoPaginacao={progressoPaginacao}
      reload={reload}
      forceRefresh={forceRefresh}
      // Props para tabela diária expansível
      vendasDiarias={vendasDiarias}
      cacheDisponivel={cacheDisponivel}
    />
  );
}
