// src/lib/recebimentos/semanaComercial.ts
// Fase 1 — Dados de recebimento (docs/REVISAO_VENDAS_METAS.md §5.2/§5.3).
// Lógica PURA de semana comercial e agrupamento semanal de recebimentos —
// separada do service (que depende do client Supabase) para ser testável em
// vitest, mesmo padrão de src/lib/vendas/formaPagamento.ts.
//
// Semana comercial = segunda-feira → domingo. É a mesma âncora usada pela
// edge sync-recebimentos-diario: `origem` (VENDA_PERIODO | SALDO_ANTERIOR) é
// sempre relativa à semana comercial da data de pagamento.

export type FormaCategoria =
  | 'AVISTA'
  | 'CHEQUE'
  | 'CARTAO_CREDITO'
  | 'CARTAO_DEBITO'
  | 'CREDIARIO'
  | 'CREDITOS'
  | 'BANCO'
  | 'OUTROS';

export type OrigemRecebimento = 'VENDA_PERIODO' | 'SALDO_ANTERIOR';

export interface RecebimentoAgregado {
  codEmpresa: number;
  /** 0 = sem vendedor identificado (convenção do sync) */
  codVendedor: number;
  vendedorNome: string | null;
  /** YYYY-MM-DD */
  dataPagamento: string;
  formaCategoria: FormaCategoria;
  origem: OrigemRecebimento;
  valorRecebido: number;
  qtdParcelas: number;
}

export interface RecebimentosSemana {
  /** Segunda-feira da semana comercial (YYYY-MM-DD) */
  semanaInicio: string;
  /** Domingo da semana comercial (YYYY-MM-DD) */
  semanaFim: string;
  /** Soma bruta de tudo que foi recebido na semana */
  totalRecebido: number;
  /**
   * Base de meta/comissão: exclui CREDITOS (tipo 6 nunca soma na meta nem
   * comissiona — regra de negócio §2 do plano).
   */
  totalRecebidoSemCreditos: number;
  qtdParcelas: number;
  porCategoria: Partial<Record<FormaCategoria, number>>;
  porOrigem: Partial<Record<OrigemRecebimento, number>>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Soma dias a uma data ISO (YYYY-MM-DD), em UTC para evitar drift de fuso. */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateISO(d);
}

/**
 * Segunda-feira da semana comercial que contém a data.
 * Domingo pertence à semana iniciada na segunda-feira ANTERIOR.
 */
export function inicioSemanaComercial(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0 = domingo
  const diff = dow === 0 ? 6 : dow - 1;
  return addDaysISO(iso, -diff);
}

/** Domingo da semana comercial que contém a data. */
export function fimSemanaComercial(iso: string): string {
  return addDaysISO(inicioSemanaComercial(iso), 6);
}

/**
 * Agrupa recebimentos por semana comercial (segunda → domingo), somando
 * valores por categoria e por origem. Resultado ordenado por semanaInicio.
 */
export function agruparRecebimentosPorSemana(
  recebimentos: RecebimentoAgregado[]
): RecebimentosSemana[] {
  const mapa = new Map<string, RecebimentosSemana>();

  for (const r of recebimentos) {
    const semanaInicio = inicioSemanaComercial(r.dataPagamento);
    let semana = mapa.get(semanaInicio);
    if (!semana) {
      semana = {
        semanaInicio,
        semanaFim: addDaysISO(semanaInicio, 6),
        totalRecebido: 0,
        totalRecebidoSemCreditos: 0,
        qtdParcelas: 0,
        porCategoria: {},
        porOrigem: {},
      };
      mapa.set(semanaInicio, semana);
    }

    const valor = r.valorRecebido || 0;
    semana.totalRecebido += valor;
    if (r.formaCategoria !== 'CREDITOS') {
      semana.totalRecebidoSemCreditos += valor;
    }
    semana.qtdParcelas += r.qtdParcelas || 0;
    semana.porCategoria[r.formaCategoria] =
      (semana.porCategoria[r.formaCategoria] || 0) + valor;
    semana.porOrigem[r.origem] = (semana.porOrigem[r.origem] || 0) + valor;
  }

  return Array.from(mapa.values())
    .sort((a, b) => a.semanaInicio.localeCompare(b.semanaInicio))
    .map((s) => ({
      ...s,
      totalRecebido: round2(s.totalRecebido),
      totalRecebidoSemCreditos: round2(s.totalRecebidoSemCreditos),
      porCategoria: Object.fromEntries(
        Object.entries(s.porCategoria).map(([k, v]) => [k, round2(v as number)])
      ) as Partial<Record<FormaCategoria, number>>,
      porOrigem: Object.fromEntries(
        Object.entries(s.porOrigem).map(([k, v]) => [k, round2(v as number)])
      ) as Partial<Record<OrigemRecebimento, number>>,
    }));
}
