// src/pages/StockDashboard.tsx

import { useEstoqueDashboard } from "@/hooks/useEstoqueDashboard";
import { StockDashboardLayout } from "@/components/stock-dashboard/StockDashboardLayout";

export default function StockDashboard() {
  const {
    empresas,
    loadingEmpresas,
    errorEmpresas,
    dados,
    filteredData,
    loading,
    error,
    filters,
    setFilters,
    reload,
  } = useEstoqueDashboard();

  return (
    <StockDashboardLayout
      empresas={empresas}
      loadingEmpresas={loadingEmpresas}
      errorEmpresas={errorEmpresas}
      dados={dados}
      filteredData={filteredData}
      loading={loading}
      error={error}
      filters={filters}
      setFilters={setFilters}
      reload={reload}
    />
  );
}
