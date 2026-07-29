// Provisionamento por rubrica (SPEC_P2_5 §3 — extensão de 30/07):
// a rubrica é a autorização permanente; os lançamentos PREVISTO do horizonte
// nascem dela, com chave idempotente (rubrica_id, competencia).
// Puro — testado em src/lib/financeiro/__tests__/rubricaProvisao.test.ts.

export interface RubricaProvisionavel {
  id: string;
  cod_empresa: number | null;
  descricao: string;
  favorecido_nome: string;
  favorecido_documento?: string | null;
  conta_numero: string;
  periodicidade: string;            // MENSAL | ANUAL | SEMANAL | AVULSA_RECORRENTE
  valor_esperado?: number | null;
  dia_vencimento?: number | null;   // 1..28 (default 10)
  vigencia_inicio: string;
  vigencia_fim?: string | null;
  status: string;
  provisionar?: boolean;
}

export interface CompetenciaGerada {
  competencia: string;      // 'YYYY-MM' (ANUAL usa 'YYYY-01')
  data_vencimento: string;  // YYYY-MM-DD
}

function diaValido(d: number | null | undefined): number {
  const n = Number(d ?? 10);
  return n >= 1 && n <= 28 ? n : 10; // 29-31 viram 28 para não pular fevereiro
}

/**
 * Competências a provisionar a partir de `hoje` (inclusive o mês corrente se o
 * vencimento ainda não passou), num horizonte de N meses, dentro da vigência.
 * SEMANAL/AVULSA_RECORRENTE não são provisionáveis (retorna vazio) — semanal
 * geraria ruído; avulsa não tem cadência.
 */
export function gerarCompetencias(r: RubricaProvisionavel, hoje: string, horizonteMeses = 12): CompetenciaGerada[] {
  if (r.status !== "ATIVA" || r.provisionar === false) return [];
  if (r.periodicidade !== "MENSAL" && r.periodicidade !== "ANUAL") return [];
  if (!r.valor_esperado || Number(r.valor_esperado) <= 0) return []; // sem valor não há o que provisionar

  const dia = diaValido(r.dia_vencimento);
  const [hy, hm] = hoje.slice(0, 10).split("-").map(Number);
  const out: CompetenciaGerada[] = [];

  for (let i = 0; i < horizonteMeses; i++) {
    const total = hm - 1 + i;
    const y = hy + Math.floor(total / 12);
    const m = (total % 12) + 1;
    if (r.periodicidade === "ANUAL" && m !== Number(r.vigencia_inicio.slice(5, 7))) continue;

    const mm = String(m).padStart(2, "0");
    const venc = `${y}-${mm}-${String(dia).padStart(2, "0")}`;
    if (venc < hoje.slice(0, 10)) continue;             // vencimento já passou
    if (venc < r.vigencia_inicio) continue;
    if (r.vigencia_fim && venc > r.vigencia_fim) continue;

    out.push({ competencia: `${y}-${mm}`, data_vencimento: venc });
  }
  return out;
}

/** Record pronto para inserir no ledger (status PREVISTO, lastro RUBRICA). */
export function montarProvisao(r: RubricaProvisionavel, c: CompetenciaGerada, codEmpresa: number): Record<string, unknown> {
  return {
    cod_empresa: codEmpresa,
    tipo: "PAGAR",
    descricao: `${r.descricao} — ${c.competencia}`,
    pessoa_nome: r.favorecido_nome,
    pessoa_documento: r.favorecido_documento ?? null,
    valor: Number(r.valor_esperado),
    data_vencimento: c.data_vencimento,
    data_emissao: null,
    lastro: "RUBRICA",
    rubrica_id: r.id,
    competencia_rubrica: c.competencia,
    origem: "RUBRICA",
    origem_id: `RUBRICA:${r.id}:${c.competencia}`,
    status: "PREVISTO",
    dados_extras: { conta_numero: r.conta_numero, provisionado: true },
  };
}
