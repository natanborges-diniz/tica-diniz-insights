// G2 — Regras puras da governança de pagamentos (SPEC_P2_5 §1/§2/§4)
// Sem I/O. Testado em src/lib/financeiro/__tests__/governanca.test.ts.
//
// Princípio: nenhum pagamento sem lastro. Selos:
//   VERDE    — título ERP (chave dura) ou NF (P3): dívida documentada
//   AZUL     — rubrica autorizada, valor dentro da faixa
//   AMARELO  — rubrica autorizada, fora da faixa mas dentro do teto (decidir)
//   VERMELHO — exceção emergencial (nunca entra em borderô; fluxo próprio)
//   SEM_LASTRO — não aprovável, não entra em borderô

export type Selo = "VERDE" | "AZUL" | "AMARELO" | "VERMELHO" | "SEM_LASTRO";

export interface LancParaAvaliar {
  id: string;
  lastro?: string | null;           // ERP | NF | RUBRICA | EXCECAO | null
  erp_parcela_id?: number | null;
  nf_entrada_id?: string | null;
  rubrica_id?: string | null;
  btg_dda_id?: string | null;
  justificativa?: string | null;
  valor: number;
  pessoa_documento?: string | null;
  data_vencimento?: string | null;
  criado_por?: string | null;
  /** Valor como veio da origem, quando alguém editou depois. */
  valor_original?: number | null;
  /** Tipo BTG configurado (BANKSLIP, UTILITIES, PIX_KEY, TED...). */
  btg_payment_type?: string | null;
}

// ─── Edição manual de valor ──────────────────────────────────

/** Desvio até aqui é acerto de rotina (juros, multa, arredondamento). */
export const TOLERANCIA_EDICAO_PCT = 5;
/** Piso absoluto: em valores baixos, 5% seria centavos. */
export const TOLERANCIA_EDICAO_ABS = 50;

/** Boleto tem valor definido pelo título registrado — não se digita. */
function ehBoleto(l: LancParaAvaliar): boolean {
  const t = String(l.btg_payment_type ?? "").toUpperCase();
  return t === "BANKSLIP" || t === "UTILITIES" || !!l.btg_dda_id;
}

/**
 * O selo olha a ORIGEM do lançamento, não o número. Sem esta checagem, um valor
 * digitado à mão herdaria o "veio do ERP" e sairia direto para o banco — a
 * trava contra erro de digitação deixaria de existir.
 *
 * Regra da casa:
 *   - boleto: o valor é o do título registrado. Qualquer edição vai à Mesa.
 *   - demais: desvio pequeno (≤5% ou ≤R$ 50) é acerto de rotina e segue direto.
 */
export function edicaoDeValorExigeMesa(l: LancParaAvaliar): { exige: boolean; motivo?: string } {
  const original = l.valor_original;
  if (original == null) return { exige: false };

  const delta = Number(l.valor) - Number(original);
  if (Math.abs(delta) < 0.01) return { exige: false };

  const fmt = (v: number) => `R$ ${Number(v).toFixed(2)}`;

  if (ehBoleto(l)) {
    return {
      exige: true,
      motivo:
        `Valor de boleto alterado à mão (${fmt(original)} → ${fmt(l.valor)}). ` +
        `Em boleto quem manda é o título registrado — confira antes de aprovar.`,
    };
  }

  const desvioPct = Number(original) > 0
    ? Math.abs(delta / Number(original)) * 100
    : Infinity;

  if (desvioPct > TOLERANCIA_EDICAO_PCT && Math.abs(delta) > TOLERANCIA_EDICAO_ABS) {
    return {
      exige: true,
      motivo:
        `Valor alterado à mão em ${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))} ` +
        `(${desvioPct.toFixed(1)}% vs origem ${fmt(original)})`,
    };
  }

  return { exige: false };
}

export interface RubricaAvaliavel {
  id: string;
  status: string;                   // RASCUNHO | ATIVA | SUSPENSA
  favorecido_documento?: string | null;
  valor_esperado?: number | null;
  tolerancia_pct: number;
  valor_teto: number;
  vigencia_inicio: string;
  vigencia_fim?: string | null;
}

