// supabase/functions/_shared/conciliacaoMotor.ts
// E3 — Motor de matching da conciliação 3 vias (SPEC_P1_CONCILIACAO_3VIAS.md §4.1)
// Módulo PURO (sem Deno/Supabase) para ser testável via Vitest:
// src/lib/financeiro/__tests__/conciliacaoMotor.test.ts
//
// Waterfall por prioridade — primeira fase que casar vence; ambiguidade nunca casa sozinha:
//   F0 identidade (mesmo paymentId/endToEndId/externalId dos dois lados)
//   F1 referência forte (pagamentos BTG / cobranças / lançamentos baixados por polling)
//   F2 recebíveis de cartão (individual ou combinação do dia, tolerância max(R$1, 1%))
//   F3 lançamento individual (valor exato, ±3d score 90 / ±7d score 70)
//   F4 regras de classificação (tarifas — único caminho de criação automática de lançamento)

export interface ExtratoEntry {
  id: string;
  cod_empresa: number;
  data_lancamento: string; // YYYY-MM-DD
  descricao: string | null;
  valor: number;
  tipo: "CREDITO" | "DEBITO";
  /** Extraídos do payload BTG (dados_extras) quando disponíveis — desempate */
  bandeira?: string | null;
  cnpj_contraparte?: string | null;
  /** Identificadores do movimento (paymentId, endToEndId, externalId, …) — F0 */
  referencias?: string[];
}

// ─── Identificadores ─────────────────────────────────────────
// Chaves que o BTG usa para nomear "este pagamento" — nos webhooks, na consulta
// de pagamentos e no extrato. Quando o mesmo identificador aparece dos dois
// lados, não há o que adivinhar: é o mesmo fato.
const CHAVES_REFERENCIA = new Set([
  "endtoendid", "e2eid", "endtoend",
  "paymentid", "transactionid", "transactionidentification", "entryid",
  "externalid", "clientcode", "correlationid", "txid", "authenticationcode",
]);

/** E2E do Pix: E + ISPB(8) + yyyyMMddHHmm(12) + sufixo(11) = 32 caracteres. */
const RE_E2E = /\bE\d{8}[0-9A-Za-z]{23}\b/g;
const RE_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function normalizarReferencia(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  // Identificador curto demais não identifica nada: "1", "OK", códigos de banco.
  // O piso de 8 evita casar por acaso e ainda aceita transactionId curto do BTG.
  return s.length >= 8 && s.length <= 120 ? s : null;
}

/**
 * Varre o payload bruto do extrato atrás de identificadores do pagamento.
 *
 * Recursivo porque o BTG aninha (`data.payment.endToEndId`), e complementado por
 * regex no texto: o E2E costuma vir embutido na descrição do movimento, fora de
 * qualquer campo nomeado. UUID entra porque é o formato do nosso `externalId`
 * (id do lançamento) — se o banco devolver, casamos direto com o lançamento.
 */
export function extrairReferencias(dadosExtras: unknown): string[] {
  const achados = new Set<string>();

  const visitar = (no: unknown, profundidade: number) => {
    if (no == null || profundidade > 6) return;
    if (Array.isArray(no)) {
      for (const item of no) visitar(item, profundidade + 1);
      return;
    }
    if (typeof no !== "object") return;
    for (const [k, v] of Object.entries(no as Record<string, unknown>)) {
      if (v != null && typeof v !== "object" && CHAVES_REFERENCIA.has(k.toLowerCase())) {
        const ref = normalizarReferencia(v);
        if (ref) achados.add(ref);
      }
      visitar(v, profundidade + 1);
    }
  };
  visitar(dadosExtras, 0);

  if (dadosExtras != null) {
    const texto = typeof dadosExtras === "string" ? dadosExtras : JSON.stringify(dadosExtras);
    for (const re of [RE_E2E, RE_UUID]) {
      re.lastIndex = 0;
      for (const m of texto.matchAll(re)) {
        const ref = normalizarReferencia(m[0]);
        if (ref) achados.add(ref);
      }
    }
  }

  return [...achados];
}

/**
 * Identificadores do lado de cá: o que sabemos sobre o pagamento de um
 * lançamento, para comparar com o que veio no extrato.
 *
 * O próprio id entra porque é o que mandamos ao banco como `tags.externalId`.
 * Vale mesmo antes da baixa: um lançamento ainda PROCESSANDO já tem essa
 * âncora, e é justamente ele que costuma aparecer no extrato primeiro.
 */
