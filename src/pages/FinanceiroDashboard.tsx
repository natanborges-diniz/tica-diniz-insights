import { useFinanceiroParcelas } from "@/hooks/useFinanceiroParcelas";
import { FinanceiroDashboardLayout } from "@/components/financeiro-dashboard/FinanceiroDashboardLayout";

export default function FinanceiroDashboard() {
  const {
    filters,
    setFilters,
    data,
    filteredData,
    metrics,
    loading,
    error,
    reload,
  } = useFinanceiroParcelas();

  return (
    <FinanceiroDashboardLayout
      filters={filters}
      setFilters={setFilters}
      loading={loading}
      error={error}
      parcelas={data}
      filteredParcelas={filteredData}
      metrics={metrics}
      reload={reload}
    />
  );
}
