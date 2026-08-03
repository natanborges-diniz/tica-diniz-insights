// src/lib/datetime.ts
//
// Fuso horário único do sistema: America/Sao_Paulo (BRT/BRT-3).
//
// Por que este módulo existe: o navegador do usuário define o fuso do
// `new Date()` e do `toLocaleString()`. Em máquina configurada em UTC (ou em
// qualquer outro fuso), timestamps do banco apareciam com hora errada e o
// "hoje" virava o dia seguinte a partir das 21h de Brasília. Aqui a hora de
// São Paulo é imposta explicitamente, independente da máquina.

export const TIMEZONE = "America/Sao_Paulo";
export const LOCALE = "pt-BR";

/** Partes do calendário de São Paulo para um instante qualquer. */
function partesSP(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    // meia-noite em SP vem como "24" em alguns runtimes
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

/** Converte para Date, aceitando Date, ISO string ou epoch. Retorna null se inválido. */
export function paraData(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "Agora" com os campos locais (getFullYear/getMonth/getDate/getHours...)
 * já refletindo o relógio de São Paulo. Use no lugar de `new Date()` sempre
 * que a data/hora for usada em cálculo de período, não em instante absoluto.
 */
export function agoraSP(): Date {
  const { ano, mes, dia, hora, minuto, segundo } = partesSP(new Date());
  return new Date(ano, mes - 1, dia, hora, minuto, segundo);
}

/** Data de hoje em São Paulo no formato YYYY-MM-DD. */
export function hojeSP(): string {
  const { ano, mes, dia } = partesSP(new Date());
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Ano corrente em São Paulo. */
export function anoSP(): number {
  return partesSP(new Date()).ano;
}

/** Mês corrente em São Paulo (1-12). */
export function mesSP(): number {
  return partesSP(new Date()).mes;
}

/** Uma data (Date) para YYYY-MM-DD usando os campos locais, sem pular o dia. */
export function paraISODate(date: Date): string {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/**
 * Formata um instante (timestamp do banco, created_at, etc.) na hora de SP.
 * Ex.: 03/08/2026 19:03
 */
export function formatDataHoraSP(
  value: Date | string | number | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" },
): string {
  const d = paraData(value);
  if (!d) return "—";
  return d.toLocaleString(LOCALE, { timeZone: TIMEZONE, ...opts });
}

/** Formata só a data de um instante, na hora de SP. Ex.: 03/08/2026 */
export function formatDataSP(
  value: Date | string | number | null | undefined,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  const d = paraData(value);
  if (!d) return "—";
  return d.toLocaleDateString(LOCALE, { timeZone: TIMEZONE, ...opts });
}

/** Formata só a hora de um instante, na hora de SP. Ex.: 19:03 */
export function formatHoraSP(
  value: Date | string | number | null | undefined,
  opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  const d = paraData(value);
  if (!d) return "—";
  return d.toLocaleTimeString(LOCALE, { timeZone: TIMEZONE, ...opts });
}

/**
 * Formata uma data pura ("2026-08-03", sem hora) para exibição.
 * Não aplica fuso: data pura não tem hora, então converter deslocaria o dia.
 */
export function formatDataPura(
  iso: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  if (!iso) return "—";
  const somenteData = String(iso).slice(0, 10);
  const [ano, mes, dia] = somenteData.split("-").map(Number);
  if (!ano || !mes || !dia) return "—";
  return new Date(ano, mes - 1, dia).toLocaleDateString(LOCALE, opts);
}

/** Rótulo curto de data pura: 03/08 */
export function formatDiaMes(iso: string | null | undefined): string {
  return formatDataPura(iso, { day: "2-digit", month: "2-digit" });
}

/** Etiqueta "Gerado em ..." usada nos relatórios/exportações. */
export function geradoEmSP(date: Date = new Date()): string {
  return formatDataHoraSP(date, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
