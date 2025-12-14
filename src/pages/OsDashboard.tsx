// src/pages/OsDashboard.tsx

import React, { useState } from "react";
import { useOsMonitor } from "../hooks/useOsMonitor";
import { OsDashboardLayout } from "../components/os-dashboard/OsDashboardLayout";
import { useEmpresas } from "@/hooks/useEmpresas";

const OsDashboardPage: React.FC = () => {
  // Por padrão, últimos 7 dias
  const hoje = new Date();
  const fim = hoje.toISOString().slice(0, 10);
  const inicioDate = new Date(hoje);
  inicioDate.setDate(inicioDate.getDate() - 7);
  const inicio = inicioDate.toISOString().slice(0, 10);

  const [dataLoaded, setDataLoaded] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);

  const { empresas, isLoading: loadingEmpresas, error: errorEmpresas } = useEmpresas();

  const {
    data,
    filteredData,
    loading,
    error,
    metrics,
    filteredMetrics,
    filters,
    setFilters,
    reload,
  } = useOsMonitor({
    empresa: null,
    dataInicio: inicio,
    dataFim: fim,
  });

  const handleChangeFilters = (next: Partial<typeof filters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  };

  const handleSelectEmpresa = (codEmpresa: number | null) => {
    setSelectedEmpresa(codEmpresa);
  };

  const handleLoadData = () => {
    if (!selectedEmpresa) {
      return;
    }
    reload({ empresa: selectedEmpresa });
    setDataLoaded(true);
  };

  const handleChangePeriod = (range: { dataInicio: string; dataFim: string }) => {
    if (!selectedEmpresa) {
      return;
    }
    reload({ ...range, empresa: selectedEmpresa });
    setDataLoaded(true);
  };

  return (
    <OsDashboardLayout
      data={filteredData}
      rawData={data}
      loading={loading}
      error={error}
      metrics={filteredMetrics}
      filters={filters}
      dataLoaded={dataLoaded}
      onChangeFilters={handleChangeFilters}
      onChangePeriod={handleChangePeriod}
      onLoadData={handleLoadData}
      empresas={empresas}
      loadingEmpresas={loadingEmpresas}
      errorEmpresas={errorEmpresas}
      selectedEmpresa={selectedEmpresa}
      onSelectEmpresa={handleSelectEmpresa}
    />
  );
};

export default OsDashboardPage;
