// Folha de pagamento — regras puras.
//
// Fonte: developers.empresas.btgpactual.com/reference/submitpaymentbatch
//   POST /{companyId}/banking/payroll/payments
//   Header X-Idempotency-Key (UUID v4) OBRIGATÓRIO
//   Escopo brn:btg:empresas:banking:payroll
//
// Duas características da API mandam no desenho:
//
//   1. O tipo de pagamento é do LOTE, não do item. "Salário de agosto" e
//      "férias de agosto" são remessas separadas por imposição do banco.
//   2. O item aceita banco/agência/conta de QUALQUER instituição — abrir conta
//      BTG para o colaborador é opcional, não pré-requisito.
//
// Módulo puro — testado em src/lib/financeiro/__tests__/folha.test.ts.

/** Eventos de folha, na linguagem da casa. */
export type EventoFolha =
  | "SALARIO"
  | "ADIANTAMENTO"
  | "FERIAS"
  | "DECIMO_TERCEIRO"
  | "RESCISAO"
  | "PLR"
  | "PREMIO"
  | "COMISSAO"
  | "PROLABORE"
  | "BOLSA_ESTAGIO"
  | "BENEFICIO"
  | "REEMBOLSO"
  | "DIVIDENDOS";

/**
 * Código numérico que o BTG espera em `paymentType`.
 * Não inventar valores: a API recusa fora desta lista.
 */
export const PAYMENT_TYPE_BTG: Record<EventoFolha, number> = {
  SALARIO: 2,
  PLR: 5,
  FERIAS: 9,
  DECIMO_TERCEIRO: 10,
  RESCISAO: 11,
  PREMIO: 12,
  DIVIDENDOS: 14,
  ADIANTAMENTO: 17,
  PROLABORE: 18,
  BOLSA_ESTAGIO: 19,
  BENEFICIO: 20,
  REEMBOLSO: 22,
  COMISSAO: 24,
};

export const ROTULO_EVENTO: Record<EventoFolha, string> = {
  SALARIO: "Salário",
  ADIANTAMENTO: "Adiantamento",
  FERIAS: "Férias",
  DECIMO_TERCEIRO: "13º salário",
  RESCISAO: "Rescisão",
  PLR: "PLR",
  PREMIO: "Prêmio / bonificação",
  COMISSAO: "Comissão",
  PROLABORE: "Pró-labore",
  BOLSA_ESTAGIO: "Bolsa estágio",
  BENEFICIO: "Benefício",
  REEMBOLSO: "Reembolso",
  DIVIDENDOS: "Dividendos",
};

export const EVENTOS_FOLHA = Object.keys(PAYMENT_TYPE_BTG) as EventoFolha[];

export function ehEventoFolha(v: unknown): v is EventoFolha {
  return typeof v === "string" && v in PAYMENT_TYPE_BTG;
}

// ─── Colaborador / linha da planilha ─────────────────────────

export interface LinhaFolha {
  nome: string;
  cpf: string;
  matricula?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  tipo_conta?: string | null;
  chave_pix?: string | null;
  valor_bruto?: number | null;
  descontos?: number | null;
  valor_liquido: number;
}

