// P2/E2 — Módulo puro do sync ERP→ledger (SPEC_P2_LEDGER_UNICO.md §2/§4).
// Sem I/O: recebe a parcela do cache + estado atual do ledger e devolve a ação.
// Testado em src/lib/financeiro/__tests__/ledgerSync.test.ts.

export interface ParcelaCacheRow {
  cod_empresa: number;
  tipo_lancamento: string; // PAGAR | RECEBER
  documento: string | null;
  pessoa_nome: string | null;
  cod_pessoa: number | null;
  data_vencimento: string | null;
  data_emissao: string | null;
  data_pagamento: string | null;
  data_recebimento: string | null;
  valor: number;
  valor_pago: number | null;
  situacao: string; // PAGA | EM ABERTO | EM ATRASO
  conta_numero: string | null;
  conta_descricao: string | null;
  forma_pagamento_tipo: string | null;
  cod_lancamento: number | null;
  parcela_id: number;
}

export interface LancamentoAtual {
  id: string;
  status: string;
  valor: number;
  data_vencimento: string | null;
}

export interface PlanoContaEntry {
  grupo_dre: string;
  categoria: string;
}

export type PlanoMap = Map<string, PlanoContaEntry>;

// ─── origem_id (chave dura) ──────────────────────────────────
export function origemIdErp(codEmpresa: number, parcelaId: number): string {
  return `ERP:${codEmpresa}:${parcelaId}`;
}

// ─── Classificação via plano de contas (extraída de financeiro-lancamentos) ──
export function autoClassify(
  planoMap: PlanoMap,
  tipo: string,
  contaNumero?: string | null,
  contaDescricao?: string | null,
  forma?: string | null,
): { natureza: string; categoria: string; subcategoria: string | null } {
  // 1. Match exato no plano de contas
  if (contaNumero && planoMap.has(contaNumero)) {
    const match = planoMap.get(contaNumero)!;
    return { natureza: match.grupo_dre, categoria: match.categoria, subcategoria: contaDescricao || null };
  }

  // 2. Fallback por prefixo ("3.4.28" → "3.4" → "3")
  if (contaNumero) {
    const parts = contaNumero.split(".");
    while (parts.length > 1) {
      parts.pop();
      const prefix = parts.join(".");
      if (planoMap.has(prefix)) {
        const match = planoMap.get(prefix)!;
        return { natureza: match.grupo_dre, categoria: match.categoria, subcategoria: contaDescricao || null };
      }
    }
    const firstChar = contaNumero.charAt(0);
    if (planoMap.has(firstChar)) {
      const match = planoMap.get(firstChar)!;
      return { natureza: match.grupo_dre, categoria: match.categoria, subcategoria: contaDescricao || null };
    }
  }

  // 3. Fallback genérico
  if (tipo === "RECEBER") {
    return { natureza: "RECEITA_BRUTA", categoria: "VENDAS", subcategoria: contaDescricao || null };
  }
  if (forma) {
    const fp = forma.toUpperCase();
    if (fp.includes("CARTAO") || fp.includes("CREDITO") || fp.includes("DEBITO")) {
      return { natureza: "DEDUCOES", categoria: "TAXAS", subcategoria: contaDescricao || "Taxas Adquirentes" };
    }
  }
  return { natureza: "DESPESAS_OPERACIONAIS", categoria: "OUTROS", subcategoria: contaDescricao || null };
}

// ─── Decisão de sync (tabela de precedência §2) ──────────────
export type AcaoSync =
  | { acao: "INSERIR"; record: Record<string, unknown> }
  | { acao: "BAIXAR"; update: Record<string, unknown>; requerValidacao: boolean }
  | { acao: "ATUALIZAR"; update: Record<string, unknown> }
  | { acao: "DIVERGENCIA"; motivo: string }
  | { acao: "NADA" };

const ESTADOS_PRE_BORDERO = ["PREVISTO"];
const ESTADOS_WORKFLOW = ["CLASSIFICADO", "BORDERO", "AUTORIZADO", "PROCESSANDO"];

export function erpDizPaga(p: ParcelaCacheRow): boolean {
  return p.situacao?.trim().toUpperCase() === "PAGA" || p.data_pagamento != null;
}