export interface Avaliacao {
  selo: Selo;
  podeBordero: boolean;
  motivo: string;
  desvioPct?: number;               // para AMARELO: desvio vs valor_esperado
}

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export function avaliarRubrica(l: LancParaAvaliar, r: RubricaAvaliavel, hoje: string): Avaliacao {
  if (r.status !== "ATIVA") {
    return { selo: "SEM_LASTRO", podeBordero: false, motivo: `Rubrica ${r.status === "RASCUNHO" ? "aguardando aprovação do admin" : "suspensa"}` };
  }
  const d = hoje.slice(0, 10);
  if (d < r.vigencia_inicio || (r.vigencia_fim && d > r.vigencia_fim)) {
    return { selo: "SEM_LASTRO", podeBordero: false, motivo: "Rubrica fora da vigência" };
  }
  // Favorecido exato: se a rubrica fixa documento, o lançamento tem que bater
  if (r.favorecido_documento && soDigitos(r.favorecido_documento) !== soDigitos(l.pessoa_documento)) {
    return { selo: "SEM_LASTRO", podeBordero: false, motivo: "Favorecido difere do cadastrado na rubrica (possível troca de destino)" };
  }
  if (l.valor > Number(r.valor_teto)) {
    return { selo: "SEM_LASTRO", podeBordero: false, motivo: `Valor acima do teto da rubrica (R$ ${Number(r.valor_teto).toFixed(2)})` };
  }
  if (r.valor_esperado != null && Number(r.valor_esperado) > 0) {
    const desvioPct = Math.round(((l.valor - Number(r.valor_esperado)) / Number(r.valor_esperado)) * 1000) / 10;
    if (Math.abs(desvioPct) > Number(r.tolerancia_pct)) {
      return {
        selo: "AMARELO",
        podeBordero: true, // entra, mas sinalizado — o admin decide na aprovação
        motivo: `Fora da faixa: ${desvioPct > 0 ? "+" : ""}${desvioPct}% vs esperado (tolerância ±${r.tolerancia_pct}%)`,
        desvioPct,
      };
    }
  }
  return { selo: "AZUL", podeBordero: true, motivo: "Rubrica dentro da faixa" };
}

export function avaliarLancamento(l: LancParaAvaliar, rubrica: RubricaAvaliavel | null, hoje: string): Avaliacao {
  // Valor mexido à mão rebaixa o lastro para AMARELO: continua entrando no
  // borderô, mas sinalizado, e o borderô deixa de enviar direto (o envio só é
  // automático com 100% VERDE/AZUL).
  const edicao = edicaoDeValorExigeMesa(l);

  // Lastro A — dívida documentada
  if (l.erp_parcela_id != null || l.lastro === "ERP") {
    if (edicao.exige) return { selo: "AMARELO", podeBordero: true, motivo: edicao.motivo! };
    return { selo: "VERDE", podeBordero: true, motivo: "Título do ERP (chave dura)" };
  }
  if (l.nf_entrada_id != null || l.lastro === "NF") {
    if (edicao.exige) return { selo: "AMARELO", podeBordero: true, motivo: edicao.motivo! };
    return { selo: "VERDE", podeBordero: true, motivo: "NF de entrada amarrada a pedido" };
  }

  // Lastro B — rubrica
  if (l.rubrica_id) {
    if (!rubrica) return { selo: "SEM_LASTRO", podeBordero: false, motivo: "Rubrica vinculada não encontrada" };
    const av = avaliarRubrica(l, rubrica, hoje);
    // A faixa da rubrica já compara com o valor esperado; a edição só rebaixa
    // o que passaria direto.
    if (edicao.exige && av.selo === "AZUL") {
      return { selo: "AMARELO", podeBordero: true, motivo: edicao.motivo! };
    }
    return av;
  }

  // Lastro C — exceção (nunca via borderô)
  if (l.lastro === "EXCECAO") {
    const ok = validarJustificativa(l.justificativa);
    return {
      selo: ok ? "VERMELHO" : "SEM_LASTRO",
      podeBordero: false,
      motivo: ok
        ? "Exceção emergencial — aprovação individual do admin, fora do borderô"
        : "Exceção sem justificativa válida (mínimo 20 caracteres)",
    };
  }

  // DDA sozinho não é lastro (evidência de cobrança, não de dívida)
  if (l.btg_dda_id) {
    return { selo: "SEM_LASTRO", podeBordero: false, motivo: "DDA sem título ERP/NF correspondente — verificar antes de pagar (risco de boleto indevido)" };
  }

  return { selo: "SEM_LASTRO", podeBordero: false, motivo: "Sem lastro: vincule um título ERP/NF, uma rubrica, ou registre exceção com justificativa" };
}

export function validarJustificativa(j: unknown): boolean {
  return typeof j === "string" && j.trim().length >= 20;
}

// Separação de funções — vale para admin também
export function criadorAprovadorDistintos(criadoPor: string | null | undefined, aprovador: string): { ok: boolean; motivo?: string } {
  if (criadoPor && criadoPor === aprovador) {
    return { ok: false, motivo: "Quem criou não pode aprovar (separação de funções)" };
  }
  return { ok: true };
}
