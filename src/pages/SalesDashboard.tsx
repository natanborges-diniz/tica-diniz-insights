// src/pages/SalesDashboard.tsx

import { useVendasDashboard } from "@/hooks/useVendasDashboard";
import { VendasDashboardLayout } from "@/components/sales-dashboard/VendasDashboardLayout";

export default function SalesDashboard() {
  const {
    dados,
    dadosPorLoja,
    dadosFormasPagamento,
    dadosComDesconto,
    dataLoaded,
    loading,
    loadingFormas,
    loadingDesconto,
    error,
    errorFormas,
    erroDesconto,
    filters,
    setFilters,
    metrics,
    reload,
  } = useVendasDashboard();

  return (
    <VendasDashboardLayout
      dados={dados}
      dadosPorLoja={dadosPorLoja}
      dadosFormasPagamento={dadosFormasPagamento}
      dadosComDesconto={dadosComDesconto}
      dataLoaded={dataLoaded}
      loading={loading}
      loadingFormas={loadingFormas}
      loadingDesconto={loadingDesconto}
      error={error}
      errorFormas={errorFormas}
      erroDesconto={erroDesconto}
      filters={filters}
      setFilters={setFilters}
      metrics={metrics}
      reload={reload}
    />
  );
}
