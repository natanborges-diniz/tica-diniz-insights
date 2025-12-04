// src/components/os-dashboard/OsDashboardLayout.tsx

import React from "react";
import { OsRecord } from "../../services/osMonitor";
import { OsMetrics, mapStatus, getStatusLegivel, isAtrasada } from "../../utils/osMetrics";
import { OsKpiCards } from "./OsKpiCards";
import { Badge } from "@/components/ui/badge";

type Props = {
  data: OsRecord[];
  loading: boolean;
  error: string | null;
  metrics: OsMetrics;
  onChangePeriod: (range: { dataInicio: string; dataFim: string }) => void;
};

export const OsDashboardLayout: React.FC<Props> = ({
  data,
  loading,
  error,
  metrics,
  onChangePeriod,
}) => {
  const hoje = new Date();

  function handleChangeToday() {
    const iso = hoje.toISOString().slice(0, 10);
    onChangePeriod({ dataInicio: iso, dataFim: iso });
  }

  function handleChangeLast7Days() {
    const fim = hoje.toISOString().slice(0, 10);
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 7);
    const ini = inicio.toISOString().slice(0, 10);
    onChangePeriod({ dataInicio: ini, dataFim: fim });
  }

  function handleChangeLast30Days() {
    const fim = hoje.toISOString().slice(0, 10);
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 30);
    const ini = inicio.toISOString().slice(0, 10);
    onChangePeriod({ dataInicio: ini, dataFim: fim });
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h1 className="text-2xl font-semibold">Monitor de Produção (OS)</h1>

        <div className="flex gap-2">
          <button
            onClick={handleChangeToday}
            className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted"
          >
            Hoje
          </button>
          <button
            onClick={handleChangeLast7Days}
            className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted"
          >
            Últimos 7 dias
          </button>
          <button
            onClick={handleChangeLast30Days}
            className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted"
          >
            Últimos 30 dias
          </button>
        </div>
      </div>

      {/* KPIs */}
      <OsKpiCards metrics={metrics} loading={loading} />

      {error && (
        <div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 p-3 rounded-md">
          Erro: {error}
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-auto border border-border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <Th>Empresa</Th>
              <Th>Nº OS</Th>
              <Th>Cliente</Th>
              <Th>Data Emissão</Th>
              <Th>Previsão</Th>
              <Th>Status</Th>
              <Th>Atrasada</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((os) => {
              const status = mapStatus(os);
              const statusLegivel = getStatusLegivel(status);
              const atrasada = isAtrasada(os, status);

              return (
                <tr
                  key={`${os.numeroOs}-${os.codEmpresa}-${os.dataHoraEntradaUltima}`}
                  className={`border-t border-border hover:bg-muted/50 ${
                    atrasada ? "bg-destructive/5" : ""
                  }`}
                >
                  <Td>{os.empresa}</Td>
                  <Td>{os.numeroOs}</Td>
                  <Td>{os.cliente}</Td>
                  <Td>{formatDate(os.dataEmissao)}</Td>
                  <Td>{os.dataPrevisao ? formatDate(os.dataPrevisao) : "-"}</Td>
                  <Td>
                    <Badge
                      variant={
                        status === "ENTREGUE"
                          ? "default"
                          : status === "CANCELADA"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {statusLegivel}
                    </Badge>
                  </Td>
                  <Td>
                    {atrasada ? (
                      <Badge variant="destructive">Sim</Badge>
                    ) : (
                      <span className="text-muted-foreground">Não</span>
                    )}
                  </Td>
                </tr>
              );
            })}
            {data.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhuma OS encontrada neste período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground text-center py-4">
          Carregando OS...
        </div>
      )}
    </div>
  );
};

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <td className="px-3 py-2 whitespace-nowrap align-top">{children}</td>
);

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}
