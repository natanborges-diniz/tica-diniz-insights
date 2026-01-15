// src/pages/SalesDashboard.tsx

import { useVendasDashboard } from "@/hooks/useVendasDashboard";
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
    reload,
  } = useVendasDashboard();

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
      reload={reload}
    />
  );
}
