import { useFinanceiroParcelas } from "@/hooks/useFinanceiroParcelas";
import { FinanceiroDashboardLayout } from "@/components/financeiro-dashboard/FinanceiroDashboardLayout";

export default function FinanceiroDashboard() {
  const {
    filters,
    setFilters,
    data,
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
      metrics={metrics}
      reload={reload}
    />
  );
}
