// src/services/healthService.ts
//
// Frescor dos dados: consulta o endpoint /api/v1/health/freshness do bridge,
// que compara quando a copia do Firebird foi construida (MON$CREATION_DATE)
// com o dado mais novo dentro dela (MAX transacao.dataemissao). Serve para
// avisar quando a copia no servidor para de refletir dados novos.
//
// Usa fetch direto (nao o apiGet generico): apiGet espera array e passa pelo
// circuit breaker de dados; a checagem de saude deve funcionar de forma
// independente disso.

import { FIREBIRD_BRIDGE_BASE_URL } from "./firebirdBridge";

export type DbFreshnessStatus = "fresh" | "stale" | "indisponivel" | "desconhecido";
export type DbFreshnessMotivo = "copia_parada" | "dados_desatualizados" | null;

export interface DbFreshness {
  status: DbFreshnessStatus;
  motivo_stale: DbFreshnessMotivo;
  data_copia: string | null;               // YYYY-MM-DD (MON$CREATION_DATE)
  data_ultima_movimentacao: string | null; // YYYY-MM-DD (MAX transacao.dataemissao)
  copia_lag_dias: number | null;
  dados_lag_dias: number | null;
  dados_lag_base?: "data_copia" | "hoje";
  limite_dias: number;
  checado_em: string;
  fontes?: { copia: string; dados: string };
  avisos?: string[];
}

export async function getDbFreshness(signal?: AbortSignal): Promise<DbFreshness> {
  const url = `${FIREBIRD_BRIDGE_BASE_URL}/api/v1/health/freshness`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal,
  });

  // Envelope padrao { ok, data, error }. Mesmo em 503 (status 'indisponivel')
  // o corpo traz data preenchido.
  const body = await res.json().catch(() => null);

  if (body && body.data) {
    return body.data as DbFreshness;
  }

  throw new Error(
    (body && body.error) || `health/freshness respondeu HTTP ${res.status}`,
  );
}
