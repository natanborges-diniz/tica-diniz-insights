// src/components/os-dashboard/OsDashboardLayout.tsx

import React from "react";
import { OsMonitorItem } from "../../services/osMonitor";

type Props = {
  data: OsMonitorItem[];
  loading: boolean;
  error: string | null;
  onChangePeriod: (range: { dataInicio: string; dataFim: string }) => void;
};

export const OsDashboardLayout: React.FC<Props> = ({
  data,
  loading,
  error,
  onChangePeriod,
}) => {
  const hoje = new Date();

  const totalOs = data.length;
  const abertas = data.filter(
    (o) =>
      !o.DataHoraSaida &&
      !/cancelada/i.test(o.Etapa) &&
      !/entregue/i.test(o.Etapa)
  ).length;

  const atrasadas = data.filter((o) => {
    if (!o.DataPrevisao || o.DataHoraSaida) return false;
    const prev = new Date(o.DataPrevisao);
    return prev < hoje;
  }).length;

  const entregues = data.filter((o) =>
    /entregue/i.test(o.Etapa)
  ).length;

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

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Monitor de Produção (OS)
        </h1>

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
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Total de OS" value={totalOs} />
        <KpiCard title="Em produção" value={abertas} />
        <KpiCard title="Atrasadas" value={atrasadas} />
        <KpiCard title="Entregues" value={entregues} />
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground">Carregando OS...</div>
      )}

      {error && (
        <div className="text-sm text-destructive">
          Erro: {error}
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-auto border border-border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <Th>Empresa</Th>
              <Th>OS</Th>
              <Th>Cliente</Th>
              <Th>Telefone</Th>
              <Th>Etapa</Th>
              <Th>Emissão</Th>
              <Th>Previsão</Th>
              <Th>Responsável</Th>
              <Th>Total</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((os) => (
              <tr
                key={os.OS + os.Empresa + os.DataHoraEntrada}
                className="border-t border-border hover:bg-muted/50"
              >
                <Td>{os.Empresa}</Td>
                <Td>{os.OS}</Td>
                <Td>{os.Cliente}</Td>
                <Td>{os.Telefone}</Td>
                <Td>{os.Etapa}</Td>
                <Td>{formatDate(os.DataEmissao)}</Td>
                <Td>{os.DataPrevisao ? formatDate(os.DataPrevisao) : "-"}</Td>
                <Td>{os.Usuario}</Td>
                <Td>R$ {Number(os.Total || 0).toFixed(2)}</Td>
              </tr>
            ))}
            {data.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={9}
                  className="py-4 text-center text-muted-foreground"
                >
                  Nenhuma OS encontrada no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{ title: string; value: number }> = ({
  title,
  value,
}) => (
  <div className="border border-border rounded-lg p-3 bg-card shadow-sm">
    <div className="text-xs text-muted-foreground">{title}</div>
    <div className="text-xl font-semibold mt-1">
      {value.toLocaleString("pt-BR")}
    </div>
  </div>
);

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <td className="px-3 py-2 whitespace-nowrap align-top">
    {children}
  </td>
);

function formatDate(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}