export function referenciasDoLancamento(
  id: string,
  dadosExtras: Record<string, unknown> | null | undefined,
): string[] {
  const d = dadosExtras ?? {};
  const guardadas = Array.isArray(d.btg_referencias) ? d.btg_referencias : [];
  const brutas = [
    id,
    ...guardadas,
    d.btg_payment_id,
    d.btg_end_to_end_id,
    d.btg_authentication_code,
  ];
  const vistos = new Set<string>();
  for (const v of brutas) {
    const ref = normalizarReferencia(v);
    if (ref) vistos.add(ref);
  }
  return [...vistos];
}

/** Há identificador em comum entre os dois lados? */
export function referenciasCasam(a?: string[] | null, b?: string[] | null): boolean {
  if (!a?.length || !b?.length) return false;
  const setB = new Set(b);
  return a.some((r) => setB.has(r));
}

// Extrai bandeira e CNPJ do payload bruto do BTG. Formato observado em produção
// (créditos de cartão): category.name = CARD_RECEIVABLES e
// descriptionDetails = "REDECARD - <Bandeira><Crédito|Débito> | CNPJ: <cnpj>"
export function extrairPistasPayload(dadosExtras: Record<string, unknown> | null | undefined): {
  bandeira: string | null;
  cnpj_contraparte: string | null;
} {
  if (!dadosExtras) return { bandeira: null, cnpj_contraparte: null };
  const texto = JSON.stringify(dadosExtras);

  const cnpjMatch = texto.match(/CNPJ[:\s"]*([\d][\d./-]{12,17}[\d])/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/\D/g, "") : null;

  let bandeira: string | null = null;
  const bandMatch = texto.match(/(?:REDECARD|CIELO|GETNET|STONE)\s*-\s*([A-Za-zÀ-ú ]+?)\s*(?:Cr[ée]dito|D[ée]bito)/i);
  if (bandMatch) bandeira = bandMatch[1].trim().toUpperCase();
  else {
    const nomeBand = texto.match(/\b(VISA|MASTERCARD|MASTER|ELO|AMEX|HIPERCARD)\b/i);
    if (nomeBand) bandeira = nomeBand[1].toUpperCase();
  }
  if (bandeira === "MASTER") bandeira = "MASTERCARD";

  return { bandeira, cnpj_contraparte: cnpj };
}

function bandeiraIgual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const na = a.toUpperCase().replace("MASTER CARD", "MASTERCARD");
  const nb = b.toUpperCase().replace("MASTER CARD", "MASTERCARD");
  return na.includes(nb) || nb.includes(na);
}

export interface CandidatoForte {
  alvo_tipo: "PAGAMENTO_BTG" | "COBRANCA_BTG" | "LANCAMENTO";
  id: string;
  valor: number;
  data: string | null; // data de pagamento/execução
  label: string;
  /** paymentId, endToEndId, código de autenticação, o próprio id (externalId) — F0 */
  referencias?: string[];
}

export interface CandidatoRecebivel {
  id: string;
  valor_liquido: number;
  data_vencimento: string;
  adquirente?: string | null;
  bandeira?: string | null;
}

export interface CandidatoLancamento {
  id: string;
  tipo: "PAGAR" | "RECEBER";
  valor: number;
  data_vencimento: string;
  label?: string;
}

export interface RegraClassificacao {
  id: string;
  cod_empresa: number | null;
  padrao_descricao: string;
  tipo: "CREDITO" | "DEBITO";
  natureza: string;
  categoria: string | null;
  auto_conciliar: boolean;
  valor_max: number | null;
  /** TARIFA: cria lançamento (dialog de regras). CLASSIFICAR: só classifica e
   *  concilia a linha (regra permanente criada pelo fluxo de classificação). */
  acao?: "TARIFA" | "CLASSIFICAR";
}

// Mesma normalização usada ao salvar regras permanentes (btg-extrato/conciliar-extrato)
export function normalizarDescricao(descricao: unknown): string {
  return String(descricao ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function regraCasa(regra: RegraClassificacao, descricao: string): boolean {
  if ((regra.acao ?? "TARIFA") === "CLASSIFICAR") {
    // Regra permanente guarda a descrição normalizada literal — igualdade, não regex
    return normalizarDescricao(descricao) === regra.padrao_descricao;
  }
  try {
    return new RegExp(regra.padrao_descricao, "i").test(descricao);
  } catch {
    return false; // regex inválida cadastrada — ignora a regra
  }
}

export interface Pools {
  fortes: CandidatoForte[];
  recebiveis: CandidatoRecebivel[];
  lancamentos: CandidatoLancamento[];
  regras: RegraClassificacao[]; // pré-ordenadas: específicas da empresa antes das globais
}

export interface Alocacao {
  alvo_tipo: string;
  alvo_id: string | null;
  valor_alocado: number;
  natureza?: string;
  categoria?: string;
  descricao?: string;
  observacao?: string;
}

export interface Sugestao {
  alvo_tipo: string;
  alvo_id: string;
  score: number;
  motivo: string;
}

export interface MatchResult {
  status: "MATCH" | "SUGESTAO" | "NENHUM";
  metodo?: "IDENTIDADE" | "EXATO" | "TOLERANCIA" | "AGRUPADO" | "REGRA";
  score?: number;
  alocacoes?: Alocacao[];
  /** Presente quando a regra é de classificação pura: concilia sem criar lançamento */
  classificacao?: { natureza: string; regra_id: string };
  sugestoes: Sugestao[];
}

const CENTAVO = 0.011; // tolerância de arredondamento (1 centavo)

export function diffDias(a: string, b: string): number {
  const da = new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime();
  const db = new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.abs(da - db) / 86400000;
}

// Janela de recebível: mesmo dia ±1; se o extrato caiu numa segunda-feira,
// aceita até 3 dias (crédito de sexta/fim de semana).
export function janelaRecebivel(dataExtrato: string, dataVenc: string): boolean {
  const diff = diffDias(dataExtrato, dataVenc);
  if (diff <= 1) return true;
  const weekday = new Date(`${dataExtrato.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return weekday === 1 && diff <= 3;
}

export function tolReceb(valor: number): number {
  return Math.max(1, valor * 0.01); // mesmo padrão de btg-recebiveis-cartao
}

function chave(tipo: string, id: string): string {
  return `${tipo}|${id}`;
}

// ─── F2: combinações de recebíveis do mesmo dia ──────────────
// Retorna todos os subconjuntos (2..5 itens) cuja soma cai na tolerância.
export function combinacoesRecebiveis(
  candidatos: CandidatoRecebivel[],
  alvo: number,
  tol: number
): CandidatoRecebivel[][] {
  const MAX_CANDIDATOS = 12;
  const MAX_ITENS = 5;
  const pool = candidatos.slice(0, MAX_CANDIDATOS);
  const resultados: CandidatoRecebivel[][] = [];

  const rec = (inicio: number, atual: CandidatoRecebivel[], soma: number) => {
    if (atual.length >= 2 && Math.abs(soma - alvo) <= tol) {
      resultados.push([...atual]);
      // não retorna: pode existir superset também válido, mas subsets menores têm prioridade natural
    }
    if (atual.length >= MAX_ITENS || soma - alvo > tol) return;
    for (let i = inicio; i < pool.length; i++) {
      atual.push(pool[i]);
      rec(i + 1, atual, soma + pool[i].valor_liquido);
      atual.pop();
    }
  };
  rec(0, [], 0);
  return resultados;
}

// Ajusta a última alocação para a soma fechar exatamente no valor do extrato
// (diferenças dentro da tolerância — ex.: ajuste de taxa — são absorvidas na última).
function alocarFechado(itens: Array<{ alvo_tipo: string; alvo_id: string; valor: number }>, valorExtrato: number): Alocacao[] {
  const alocacoes: Alocacao[] = itens.map((i) => ({
    alvo_tipo: i.alvo_tipo,
    alvo_id: i.alvo_id,
    valor_alocado: Math.round(i.valor * 100) / 100,
  }));
  const soma = alocacoes.reduce((s, a) => s + a.valor_alocado, 0);
  const delta = Math.round((valorExtrato - soma) * 100) / 100;
  if (delta !== 0 && alocacoes.length > 0) {
    const ultima = alocacoes[alocacoes.length - 1];
    ultima.valor_alocado = Math.round((ultima.valor_alocado + delta) * 100) / 100;
    ultima.observacao = `Ajuste de ${delta.toFixed(2)} absorvido (diferença extrato × alvo)`;
  }
  return alocacoes;
}

// ─── Motor principal ─────────────────────────────────────────
export function matchEntry(entry: ExtratoEntry, pools: Pools, usados: Set<string>): MatchResult {
  const sugestoes: Sugestao[] = [];

  // ── F0: identidade — o banco já disse qual pagamento é este ──
  //
  // Quando o borderô volta processado, o retorno traz paymentId, endToEndId e o
  // externalId que enviamos (o id do lançamento). Guardamos isso na baixa; o
  // extrato traz os mesmos identificadores. Casar por valor e data nesse caso é
  // adivinhar o que já está escrito — e adivinhar erra: dois boletos de R$ 122,60
  // no mesmo dia viram ambiguidade e caem na fila do operador, quando o banco
  // sabe exatamente qual é qual.
  //
  // Sem valor nem data na comparação de propósito: o débito pode sair com valor
  // ajustado pelo título registrado e em data diferente da combinada. O
  // identificador não muda por isso.
  if (entry.referencias?.length) {
    const porIdentidade = pools.fortes.filter(
      (c) => !usados.has(chave(c.alvo_tipo, c.id)) && referenciasCasam(entry.referencias, c.referencias),
    );
    if (porIdentidade.length === 1) {
      const c = porIdentidade[0];
      return {
        status: "MATCH",
        metodo: "IDENTIDADE",
        score: 100,
        alocacoes: [{ alvo_tipo: c.alvo_tipo, alvo_id: c.id, valor_alocado: entry.valor }],
        sugestoes: [],
      };
    }
    // Mais de um alvo com o mesmo identificador é dado inconsistente, não
    // ambiguidade legítima: não casa e segue para as fases por valor.
    for (const c of porIdentidade) {
      sugestoes.push({
        alvo_tipo: c.alvo_tipo,
        alvo_id: c.id,
        score: 95,
        motivo: `${c.label || "Identificador do banco"} — mesmo identificador em mais de um alvo`,
      });
    }
  }

  // ── F1: referência forte (valor ±1 centavo, data ±2 dias) ──
  const fortes = pools.fortes.filter(
    (c) =>
      !usados.has(chave(c.alvo_tipo, c.id)) &&
      Math.abs(c.valor - entry.valor) <= CENTAVO &&
      (c.data == null || diffDias(entry.data_lancamento, c.data) <= 2)
  );
  if (fortes.length === 1) {
    const c = fortes[0];
    return {
      status: "MATCH",
      metodo: "EXATO",
      score: 100,
      alocacoes: [{ alvo_tipo: c.alvo_tipo, alvo_id: c.id, valor_alocado: entry.valor }],
      sugestoes: [],
    };
  }
  for (const c of fortes) {
    sugestoes.push({
      alvo_tipo: c.alvo_tipo,
      alvo_id: c.id,
      score: 85,
      motivo: `${c.label || "Referência forte"} — R$ ${c.valor.toFixed(2)}${c.data ? ` · ${c.data.slice(0, 10)}` : ""} (ambíguo)`,
    });
  }

  // ── F2: recebíveis de cartão (apenas créditos) ──
  if (entry.tipo === "CREDITO") {
    const tol = tolReceb(entry.valor);
    const cands = pools.recebiveis.filter(
      (r) => !usados.has(chave("RECEBIVEL_CARTAO", r.id)) && janelaRecebivel(entry.data_lancamento, r.data_vencimento)
    );

    let individuais = cands.filter((r) => Math.abs(r.valor_liquido - entry.valor) <= tol);
    // Desempate por bandeira (payload BTG traz "REDECARD - <Bandeira>..."):
    // se vários candidatos têm o mesmo valor, mas só um bate a bandeira, ele vence.
    if (individuais.length > 1 && entry.bandeira) {
      const daBandeira = individuais.filter((r) => bandeiraIgual(entry.bandeira, r.bandeira));
      if (daBandeira.length === 1) individuais = daBandeira;
    }
    if (individuais.length === 1) {
      const r = individuais[0];
      const exato = Math.abs(r.valor_liquido - entry.valor) <= CENTAVO;
      return {
        status: "MATCH",
        metodo: exato ? "EXATO" : "TOLERANCIA",
        score: exato ? 100 : 92,
        alocacoes: alocarFechado([{ alvo_tipo: "RECEBIVEL_CARTAO", alvo_id: r.id, valor: r.valor_liquido }], entry.valor),
        sugestoes: [],
      };
    }
    if (individuais.length > 1) {
      for (const r of individuais.slice(0, 3)) {
        sugestoes.push({ alvo_tipo: "RECEBIVEL_CARTAO", alvo_id: r.id, score: 80, motivo: `Recebível ${r.adquirente ?? ""}${r.bandeira ? ` ${r.bandeira}` : ""} R$ ${r.valor_liquido.toFixed(2)} · venc. ${r.data_vencimento} (ambíguo)` });
      }
    } else {
      // combinação: o banco pode ter agregado bandeiras num crédito só
      const porData = new Map<string, CandidatoRecebivel[]>();
      for (const r of cands) {
        const arr = porData.get(r.data_vencimento) ?? [];
        arr.push(r);
        porData.set(r.data_vencimento, arr);
      }
      const combos: CandidatoRecebivel[][] = [];
      for (const grupo of porData.values()) {
        combos.push(...combinacoesRecebiveis(grupo, entry.valor, tol));
      }
      if (combos.length === 1) {
        return {
          status: "MATCH",
          metodo: "AGRUPADO",
          score: 90,
          alocacoes: alocarFechado(
            combos[0].map((r) => ({ alvo_tipo: "RECEBIVEL_CARTAO", alvo_id: r.id, valor: r.valor_liquido })),
            entry.valor
          ),
          sugestoes: [],
        };
      }
      if (combos.length > 1) {
        for (const r of combos[0].slice(0, 3)) {
          sugestoes.push({ alvo_tipo: "RECEBIVEL_CARTAO", alvo_id: r.id, score: 75, motivo: "Combinação de recebíveis ambígua" });
        }
      }
    }
  }

  // ── F3: lançamento individual (valor exato) ──
  const tipoLanc = entry.tipo === "CREDITO" ? "RECEBER" : "PAGAR";
  const lancCands = pools.lancamentos.filter(
    (l) =>
      l.tipo === tipoLanc &&
      !usados.has(chave("LANCAMENTO", l.id)) &&
      Math.abs(l.valor - entry.valor) <= CENTAVO &&
      diffDias(entry.data_lancamento, l.data_vencimento) <= 7
  );
  const janela3 = lancCands.filter((l) => diffDias(entry.data_lancamento, l.data_vencimento) <= 3);
  const melhores = janela3.length > 0 ? janela3 : lancCands;
  const scoreLanc = janela3.length > 0 ? 90 : 70;

  if (melhores.length === 1 && scoreLanc >= 90) {
    const l = melhores[0];
    return {
      status: "MATCH",
      metodo: "EXATO",
      score: scoreLanc,
      alocacoes: [{ alvo_tipo: "LANCAMENTO", alvo_id: l.id, valor_alocado: entry.valor }],
      sugestoes: [],
    };
  }
  for (const l of melhores.slice(0, 3)) {
    sugestoes.push({
      alvo_tipo: "LANCAMENTO",
      alvo_id: l.id,
      score: melhores.length === 1 ? scoreLanc : scoreLanc - 10,
      motivo: `${l.label || "Lançamento"} — R$ ${l.valor.toFixed(2)} · venc. ${l.data_vencimento}${melhores.length === 1 ? "" : " (ambíguo)"}`,
    });
  }

  // ── F4: regras — tarifas (criam lançamento) e classificação permanente (só classificam) ──
  const descricao = entry.descricao ?? "";
  for (const regra of pools.regras) {
    if (regra.tipo !== entry.tipo) continue;
    if (regra.valor_max != null && entry.valor > regra.valor_max) continue;
    if (!regraCasa(regra, descricao)) continue;

    if (regra.auto_conciliar) {
      if ((regra.acao ?? "TARIFA") === "CLASSIFICAR") {
        // Regra permanente do fluxo de classificação: NÃO cria lançamento —
        // a linha é classificada e conciliada direto (executar aplica).
        return {
          status: "MATCH",
          metodo: "REGRA",
          score: 95,
          classificacao: { natureza: regra.natureza, regra_id: regra.id },
          sugestoes: [],
        };
      }
      return {
        status: "MATCH",
        metodo: "REGRA",
        score: 95,
        alocacoes: [{
          alvo_tipo: "TARIFA",
          alvo_id: null,
          valor_alocado: entry.valor,
          natureza: regra.natureza,
          categoria: regra.categoria ?? undefined,
          descricao: descricao || `Tarifa — regra ${regra.id.slice(0, 8)}`,
          observacao: `Regra de classificação ${regra.id}`,
        }],
        sugestoes: [],
      };
    }
    sugestoes.push({ alvo_tipo: "TARIFA", alvo_id: regra.id, score: 60, motivo: `Regra "${regra.padrao_descricao}" (confirmação manual)` });
    break; // primeira regra que casa decide
  }

  sugestoes.sort((a, b) => b.score - a.score);
  return {
    status: sugestoes.length > 0 ? "SUGESTAO" : "NENHUM",
    sugestoes: sugestoes.slice(0, 3),
  };
}
