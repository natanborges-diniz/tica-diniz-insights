// O que está parado e precisa de alguém — de todas as lojas, num lugar só.
//
// O caso que originou isto: um fornecedor cobrou porque não tinha recebido. O
// sistema sabia — o borderô estava enviado e o item nunca voltou processado —
// mas essa informação só aparecia dentro do borderô, numa loja específica, para
// quem fosse olhar. Dez lojas, ninguém olha uma por uma todo dia.
//
// A pergunta que este módulo responde é "o que exige ação agora?". Borderô
// agendado para semana que vem não exige nada e não entra. Borderô enviado cuja
// data já passou e não voltou pago exige — provavelmente está esperando o master
// autorizar no aplicativo do BTG, que é uma etapa fora deste sistema.
//
// Módulo puro, testado por Vitest.

import type { ComposicaoBordero } from "./borderoEstado.ts";

export type TipoPendencia =
  /** Enviado ao banco, data chegou, e o pagamento não voltou processado. */
  | "AGUARDANDO_BANCO"
  /** Aprovado internamente e ninguém enviou. */
  | "AGUARDANDO_ENVIO"
  /** Em montagem com a data de pagamento já vencida. */
  | "MONTAGEM_ATRASADA"
  /** O banco recusou itens — o fornecedor não recebeu. */
  | "RECUSADO";

export type Severidade = "ALTA" | "MEDIA" | "BAIXA";

export interface BorderoParaPainel {
  id: string;
  cod_empresa: number;
  descricao: string | null;
  status: string;
  tipo?: string | null;
  data_pagamento: string | null;
  total_valor: number;
  composicao?: ComposicaoBordero | null;
}

export interface Pendencia {
  bordero_id: string;
  cod_empresa: number;
  descricao: string;
  tipo: TipoPendencia;
  severidade: Severidade;
  /** Dias desde a data em que o dinheiro deveria ter saído. */
  dias_parado: number;
  /** Valor que ainda não saiu (não o total do borderô). */
  valor_pendente: number;
  qtd_pendente: number;
  mensagem: string;
  acao: string;
}

/** Diferença em dias entre duas datas yyyy-MM-dd, sem passar por fuso. */
export function diasEntre(de: string, ate: string): number {
  const emUtc = (d: string) => {
    const [a, m, dia] = d.slice(0, 10).split("-").map(Number);
    return Date.UTC(a, m - 1, dia);
  };
  return Math.round((emUtc(ate) - emUtc(de)) / 86400000);
}

/**
 * Severidade pelo tempo parado.
 *
 * Um dia é o banco processando; três dias já é alguém esquecendo de autorizar;
 * uma semana é o fornecedor ligando — que foi exatamente como descobrimos.
 */
export function severidadePorDias(dias: number): Severidade {
  if (dias >= 5) return "ALTA";
  if (dias >= 2) return "MEDIA";
  return "BAIXA";
}

const rotulo = (b: BorderoParaPainel) =>
  b.descricao || `Borderô ${b.id.slice(0, 8).toUpperCase()}`;

/**
 * Classifica um borderô. Devolve null quando não há nada a fazer — processado,
 * cancelado, ou agendado para uma data que ainda não chegou.
 */