export interface LinhaValidada extends LinhaFolha {
  cpf: string;
  erros: string[];
  /** Sem conta completa e sem chave Pix — pendência, resolvida antes do fechamento. */
  semDestino?: boolean;
}

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** CPF com verificação dos dígitos — planilha de contador erra digitação. */
export function cpfValido(raw: unknown): boolean {
  const c = soDigitos(raw);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = (fim: number) => {
    let soma = 0;
    for (let i = 0; i < fim; i++) soma += Number(c[i]) * (fim + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

/**
 * Valida uma linha antes de gravar. Devolve os erros em vez de lançar: a
 * importação precisa mostrar tudo que está errado de uma vez, não parar no
 * primeiro problema e obrigar o usuário a corrigir de um em um.
 */
export function validarLinha(
  l: LinhaFolha,
  opcoes: { exigirDadosBancarios?: boolean } = {},
): LinhaValidada {
  const erros: string[] = [];
  const cpf = soDigitos(l.cpf);

  if (!String(l.nome ?? "").trim()) erros.push("nome vazio");
  if (!cpfValido(cpf)) erros.push(`CPF inválido (${l.cpf ?? "vazio"})`);

  const liquido = Number(l.valor_liquido);
  if (!Number.isFinite(liquido) || liquido <= 0) {
    erros.push(`valor líquido inválido (${l.valor_liquido ?? "vazio"})`);
  }

  // Sem chave pix, precisa da conta completa: o item do lote exige
  // bankCode + branchCode + accountNumber.
  //
  // Na importação isso é pendência, não erro: o relatório do contador não traz
  // banco nem Pix, e eles entram depois pela planilha de contas. Barrar aqui
  // travava a folha antes de existir competência para receber a planilha. O
  // fechamento é quem exige — lá ninguém é pago sem conta.
  const temConta = !!(soDigitos(l.banco) && soDigitos(l.agencia) && soDigitos(l.conta));
  const semDestino = !temConta && !String(l.chave_pix ?? "").trim();
  if (semDestino && opcoes.exigirDadosBancarios !== false) {
    erros.push("sem dados bancários nem chave pix");
  }

  const bruto = Number(l.valor_bruto ?? 0);
  const desc = Number(l.descontos ?? 0);
  if (bruto > 0 && Math.abs(bruto - desc - liquido) > 0.01) {
    erros.push(`bruto − descontos (${(bruto - desc).toFixed(2)}) não fecha com o líquido (${liquido.toFixed(2)})`);
  }

  return { ...l, cpf, erros, semDestino };
}

// ─── Encargos ────────────────────────────────────────────────

export type TipoEncargo = "INSS" | "FGTS" | "IRRF";

/** Dia de vencimento no mês seguinte ao da competência. */
const DIA_VENCIMENTO: Record<TipoEncargo, number> = {
  FGTS: 7,
  INSS: 20,
  IRRF: 20,
};

/**
 * Vencimento legal do encargo, antecipando fim de semana.
 *
 * A lei manda antecipar (não postergar) quando cai em dia não útil. Aqui
 * cobrimos sábado e domingo; feriado exigiria calendário bancário, e antecipar
 * demais é melhor que atrasar — multa de encargo é cara.
 */
export function vencimentoEncargo(competencia: string, tipo: TipoEncargo): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const dia = DIA_VENCIMENTO[tipo];

  // Mês seguinte ao da competência.
  const d = new Date(Date.UTC(ano, mes, dia)); // mes é 1-based; Date é 0-based → já é o mês seguinte

  const diaSemana = d.getUTCDay();
  if (diaSemana === 6) d.setUTCDate(d.getUTCDate() - 1);      // sábado → sexta
  else if (diaSemana === 0) d.setUTCDate(d.getUTCDate() - 2); // domingo → sexta

  return d.toISOString().slice(0, 10);
}

export interface EncargoCalculado {
  tipo: TipoEncargo;
  descricao: string;
  valor: number;
  data_vencimento: string;
}

/**
 * Monta os títulos de encargo a partir dos valores informados pelo contador.
 *
 * Deliberadamente NÃO calculamos alíquota: INSS e IRRF dependem de faixa,
 * dependentes e teto, e errar aqui gera passivo fiscal. O contador manda o
 * valor apurado; o sistema cuida de vencimento, conta de DRE e rastreio.
 */
export function montarEncargos(
  competencia: string,
  valores: Partial<Record<TipoEncargo, number>>,
): EncargoCalculado[] {
  const out: EncargoCalculado[] = [];
  for (const tipo of ["FGTS", "INSS", "IRRF"] as TipoEncargo[]) {
    const valor = Number(valores[tipo] ?? 0);
    if (!(valor > 0)) continue;
    out.push({
      tipo,
      descricao: `${tipo} — folha ${competencia}`,
      valor: Math.round(valor * 100) / 100,
      data_vencimento: vencimentoEncargo(competencia, tipo),
    });
  }
  return out;
}

// ─── Payload do lote ─────────────────────────────────────────

export interface ItemLote {
  taxId: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  netAmount: number;
  reference: string;
}

export interface CorpoLoteFolha {
  description: string;
  scheduledDate: string;
  paymentType: number;
  companies: Array<{
    taxId: string;
    debitParty: { branchCode: string; number: string };
    items: ItemLote[];
  }>;
}

/**
 * Corpo de POST /{companyId}/banking/payroll/payments.
 *
 * `reference` leva o id do nosso item — é a âncora de conciliação, como o
 * `tags.externalId` no fluxo de pagamentos. Sem ela, o retorno do banco não
 * teria como ser atribuído a um colaborador.
 */
export function montarLoteFolha(args: {
  evento: EventoFolha;
  descricao: string;
  dataPagamento: string;
  cnpj: string;
  debitParty: { branchCode: string; number: string };
  itens: Array<{ id: string; cpf: string; banco?: string | null; agencia?: string | null; conta?: string | null; valor_liquido: number }>;
}): CorpoLoteFolha {
  if (args.itens.length === 0) throw new Error("Folha sem colaboradores");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.dataPagamento)) {
    throw new Error(`Data de pagamento inválida ("${args.dataPagamento}") — esperado yyyy-MM-dd`);
  }

  const items: ItemLote[] = args.itens.map((i) => {
    const bankCode = soDigitos(i.banco);
    const branchCode = soDigitos(i.agencia);
    const accountNumber = soDigitos(i.conta);
    if (!bankCode || !branchCode || !accountNumber) {
      throw new Error(`Colaborador ${i.cpf}: banco, agência e conta são obrigatórios no lote de folha`);
    }
    const liquido = Number(i.valor_liquido);
    if (!(liquido > 0)) throw new Error(`Colaborador ${i.cpf}: valor líquido deve ser maior que zero`);

    return {
      taxId: soDigitos(i.cpf),
      bankCode: bankCode.padStart(3, "0"),
      branchCode,
      accountNumber,
      netAmount: liquido,
      reference: i.id,
    };
  });

  return {
    description: args.descricao.slice(0, 140),
    // A API pede date-time; enviamos meio-dia UTC para não escorregar de dia
    // por fuso, o mesmo cuidado que tomamos no resto do sistema.
    scheduledDate: `${args.dataPagamento}T12:00:00Z`,
    paymentType: PAYMENT_TYPE_BTG[args.evento],
    companies: [{
      taxId: soDigitos(args.cnpj),
      debitParty: {
        branchCode: soDigitos(args.debitParty.branchCode) || "50",
        number: soDigitos(args.debitParty.number),
      },
      items,
    }],
  };
}

