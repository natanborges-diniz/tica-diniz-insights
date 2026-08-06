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
  /**
   * Forma de pagamento e dados do favorecido.
   *
   * Vivem na rubrica para não serem redigitados a cada competência: antes o
   * banco/agência/conta ficavam só no lançamento do mês, e toda provisão nova
   * nascia sem forma de pagamento.
   */
  forma_pagamento?: string | null;
  favorecido_chave?: string | null;
  favorecido_banco?: string | null;
  favorecido_agencia?: string | null;
  favorecido_conta?: string | null;
  favorecido_tipo_conta?: string | null;
}

/**
 * Instrumento de pagamento pronto para o lançamento, a partir da rubrica.
 *
 * Devolve as chaves que `_shared/btgPayment.ts` já reconhece, para o provisionado
 * sair pronto para o borderô sem passar pela tela de preparar pagamento.
 */
export function pagamentoDaRubrica(r: RubricaProvisionavel): Record<string, unknown> {
  const forma = String(r.forma_pagamento ?? "").toUpperCase();

  if (forma === "PIX_KEY" && r.favorecido_chave) {
    return {
      btg_payment_type: "PIX_KEY",
      btg_details: {
        chave_pix: r.favorecido_chave,
        nome: r.favorecido_nome,
        documento: r.favorecido_documento ?? null,
      },
    };
  }

  if (forma === "TED" && r.favorecido_banco && r.favorecido_agencia && r.favorecido_conta) {
    return {
      btg_payment_type: "TED",
      btg_details: {
        bankCode: r.favorecido_banco,
        branch: r.favorecido_agencia,
        account: r.favorecido_conta,
        accountType: r.favorecido_tipo_conta ?? "CC",
        name: r.favorecido_nome,
        taxId: r.favorecido_documento ?? null,
      },
    };
  }

  // Boleto: a linha digitável muda a cada competência, então não há o que
  // adiantar — mas registramos a EXPECTATIVA. Aluguel e condomínio sempre vêm
  // por boleto reajustado, e o lançamento precisa dizer "aguardo o DDA" em vez
  // de "sem boleto", que soa como pendência de cadastro.
  if (forma === "BANKSLIP") {
    return { btg_payment_type: "BANKSLIP", aguarda_boleto_dda: true };
  }

  return {};
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

// ─── Valor esperado por média móvel ──────────────────────────

export interface PagamentoHistorico {
  data: string;   // yyyy-MM-dd (data do pagamento)
  valor: number;  // valor efetivamente pago
}

export interface MediaCalculada {
  media: number;
  amostras: number;
  de: string;
  ate: string;
}

/**
 * Média dos últimos N pagamentos efetivos de uma rubrica.
 *
 * O `valor_esperado` fixo envelhece: aluguel reajusta, energia oscila com a
 * estação, e a faixa de tolerância vai ficando mentirosa até tudo cair na Mesa
 * como desvio. Com a média móvel, a faixa acompanha a realidade sozinha.
 *
 * Usa o valor PAGO, não o previsto — o previsto é justamente o número que
 * queremos corrigir, e realimentá-lo congelaria o erro.
 *
 * `minimo` existe porque média de uma amostra só não é média: com histórico
 * curto, é melhor manter o valor cadastrado do que perseguir um único mês.
 */
export function mediaUltimosPagamentos(
  historico: PagamentoHistorico[],
  janela = 6,
  minimo = 3,
): MediaCalculada | null {
  const validos = historico
    .filter((h) => Number(h.valor) > 0 && /^\d{4}-\d{2}-\d{2}/.test(String(h.data)))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    .slice(0, janela);

  if (validos.length < minimo) return null;

  const soma = validos.reduce((s, h) => s + Number(h.valor), 0);
  return {
    media: Math.round((soma / validos.length) * 100) / 100,
    amostras: validos.length,
    de: String(validos[validos.length - 1].data).slice(0, 10),
    ate: String(validos[0].data).slice(0, 10),
  };
}

/**
 * Decide se vale atualizar o valor esperado da rubrica.
 *
 * Ignora diferença irrelevante para não reescrever a rubrica todo mês por
 * centavos — o histórico de alterações perderia sentido, e cada gravação
 * dispara reavaliação de selo dos lançamentos futuros.
 */
export function deveAtualizarEsperado(
  atual: number | null | undefined,
  media: number,
  minimoPct = 1,
): boolean {
  const a = Number(atual ?? 0);
  if (!(a > 0)) return true; // sem valor cadastrado, qualquer média é ganho
  return Math.abs((media - a) / a) * 100 >= minimoPct;
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
    // Provisão não tem documento emitido: sem competência explícita ela sumia
    // do DRE, que filtrava por data_emissao (NULL não passa em >= nem <=).
    competencia: c.competencia,
    origem: "RUBRICA",
    origem_id: `RUBRICA:${r.id}:${c.competencia}`,
    status: "PREVISTO",
    dados_extras: {
      conta_numero: r.conta_numero,
      provisionado: true,
      // Forma de pagamento herdada da rubrica: o provisionado já nasce pronto
      // para o borderô, sem passar pela tela de preparar pagamento.
      ...pagamentoDaRubrica(r),
    },
  };
}
