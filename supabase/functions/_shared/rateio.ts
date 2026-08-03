// Rateio — pagamento unificado com memória dos componentes.
//
// Vocabulário (o de mercado, para conversar com contabilidade):
//   - PAGADOR   — o título que vai ao banco. É ele que carrega o boleto.
//                 Nos ERPs seria a "fatura"; as partes são as "duplicatas".
//   - COMPONENTE — cada parcela de despesa que compõe o pagador, com sua
//                 própria rubrica/categoria. É a "linha de rateio".
//
// Princípio: o CAIXA segue o pagador, a COMPETÊNCIA segue os componentes.
// Paga-se uma vez e continua sabendo quanto foi aluguel e quanto foi IPTU.
//
// Módulo puro — testado em src/lib/financeiro/__tests__/rateio.test.ts.

/** Status em que um lançamento ainda pode ser agrupado (não entrou em borderô). */
export const STATUS_AGRUPAVEIS = ["PREVISTO", "CLASSIFICADO"];

export interface LancParaAgrupar {
  id: string;
  cod_empresa: number;
  status: string;
  valor: number;
  lancamento_pai_id?: string | null;
  descricao?: string | null;
}

export interface ValidacaoAgrupamento {
  ok: boolean;
  motivo?: string;
  /** Soma dos componentes. */
  soma: number;
  /**
   * pagador − soma. Só existe quando o pagador é um título preexistente (o
   * boleto). Positivo = falta componente para explicar o valor cobrado.
   */
  diferenca?: number;
}

function arred(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Valida um agrupamento antes de gravar.
 *
 * `valorPagador` é o valor do título que já existe (o boleto do DDA). Quando
 * o pagador vai ser criado a partir dos componentes, passe `null`: aí a soma
 * é o valor, e não há o que conferir.
 */
export function validarAgrupamento(
  componentes: LancParaAgrupar[],
  valorPagador: number | null,
): ValidacaoAgrupamento {
  const soma = arred(componentes.reduce((s, c) => s + Number(c.valor), 0));

  if (componentes.length < 2) {
    return { ok: false, soma, motivo: "Selecione ao menos dois lançamentos para unificar" };
  }

  const empresas = new Set(componentes.map((c) => c.cod_empresa));
  if (empresas.size > 1) {
    return { ok: false, soma, motivo: "Todos os lançamentos precisam ser da mesma empresa" };
  }

  const jaAgrupado = componentes.find((c) => c.lancamento_pai_id);
  if (jaAgrupado) {
    return {
      ok: false,
      soma,
      motivo: `"${jaAgrupado.descricao ?? jaAgrupado.id}" já faz parte de outro pagamento unificado`,
    };
  }

  const foraDoStatus = componentes.find((c) => !STATUS_AGRUPAVEIS.includes(c.status));
  if (foraDoStatus) {
    return {
      ok: false,
      soma,
      motivo: `"${foraDoStatus.descricao ?? foraDoStatus.id}" está em ${foraDoStatus.status} — só dá para unificar antes de entrar em borderô`,
    };
  }

  if (!(soma > 0)) {
    return { ok: false, soma, motivo: "A soma dos lançamentos precisa ser maior que zero" };
  }

  if (valorPagador != null) {
    const diferenca = arred(Number(valorPagador) - soma);
    if (Math.abs(diferenca) >= 0.01) {
      return {
        ok: false,
        soma,
        diferenca,
        motivo:
          `A soma dos componentes (${soma.toFixed(2)}) não fecha com o valor do boleto ` +
          `(${Number(valorPagador).toFixed(2)}) — faltam ${diferenca.toFixed(2)}`,
      };
    }
    return { ok: true, soma, diferenca };
  }

  return { ok: true, soma };
}

/**
 * Distribui o valor efetivamente pago entre os componentes, proporcionalmente
 * ao valor de cada um.
 *
 * Existe porque o valor pago raramente é idêntico ao previsto: juros, multa,
 * desconto, ou o ajuste para o valor do boleto registrado. Sem ratear, a
 * diferença ficaria só no pagador e o DRE por rubrica sairia errado.
 *
 * O último componente absorve o resíduo do arredondamento, para a soma das
 * partes fechar exatamente com o total — nunca R$ 0,01 sobrando ou faltando.
 */
export function ratearValorPago(
  componentes: Array<{ id: string; valor: number }>,
  valorPagoTotal: number,
): Array<{ id: string; valor: number }> {
  if (componentes.length === 0) return [];

  const total = componentes.reduce((s, c) => s + Number(c.valor), 0);
  const pago = arred(Number(valorPagoTotal));

  // Sem base para proporção: divide igualmente.
  if (!(total > 0)) {
    const parte = arred(pago / componentes.length);
    return componentes.map((c, i) => ({
      id: c.id,
      valor: i === componentes.length - 1
        ? arred(pago - parte * (componentes.length - 1))
        : parte,
    }));
  }

  let acumulado = 0;
  return componentes.map((c, i) => {
    if (i === componentes.length - 1) {
      return { id: c.id, valor: arred(pago - acumulado) };
    }
    const parte = arred((Number(c.valor) / total) * pago);
    acumulado = arred(acumulado + parte);
    return { id: c.id, valor: parte };
  });
}

/** Descrição sugerida para o pagador criado a partir dos componentes. */
export function descricaoPagador(componentes: LancParaAgrupar[], favorecido?: string | null): string {
  const base = favorecido?.trim() || "Pagamento unificado";
  return `${base} — ${componentes.length} itens`;
}