export function pendenciaDoBordero(b: BorderoParaPainel, hoje: string): Pendencia | null {
  const st = String(b.status ?? "").toUpperCase();
  if (["PROCESSADO", "CANCELADO"].includes(st)) return null;

  const c = b.composicao;
  const base = {
    bordero_id: b.id,
    cod_empresa: b.cod_empresa,
    descricao: rotulo(b),
  };

  // Recusa do banco vem primeiro: é o único caso em que o dinheiro definitivamente
  // não saiu e ninguém vai tentar de novo sozinho.
  if (c && c.rejeitados > 0) {
    const dias = b.data_pagamento ? Math.max(0, diasEntre(b.data_pagamento, hoje)) : 0;
    return {
      ...base,
      tipo: "RECUSADO",
      severidade: "ALTA",
      dias_parado: dias,
      valor_pendente: 0, // o valor recusado está no detalhe do borderô
      qtd_pendente: c.rejeitados,
      mensagem: `${c.rejeitados} pagamento(s) recusado(s) pelo banco${c.pagos > 0 ? ` · ${c.pagos} pago(s)` : ""}`,
      acao: "Abra o borderô, corrija os dados do pagamento e monte um novo para esses títulos",
    };
  }

  if (st === "ENVIADO") {
    if (!c || c.pendentes === 0) return null;

    // Data futura é agendamento, não demora.
    const previsto = c.proxima_data ?? b.data_pagamento;
    if (previsto && previsto > hoje) return null;

    const dias = previsto ? Math.max(0, diasEntre(previsto, hoje)) : 0;
    return {
      ...base,
      tipo: "AGUARDANDO_BANCO",
      severidade: severidadePorDias(dias),
      dias_parado: dias,
      valor_pendente: Number(b.total_valor),
      qtd_pendente: c.pendentes,
      mensagem: dias === 0
        ? `${c.pendentes} pagamento(s) enviados hoje, ainda sem retorno do banco`
        : `${c.pendentes} pagamento(s) sem retorno há ${dias} dia(s)`,
      acao: "Confira no aplicativo do BTG se o lote está aguardando autorização do master",
    };
  }

  if (st === "APROVADO") {
    const dias = b.data_pagamento ? Math.max(0, diasEntre(b.data_pagamento, hoje)) : 0;
    return {
      ...base,
      tipo: "AGUARDANDO_ENVIO",
      severidade: b.data_pagamento && b.data_pagamento <= hoje ? severidadePorDias(dias) : "BAIXA",
      dias_parado: dias,
      valor_pendente: Number(b.total_valor),
      qtd_pendente: c?.total ?? 0,
      mensagem: "Aprovado e ainda não enviado ao banco",
      acao: "Envie o borderô ao BTG",
    };
  }

  if (st === "MONTAGEM") {
    // Rascunho só vira pendência quando a data de pagamento já passou: até lá,
    // é trabalho em andamento e não deve competir por atenção.
    if (!b.data_pagamento || b.data_pagamento > hoje) return null;
    if (!c || c.total === 0) return null;

    const dias = Math.max(0, diasEntre(b.data_pagamento, hoje));
    return {
      ...base,
      tipo: "MONTAGEM_ATRASADA",
      severidade: severidadePorDias(dias),
      dias_parado: dias,
      valor_pendente: Number(b.total_valor),
      qtd_pendente: c.total,
      mensagem: `Em montagem, com data de pagamento vencida há ${dias} dia(s)`,
      acao: "Aprove e envie, ou ajuste a data do borderô",
    };
  }

  return null;
}

/** Mais grave primeiro; empate desempata por tempo parado e valor. */
const PESO: Record<Severidade, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 };

export function ordenarPendencias(itens: Pendencia[]): Pendencia[] {
  return [...itens].sort((a, b) =>
    PESO[a.severidade] - PESO[b.severidade] ||
    b.dias_parado - a.dias_parado ||
    b.valor_pendente - a.valor_pendente
  );
}

export interface ResumoPainel {
  total: number;
  alta: number;
  valor_total: number;
  por_tipo: Record<string, number>;
  /** Lojas com alguma pendência — o operador precisa saber onde olhar. */
  lojas: number[];
}

export function resumirPendencias(itens: Pendencia[]): ResumoPainel {
  const porTipo: Record<string, number> = {};
  const lojas = new Set<number>();
  let alta = 0;
  let valor = 0;

  for (const p of itens) {
    porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1;
    lojas.add(p.cod_empresa);
    if (p.severidade === "ALTA") alta++;
    valor += p.valor_pendente;
  }

  return {
    total: itens.length,
    alta,
    valor_total: Math.round(valor * 100) / 100,
    por_tipo: porTipo,
    lojas: [...lojas].sort((a, b) => a - b),
  };
}
