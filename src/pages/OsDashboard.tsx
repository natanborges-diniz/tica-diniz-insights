// src/pages/OsDashboard.tsx

import React from "react";
import { useOsMonitor } from "../hooks/useOsMonitor";
import { OsDashboardLayout } from "../components/os-dashboard/OsDashboardLayout";

const OsDashboardPage: React.FC = () => {
  // Por padrão, últimos 7 dias
  const hoje = new Date();
  const fim = hoje.toISOString().slice(0, 10);
  const inicioDate = new Date(hoje);
  inicioDate.setDate(inicioDate.getDate() - 7);
  const inicio = inicioDate.toISOString().slice(0, 10);

const { data, loading, error, metrics, reload } = useOsMonitor({
    dataInicio: inicio,
    dataFim: fim,
  });

  return (
    <OsDashboardLayout
      data={data}
      loading={loading}
      error={error}
      metrics={metrics}
      onChangePeriod={reload}
    />
  );
};

export default OsDashboardPage;