function dataBaixaErp(p: ParcelaCacheRow): string {
  return (p.data_pagamento ?? p.data_recebimento ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
}

function valorPagoErp(p: ParcelaCacheRow): number {
  const vp = Number(p.valor_pago ?? 0);
  return vp > 0 ? vp : Number(p.valor);
}

/** Monta o INSERT completo de um lançamento a partir da parcela do cache. */
export function montarLancamento(p: ParcelaCacheRow, planoMap: PlanoMap): Record<string, unknown> {
  const tipo = p.tipo_lancamento === "PAGAR" ? "PAGAR" : "RECEBER";
  const cls = autoClassify(planoMap, tipo, p.conta_numero, p.conta_descricao, p.forma_pagamento_tipo);
  const paga = erpDizPaga(p);

  const record: Record<string, unknown> = {
    cod_empresa: p.cod_empresa,
    tipo,
    descricao: p.pessoa_nome ? `${p.pessoa_nome} - ${p.documento || "Parcela ERP"}` : (p.documento || "Parcela ERP"),
    valor: Number(p.valor),
    data_vencimento: p.data_vencimento,
    data_emissao: p.data_emissao ?? null,
    pessoa_nome: p.pessoa_nome ?? null,
    forma_pagamento: p.forma_pagamento_tipo ?? null,
    natureza: cls.natureza,
    categoria: cls.categoria,
    subcategoria: cls.subcategoria,
    origem: "ERP",
    origem_id: origemIdErp(p.cod_empresa, p.parcela_id),
    erp_parcela_id: p.parcela_id,
    erp_cod_lancamento: p.cod_lancamento,
    status: paga ? "BAIXADO" : "PREVISTO",
    dados_extras: {
      conta_numero: p.conta_numero ?? null,
      conta_descricao: p.conta_descricao ?? null,
      cod_pessoa: p.cod_pessoa ?? null,
      ...(paga ? { baixa_automatica: "sync-ledger" } : {}),
    },
  };

  if (paga) {
    record.valor_pago = valorPagoErp(p);
    record.data_pagamento = dataBaixaErp(p);
    record.data_baixa = dataBaixaErp(p);
  }

  return record;
}

/**
 * Decide o que fazer com uma parcela do cache dado o lançamento existente (ou não).
 * Implementa a tabela de precedência da SPEC_P2 §2 — nunca reabre nem re-baixa
 * o que o P1/BTG já fechou.
 */
export function decidirSync(
  p: ParcelaCacheRow,
  atual: LancamentoAtual | null,
  planoMap: PlanoMap,
): AcaoSync {
  if (!atual) {
    return { acao: "INSERIR", record: montarLancamento(p, planoMap) };
  }

  const paga = erpDizPaga(p);

  if (atual.status === "CANCELADO") return { acao: "NADA" };

  if (atual.status === "BAIXADO") {
    // Já fechado (por BTG/extrato/humano ou por sync anterior).
    if (!paga) {
      // ERP diz aberto mas ledger baixou — não reabre; registra divergência.
      return { acao: "DIVERGENCIA", motivo: "ERP em aberto, ledger BAIXADO — não reaberto" };
    }
    return { acao: "NADA" };
  }

  if (paga) {
    const emWorkflow = ESTADOS_WORKFLOW.includes(atual.status);
    return {
      acao: "BAIXAR",
      requerValidacao: emWorkflow,
      update: {
        status: "BAIXADO",
        valor_pago: valorPagoErp(p),
        data_pagamento: dataBaixaErp(p),
        data_baixa: dataBaixaErp(p),
        ...(emWorkflow ? { requer_validacao: true, observacao: "Pago no ERP durante workflow de borderô — conferir duplicidade" } : {}),
      },
    };
  }

  // ERP em aberto: atualizações de valor/vencimento só em estado pré-borderô
  if (ESTADOS_PRE_BORDERO.includes(atual.status)) {
    const valorMudou = Math.abs(Number(atual.valor) - Number(p.valor)) > 0.009;
    const vencMudou = (atual.data_vencimento ?? "") !== (p.data_vencimento ?? "");
    if (valorMudou || vencMudou) {
      return {
        acao: "ATUALIZAR",
        update: {
          valor: Number(p.valor),
          data_vencimento: p.data_vencimento,
        },
      };
    }
  }

  return { acao: "NADA" };
}
