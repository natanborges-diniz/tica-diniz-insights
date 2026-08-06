// Devolver ao preparo o pagamento que o banco não executou.
//
// Quando o BTG recusa um item, ele volta como AUTORIZADO com `requer_validacao`
// e a observação "revisar dados e reenviar". Só que `criarBordero` aceita
// apenas PREVISTO e CLASSIFICADO, e o item continua preso ao borderô antigo —
// não havia como reenviar coisa nenhuma. O título ficava visível, marcado para
// correção, e sem saída.
//
// A saída NÃO é reenviar o mesmo borderô. Ele já tem um lote no BTG, e nesse
// lote em geral há itens que foram pagos: reabrir arriscaria pagar duas vezes
// quem já recebeu, e Pix não volta. O caminho seguro é soltar o título e montar
// um borderô novo — lote novo, chave de idempotência nova, nada ambíguo do lado
// do banco.
//
// Módulo puro, testado por Vitest.

export interface ItemParaReenvio {
  id: string;
  descricao?: string | null;
  status: string;
  requer_validacao?: boolean | null;
  /** Preenchido quando o banco chegou a executar — aí não se reenvia nada. */
  data_baixa?: string | null;
  valor_pago?: number | null;
  /** Status devolvido pelo BTG na última tentativa. */
  btg_payment_status?: string | null;
}

export type MotivoBloqueio =
  | "JA_PAGO"
  | "EM_TRANSITO"
  | "NAO_RECUSADO";

export interface Decisao {
  id: string;
  descricao: string;
  liberar: boolean;
  motivo?: MotivoBloqueio;
  explicacao?: string;
}

/**
 * Quem pode voltar para o preparo.
 *
 * A regra é conservadora de propósito: na dúvida sobre o dinheiro ter saído,
 * não liberamos. Liberar um título já pago faria o operador montar um segundo
 * pagamento do mesmo boleto, e esse erro custa dinheiro de verdade.
 */
export function decidirReenvio(item: ItemParaReenvio): Decisao {
  const descricao = String(item.descricao ?? item.id);
  const st = String(item.status ?? "").toUpperCase();

  if (st === "BAIXADO" || item.data_baixa || (item.valor_pago ?? 0) > 0) {
    return {
      id: item.id,
      descricao,
      liberar: false,
      motivo: "JA_PAGO",
      explicacao: "O pagamento foi executado — reenviar pagaria duas vezes",
    };
  }

  if (st === "PROCESSANDO") {
    return {
      id: item.id,
      descricao,
      liberar: false,
      motivo: "EM_TRANSITO",
      explicacao:
        "Ainda em trânsito no banco. Consulte o retorno; se o lote estiver aguardando " +
        "autorização do master no app do BTG, ele ainda pode ser pago",
    };
  }

  // Recusado: o banco devolveu o item e o marcou para revisão.
  if (st === "AUTORIZADO" && item.requer_validacao) {
    return { id: item.id, descricao, liberar: true };
  }

  return {
    id: item.id,
    descricao,
    liberar: false,
    motivo: "NAO_RECUSADO",
    explicacao: `Status ${st} não indica recusa do banco — nada a reenviar`,
  };
}

/**
 * Por que o lote não foi liquidado.
 *
 * Estruturado, e não texto livre, por dois motivos: a orientação ao operador
 * muda conforme o caso (fora de horário se resolve reenviando amanhã; sem saldo
 * exige provisão antes), e porque só contando dá para descobrir que "fora de
 * horário" é recorrente — o que é problema de processo, não de operador.
 */
export type MotivoNaoLiquidado =
  /** Enviado fora da janela do tipo de operação (TED após o corte, por exemplo). */
  | "FORA_HORARIO"
  /** Conta sem saldo no momento da liquidação. */
  | "SEM_SALDO"
  /** O master não autorizou no app e a data passou. */
  | "NAO_AUTORIZADO"
  /** O lote caducou no banco. */
  | "EXPIROU"
  | "OUTRO";

export const MOTIVOS_NAO_LIQUIDADO: Array<{ valor: MotivoNaoLiquidado; rotulo: string; orientacao: string }> = [
  {
    valor: "FORA_HORARIO",
    rotulo: "Enviado fora do horário da operação",
    orientacao: "Reenvie dentro da janela do tipo de pagamento — TED e boleto têm corte no fim da tarde; Pix não tem",
  },
  {
    valor: "SEM_SALDO",
    rotulo: "Conta sem saldo na liquidação",
    orientacao: "Garanta o saldo antes de reenviar, senão a recusa se repete",
  },
  {
    valor: "NAO_AUTORIZADO",
    rotulo: "O master não autorizou a tempo",
    orientacao: "Combine a autorização antes de reenviar — o lote novo também depende dela",
  },
  { valor: "EXPIROU", rotulo: "O lote caducou no banco", orientacao: "Reenvie com data nova" },
  { valor: "OUTRO", rotulo: "Outro motivo", orientacao: "Descreva o que aconteceu" },
];

export function ehMotivoNaoLiquidado(v: unknown): v is MotivoNaoLiquidado {
  return MOTIVOS_NAO_LIQUIDADO.some((m) => m.valor === v);
}

export interface ResultadoReenvio {
  liberar: string[];
  bloqueados: Decisao[];
}

export function separarParaReenvio(itens: ItemParaReenvio[]): ResultadoReenvio {
  const decisoes = itens.map(decidirReenvio);
  return {
    liberar: decisoes.filter((d) => d.liberar).map((d) => d.id),
    bloqueados: decisoes.filter((d) => !d.liberar),
  };
}

/**
 * Estado em que o título volta.
 *
 * CLASSIFICADO, não PREVISTO: a conta do DRE e a forma de pagamento continuam
 * lá, e refazer essa parte seria retrabalho puro — o que falhou foi o envio, não
 * a classificação. Sai do borderô antigo e perde a autorização, porque a
 * autorização é do lote que já foi.
 */
export function estadoDeVolta(observacaoBanco?: string | null): Record<string, unknown> {
  const motivo = String(observacaoBanco ?? "").trim();
  return {
    status: "CLASSIFICADO",
    bordero_id: null,
    autorizado_por: null,
    autorizado_em: null,
    requer_validacao: false,
    observacao: motivo
      ? `Devolvido ao preparo após recusa do banco (${motivo}). Monte um novo borderô.`
      : "Devolvido ao preparo após recusa do banco. Monte um novo borderô.",
  };
}
