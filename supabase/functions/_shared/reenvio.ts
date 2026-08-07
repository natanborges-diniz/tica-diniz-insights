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
/** Status do BTG que encerram a tentativa sem pagamento. */
const FALHA_BTG = new Set([
  "FAILED", "FAILURE", "REJECTED", "REFUSED", "DENIED", "ERROR",
  "CANCELLED", "CANCELED", "INVALIDATED", "INVALID", "EXPIRED",
  "REVERSED", "RETURNED", "NOT_AUTHORIZED", "UNAUTHORIZED",
]);

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

  // "Em trânsito" só vale enquanto o banco não deu resposta final. Havia boleto
  // com FAILED no BTG preso em PROCESSANDO: o painel pedia autorização que não
  // existia e o botão de devolver ao preparo se recusava a agir. Resposta final
  // negativa do banco libera a correção.
  const respostaFinalNegativa = FALHA_BTG.has(
    String(item.btg_payment_status ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_"),
  );

  if (st === "PROCESSANDO" && !respostaFinalNegativa) {
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
  // AUTORIZADO ou em borderô e sem baixa: o dinheiro não saiu, então corrigir
  // conta, linha digitável ou vencimento exige voltar ao preparo — é lá que os
  // campos são editáveis. Antes só liberávamos com `requer_validacao`, e o
  // título reaberto de um borderô desfeito ficava travado em AUTORIZADO sem
  // nenhuma saída na tela.
  if (["AUTORIZADO", "BORDERO", "AGRUPADO", "CLASSIFICADO", "PREVISTO"].includes(st) ||
      (st === "PROCESSANDO" && respostaFinalNegativa)) {
    return { id: item.id, descricao, liberar: true };
  }

  return {
    id: item.id,
    descricao,
    liberar: false,
    motivo: "NAO_RECUSADO",
    explicacao: `Status ${st} não permite voltar ao preparo`,
  };
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
export function estadoDeVolta(
  dadosExtras?: Record<string, unknown> | null,
): Record<string, unknown> {
  const extras = dadosExtras ?? {};
  const naoChegou = Boolean(extras.btg_envio_rejeitado);
  const motivo = String(
    extras.btg_motivo_recusa ?? extras.btg_motivo_envio ?? extras.btg_payment_status ?? "",
  ).trim();
  const historicoAnterior = Array.isArray(extras.btg_tentativas_anteriores)
    ? extras.btg_tentativas_anteriores
    : [];
  const tentativaAnterior = {
    payment_id: extras.btg_payment_id ?? null,
    batch_id: extras.btg_batch_id ?? null,
    external_id: extras.btg_external_id ?? null,
    status: extras.btg_payment_status ?? null,
    motivo_recusa: extras.btg_motivo_recusa ?? null,
    // Guarda a distinção na trilha: recusa no envio (nunca chegou ao banco) é
    // outro problema que recusa depois de autorizado.
    envio_rejeitado: naoChegou || null,
    motivo_envio: extras.btg_motivo_envio ?? null,
    codigo_recusa: extras.btg_recusa_codigo ?? null,
    devolvida_ao_preparo_em: new Date().toISOString(),
  };
  return {
    status: "CLASSIFICADO",
    bordero_id: null,
    autorizado_por: null,
    autorizado_em: null,
    requer_validacao: false,
    observacao: motivo
      ? `Devolvido ao preparo após recusa do banco (${motivo}). Monte um novo borderô.`
      : "Devolvido ao preparo após recusa do banco. Monte um novo borderô.",
    // A resposta terminal pertence à tentativa antiga. Mantê-la nos campos
    // correntes fazia o borderô novo nascer como RETURNED/FAILED antes mesmo de
    // ser enviado. Guardamos a trilha e limpamos somente o estado operacional.
    dados_extras: {
      ...extras,
      btg_tentativas_anteriores: [...historicoAnterior, tentativaAnterior],
      btg_payment_id: null,
      btg_batch_id: null,
      btg_external_id: null,
      btg_idempotency_key: null,
      btg_payment_status: null,
      btg_motivo_recusa: null,
      btg_recusa_codigo: null,
      btg_recusa_resolver: null,
      btg_recusa_bruta: null,
      btg_payment_response: null,
      estorno_detectado_em: null,
      estorno_extrato_id: null,
    },
  };
}