// ─── Retorno do lote ─────────────────────────────────────────

export interface RetornoItemFolha {
  /** O `reference` que enviamos — id do lançamento do colaborador. */
  referencia: string | null;
  status: string;
  valor: number | null;
  data: string | null;
}

export interface RetornoFolha {
  statusLote: string;
  itens: RetornoItemFolha[];
}

/**
 * Lê a resposta da consulta do lote de folha.
 *
 * Escrito para ser tolerante de propósito: a folha ainda não rodou em produção
 * (o escopo `payroll` não está liberado), então o formato exato da resposta é
 * suposição a partir da referência. Em vez de fixar um caminho e quebrar no
 * primeiro lote real, procuramos a lista de itens onde ela estiver e aceitamos
 * os nomes de campo que a API usa nos outros endpoints.
 *
 * Se nada for reconhecido, devolve lista vazia — o borderô fica como está e o
 * operador vê o status do lote, em vez de uma baixa errada.
 */
export function extrairRetornoFolha(resposta: unknown): RetornoFolha {
  const raiz = (resposta ?? {}) as Record<string, unknown>;
  const statusLote = String(
    raiz.status ?? raiz.batchStatus ?? raiz.paymentStatus ?? (raiz.data as Record<string, unknown>)?.status ?? "",
  );

  // A lista de colaboradores pode vir na raiz, dentro de `data`, ou aninhada em
  // `companies[].items` — o mesmo formato do envio.
  const candidatos: unknown[] = [];
  const push = (v: unknown) => { if (Array.isArray(v)) candidatos.push(...v); };

  for (const no of [raiz, raiz.data as Record<string, unknown> | undefined]) {
    if (!no || typeof no !== "object") continue;
    const n = no as Record<string, unknown>;
    push(n.items);
    push(n.payments);
    push(n.employees);
    for (const c of (Array.isArray(n.companies) ? n.companies : [])) {
      push((c as Record<string, unknown>)?.items);
    }
  }

  const itens: RetornoItemFolha[] = [];
  for (const bruto of candidatos) {
    if (!bruto || typeof bruto !== "object") continue;
    const i = bruto as Record<string, unknown>;
    const referencia = i.reference ?? i.externalId ?? i.referenceId ?? null;
    const valorBruto = i.netAmount ?? i.amount ?? i.paidAmount ?? null;
    itens.push({
      referencia: referencia != null ? String(referencia) : null,
      status: String(i.status ?? i.paymentStatus ?? statusLote ?? ""),
      valor: valorBruto != null ? Number(valorBruto) || null : null,
      data: i.executedAt || i.paymentDate || i.settledAt
        ? String(i.executedAt ?? i.paymentDate ?? i.settledAt).slice(0, 10)
        : null,
    });
  }

  return { statusLote, itens };
}

/** Totais de uma folha, para o cabeçalho da competência. */
export function totalizar(itens: Array<{ valor_bruto?: number | null; descontos?: number | null; valor_liquido: number }>) {
  const arred = (v: number) => Math.round(v * 100) / 100;
  return {
    qtd_colaboradores: itens.length,
    total_bruto: arred(itens.reduce((s, i) => s + Number(i.valor_bruto ?? 0), 0)),
    total_descontos: arred(itens.reduce((s, i) => s + Number(i.descontos ?? 0), 0)),
    total_liquido: arred(itens.reduce((s, i) => s + Number(i.valor_liquido), 0)),
  };
}
