// src/services/osMonitor.ts

const FIREBIRD_BRIDGE_BASE_URL =
  import.meta.env.VITE_FIREBIRD_BRIDGE_BASE_URL ||
  "https://firebird-bridge-production.up.railway.app";

export interface OsRecord {
  empresa: string | null;
  numeroOs: number;
  cliente: string | null;
  cpf: string | null;
  total: number | null;
  dataEmissao: string | null;
  dataPrevisao: string | null;
  codEmpresa: number | null;
  codEtapaAtual: number | null;
  dataHoraEntradaUltima: string | null;
  dataHoraSaidaUltima: string | null;
  isReparo: boolean;
  isEcommerce: boolean;
}

export type OsMonitorFilters = {
  dataInicio: string;
  dataFim: string;
  codEmpresa?: number | null;
};

export async function getOsMonitor(
  filters: OsMonitorFilters
): Promise<OsRecord[]> {
  const url = new URL("/api/v1/os/monitor", FIREBIRD_BRIDGE_BASE_URL);

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

  const json = await res.json();

  // API pode retornar { data: [...] } ou direto [...]
  const rawData = Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : [];

  // Mapeia campos UPPERCASE do Firebird para camelCase
  return rawData.map((row: any) => ({
    empresa: row.EMPRESA ?? null,
    numeroOs: row.OS ?? 0,
    cliente: row.CLIENTE ?? null,
    cpf: row.CPF ?? null,
    total: row.TOTAL ?? null,
    dataEmissao: row.DATAEMISSAO ?? null,
    dataPrevisao: row.DATAPREVISAO ?? null,
    codEmpresa: row.CODEMPRESA ?? null,
    codEtapaAtual: row.CODETAPA_ATUAL ?? null,
    dataHoraEntradaUltima: row.DATAHORAENTRADA_ULTIMA ?? null,
    dataHoraSaidaUltima: row.DATAHORASAIDA_ULTIMA ?? null,
    isReparo: row.IS_REPARO === 1,
    isEcommerce: row.IS_ECOMMERCE === 1,
  }));
}
