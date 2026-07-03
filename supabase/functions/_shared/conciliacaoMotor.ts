// supabase/functions/_shared/conciliacaoMotor.ts
// E3 — Motor de matching da conciliação 3 vias (SPEC_P1_CONCILIACAO_3VIAS.md §4.1)
// Módulo PURO (sem Deno/Supabase) para ser testável via Vitest:
// src/lib/financeiro/__tests__/conciliacaoMotor.test.ts
//
// Waterfall por prioridade — primeira fase que casar vence; ambiguidade nunca casa sozinha:
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
}

export interface CandidatoForte {
  alvo_tipo: "PAGAMENTO_BTG" | "COBRANCA_BTG" | "LANCAMENTO";
  id: string;
  valor: number;
  data: string | null; // data de pagamento/execução
  label: string;
}

export interface CandidatoRecebivel {
  id: string;
  valor_liquido: number;
  data_vencimento: string;
  adquirente?: string | null;
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
  metodo?: "EXATO" | "TOLERANCIA" | "AGRUPADO" | "REGRA";
  score?: number;
  alocacoes?: Alocacao[];
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
    sugestoes.push({ alvo_tipo: c.alvo_tipo, alvo_id: c.id, score: 85, motivo: `Referência forte ambígua: ${c.label}` });
  }

  // ── F2: recebíveis de cartão (apenas créditos) ──
  if (entry.tipo === "CREDITO") {
    const tol = tolReceb(entry.valor);
    const cands = pools.recebiveis.filter(
      (r) => !usados.has(chave("RECEBIVEL_CARTAO", r.id)) && janelaRecebivel(entry.data_lancamento, r.data_vencimento)
    );

    const individuais = cands.filter((r) => Math.abs(r.valor_liquido - entry.valor) <= tol);
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
        sugestoes.push({ alvo_tipo: "RECEBIVEL_CARTAO", alvo_id: r.id, score: 80, motivo: `Recebível ${r.adquirente ?? ""} ${r.data_vencimento} (ambíguo)` });
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
      motivo: melhores.length === 1 ? `Vencimento ${l.data_vencimento} (janela 7d)` : `Candidato ambíguo — venc. ${l.data_vencimento}`,
    });
  }

  // ── F4: regras de classificação (tarifas) ──
  const descricao = entry.descricao ?? "";
  for (const regra of pools.regras) {
    if (regra.tipo !== entry.tipo) continue;
    if (regra.valor_max != null && entry.valor > regra.valor_max) continue;
    let re: RegExp;
    try {
      re = new RegExp(regra.padrao_descricao, "i");
    } catch {
      continue; // regex inválida cadastrada — ignora a regra
    }
    if (!re.test(descricao)) continue;

    if (regra.auto_conciliar) {
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
