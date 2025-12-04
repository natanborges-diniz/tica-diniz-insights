// src/services/osMonitor.ts

const FIREBIRD_BRIDGE_BASE_URL =
  import.meta.env.VITE_FIREBIRD_BRIDGE_BASE_URL ||
  "https://firebird-bridge-production.up.railway.app";

export type OsMonitorItem = {
  Empresa: string;
  OS: string;
  Produtos: string | null;
  Total: number;
  DataEmissao: string;
  DataPrevisao: string | null;
  Cliente: string;
  CodCliente: number;
  CPF: string | null;
  CodEmpresa: number;
  Telefone: string | null;
  Etapa: string;
  Usuario: string;
  DataHoraEntrada: string;
  DataHoraSaida: string | null;
  OC: string | null;
};

export type OsMonitorFilters = {
  dataInicio: string; // "2025-12-01"
  dataFim: string;    // "2025-12-31"
  codEmpresa?: number | null;
};

export async function getOsMonitor(
  filters: OsMonitorFilters
): Promise<OsMonitorItem[]> {
  const url = new URL(
    "/api/v1/os/monitor",
    FIREBIRD_BRIDGE_BASE_URL
  );

  url.searchParams.set("dataInicio", filters.dataInicio);
  url.searchParams.set("dataFim", filters.dataFim);

  if (filters.codEmpresa) {
    url.searchParams.set("codEmpresa", String(filters.codEmpresa));
  }

  const res = await fetch(url.toString());

  if (!res.ok) {
    const text = await res.text();
    console.error("Erro ao buscar OS monitor:", text);
    throw new Error("Erro ao buscar monitor de OS");
  }

  const data = await res.json();

  // Pode ser { data: [...] } ou direto [...]
  if (Array.isArray(data)) {
    return data as OsMonitorItem[];
  }

  if (Array.isArray(data.data)) {
    return data.data as OsMonitorItem[];
  }

  return [];
}
