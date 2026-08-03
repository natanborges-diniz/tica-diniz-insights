// src/lib/comissoes/motorComissao.ts
// Fase 4 — motor PURO de cálculo de comissões do fechamento semanal
// (docs/REVISAO_VENDAS_METAS.md §2 e §5.3). Testável em vitest, sem I/O.
//
// Regras (Natan):
//   * comissão = Σ (valor_recebido × taxa(forma_categoria)) — taxas SEMPRE da
//     configuração (comissao_taxas), nunca hardcoded;
//   * CREDITOS: 0% e fora da base de meta;
//   * restituições em dinheiro ABATEM base e comissão (comissão abatida pela
//     taxa média ponderada do próprio vendedor na semana);
//   * prêmio FAIXA: melhor faixa ativa com % meta atingido ≥ mínimo —
//     percentual aplicado sobre a BASE da semana do vendedor;
//   * prêmio SEQUENCIA: n semanas consecutivas atingidas no mês comercial —
//     percentual extra sobre a BASE da semana.

export interface LinhaRecebimento {
  codVendedor: number;
  vendedorNome: string | null;
  codTransacao: number;
  /** numero da venda visivel no ERP (numerotransacao) */
  numeroVenda?: number | string | null;
  /** numero da NFC-e, se houver */
  numeroNf?: number | string | null;
  /** OS que compoem a venda (ex.: "1234,1235") */
  osList?: string | null;
  dataEmissao: string;
  dataPagamento: string;
  formaCategoria: string;
  origem: 'VENDA_PERIODO' | 'SALDO_ANTERIOR' | string;
  /** natureza do recebimento: ATO | QUITACAO_SALDO | CREDIARIO (Natan 2026-08-03) */
  natureza?: 'ATO' | 'QUITACAO_SALDO' | 'CREDIARIO' | string | null;
  valor: number;
}

export interface Restituicao {
  codVendedor: number;
  valor: number;
}

export type TipoValorPremio = 'PERCENTUAL' | 'FIXO';

export interface FaixaPremio {
  percentualMetaMin: number;
  /** % sobre a base (tipoValor PERCENTUAL) */
  percentualPremio: number;
  /** R$ fixo (tipoValor FIXO) */
  valorFixo?: number;
  tipoValor?: TipoValorPremio;
}

export interface SequenciaPremio {
  semanasConsecutivas: number;
  percentualPremio: number;
  valorFixo?: number;
  tipoValor?: TipoValorPremio;
}

/** Valor do prêmio: % sobre a base ou valor fixo, conforme configuração. */
function valorPremio(
  premio: { percentualPremio: number; valorFixo?: number; tipoValor?: TipoValorPremio },
  base: number
): number {
  if (premio.tipoValor === 'FIXO') return Math.round((premio.valorFixo ?? 0) * 100) / 100;
  return Math.round(((base * premio.percentualPremio) / 100) * 100) / 100;
}

export interface DetalheLinha {
  codTransacao: number;
  numeroVenda?: number | string | null;
  numeroNf?: number | string | null;
  osList?: string | null;
  dataEmissao: string;
  dataPagamento: string;
  formaCategoria: string;
  origem: string;
  natureza?: string | null;
  valor: number;
  taxa: number;
  comissao: number;
}

export interface BasePorOrigem {
  /** recebido no ATO das vendas do período (entrada paga no cadastro da OS) */
  vendaPeriodo: number;
  /** recebido no período de OS de períodos ANTERIORES */
  saldoAnterior: number;
  /** total EMITIDO em OS no período (vendas cadastradas) */
  vendasEmitidas?: number;
  /** saldo que FICOU a receber das vendas do período (emitido − recebido no ato) */
  saldoAReceber?: number;
}

export interface ResultadoVendedor {
  codVendedor: number;
  vendedorNome: string | null;
  metaSemana: number;
  percentualMeta: number;
  basePorCategoria: Record<string, number>;
  basePorOrigem: BasePorOrigem;
  baseTotal: number;
  restituicoes: number;
  comissao: number;
  premioFaixa: FaixaPremio | null;
  premioSequencia: SequenciaPremio | null;
  premioValor: number;
  totalPagar: number;
  detalhe: DetalheLinha[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Consolida os resultados de VÁRIAS semanas (fechadas e/ou parciais) num
 * total MENSAL por vendedor — o pagamento do RH é mensal (Natan): comissões e
 * prêmios somados; metas somadas; % = base/meta do mês. Prêmios individuais
 * das semanas não são reexibidos (já estão somados em premioValor).
 */
export function consolidarVendedores(listas: ResultadoVendedor[][]): ResultadoVendedor[] {
  const mapa = new Map<number, ResultadoVendedor>();
  for (const lista of listas) {
    for (const v of lista) {
      let c = mapa.get(v.codVendedor);
      if (!c) {
        c = {
          codVendedor: v.codVendedor,
          vendedorNome: v.vendedorNome,
          metaSemana: 0,
          percentualMeta: 0,
          basePorCategoria: {},
          basePorOrigem: { vendaPeriodo: 0, saldoAnterior: 0 },
          baseTotal: 0,
          restituicoes: 0,
          comissao: 0,
          premioFaixa: null,
          premioSequencia: null,
          premioValor: 0,
          totalPagar: 0,
          detalhe: [],
        };
        mapa.set(v.codVendedor, c);
      }
      c.vendedorNome = c.vendedorNome ?? v.vendedorNome;
      c.metaSemana = round2(c.metaSemana + v.metaSemana);
      Object.entries(v.basePorCategoria).forEach(([cat, val]) => {
        c!.basePorCategoria[cat] = round2((c!.basePorCategoria[cat] ?? 0) + (val as number));
      });
      c.basePorOrigem.vendaPeriodo = round2(c.basePorOrigem.vendaPeriodo + v.basePorOrigem.vendaPeriodo);
      c.basePorOrigem.saldoAnterior = round2(c.basePorOrigem.saldoAnterior + v.basePorOrigem.saldoAnterior);
      c.basePorOrigem.vendasEmitidas = round2(
        (c.basePorOrigem.vendasEmitidas ?? 0) + (v.basePorOrigem.vendasEmitidas ?? 0)
      );
      c.basePorOrigem.saldoAReceber = round2(
        (c.basePorOrigem.saldoAReceber ?? 0) + (v.basePorOrigem.saldoAReceber ?? 0)
      );
      c.baseTotal = round2(c.baseTotal + v.baseTotal);
      c.restituicoes = round2(c.restituicoes + v.restituicoes);
      c.comissao = round2(c.comissao + v.comissao);
      c.premioValor = round2(c.premioValor + v.premioValor);
      c.totalPagar = round2(c.totalPagar + v.totalPagar);
      c.detalhe = c.detalhe.concat(v.detalhe);
    }
  }
  return Array.from(mapa.values())
    .map((c) => ({
      ...c,
      percentualMeta: c.metaSemana > 0 ? round2((c.baseTotal / c.metaSemana) * 100) : 0,
    }))
    .sort((a, b) => b.baseTotal - a.baseTotal);
}

/**
 * Calcula o fechamento de um conjunto de linhas (uma loja × semana).
 *
 * @param linhas parcelas pagas (modo RECEBIDO) ou vendas (modo EMITIDO)
 * @param taxas mapa forma_categoria → % (ex.: {CARTAO_CREDITO: 2, PIX: 3, ...})
 * @param metasPorVendedor meta da semana por cod_vendedor (derivada/ajustada)
 * @param restituicoes devoluções com restituição em dinheiro na semana
 * @param faixasAtivas faixas de prêmio ativas (tipo FAIXA)
 * @param sequenciaAtiva regra de sequência ativa (ou null)
 * @param semanasAtingidasAntes nº de semanas consecutivas atingidas IMEDIATAMENTE
 *        anteriores a esta, no mesmo mês comercial, por vendedor
 */
export function calcularFechamento(params: {
  linhas: LinhaRecebimento[];
  taxas: Record<string, number>;
  metasPorVendedor: Map<number, number>;
  restituicoes: Restituicao[];
  faixasAtivas: FaixaPremio[];
  sequenciaAtiva: SequenciaPremio | null;
  semanasAtingidasAntes: Map<number, number>;
}): ResultadoVendedor[] {
  const {
    linhas, taxas, metasPorVendedor, restituicoes,
    faixasAtivas, sequenciaAtiva, semanasAtingidasAntes,
  } = params;

  const faixasOrdenadas = faixasAtivas
    .slice()
    .sort((a, b) => b.percentualMetaMin - a.percentualMetaMin);
  const restituicoesPorVendedor = new Map<number, number>();
  restituicoes.forEach((r) => {
    restituicoesPorVendedor.set(
      r.codVendedor,
      (restituicoesPorVendedor.get(r.codVendedor) ?? 0) + r.valor
    );
  });

  const porVendedor = new Map<number, ResultadoVendedor>();

  for (const l of linhas) {
    let v = porVendedor.get(l.codVendedor);
    if (!v) {
      v = {
        codVendedor: l.codVendedor,
        vendedorNome: l.vendedorNome,
        metaSemana: metasPorVendedor.get(l.codVendedor) ?? 0,
        percentualMeta: 0,
        basePorCategoria: {},
        basePorOrigem: { vendaPeriodo: 0, saldoAnterior: 0 },
        baseTotal: 0,
        restituicoes: 0,
        comissao: 0,
        premioFaixa: null,
        premioSequencia: null,
        premioValor: 0,
        totalPagar: 0,
        detalhe: [],
      };
      porVendedor.set(l.codVendedor, v);
    }

    const categoria = (l.formaCategoria || 'OUTROS').trim().toUpperCase();
    const taxa = taxas[categoria] ?? 0;
    const ehCredito = categoria === 'CREDITOS';
    const comissaoLinha = ehCredito ? 0 : round2((l.valor * taxa) / 100);

    v.detalhe.push({
      codTransacao: l.codTransacao,
      numeroVenda: l.numeroVenda ?? null,
      numeroNf: l.numeroNf ?? null,
      osList: l.osList ?? null,
      dataEmissao: l.dataEmissao,
      dataPagamento: l.dataPagamento,
      formaCategoria: categoria,
      origem: l.origem,
      natureza: l.natureza ?? null,
      valor: round2(l.valor),
      taxa,
      comissao: comissaoLinha,
    });

    if (!ehCredito) {
      v.basePorCategoria[categoria] = round2((v.basePorCategoria[categoria] ?? 0) + l.valor);
      if (l.origem === 'SALDO_ANTERIOR') v.basePorOrigem.saldoAnterior += l.valor;
      else v.basePorOrigem.vendaPeriodo += l.valor;
      v.baseTotal += l.valor;
      v.comissao += comissaoLinha;
    }
  }

  return Array.from(porVendedor.values())
    .map((v) => {
      const baseBruta = round2(v.baseTotal);
      const comissaoBruta = round2(v.comissao);

      // restituições: abatem a base; comissão abatida pela taxa média
      // ponderada do vendedor na semana (comissão bruta / base bruta)
      const restituicao = round2(restituicoesPorVendedor.get(v.codVendedor) ?? 0);
      const taxaMedia = baseBruta > 0 ? comissaoBruta / baseBruta : 0;
      const abateComissao = round2(restituicao * taxaMedia);

      const baseLiquida = round2(baseBruta - restituicao);
      const comissaoLiquida = round2(Math.max(0, comissaoBruta - abateComissao));
      const percentualMeta =
        v.metaSemana > 0 ? round2((baseLiquida / v.metaSemana) * 100) : 0;

      // prêmio FAIXA (melhor faixa atingida) — % sobre a base OU valor fixo
      const faixa =
        faixasOrdenadas.find((f) => percentualMeta >= f.percentualMetaMin) ?? null;
      const premioFaixaValor = faixa ? valorPremio(faixa, baseLiquida) : 0;

      // prêmio SEQUENCIA: com esta semana atingida, fecha n consecutivas?
      let sequencia: SequenciaPremio | null = null;
      let premioSequenciaValor = 0;
      if (sequenciaAtiva && percentualMeta >= 100) {
        const antes = semanasAtingidasAntes.get(v.codVendedor) ?? 0;
        if (antes + 1 >= sequenciaAtiva.semanasConsecutivas) {
          sequencia = sequenciaAtiva;
          premioSequenciaValor = valorPremio(sequenciaAtiva, baseLiquida);
        }
      }

      const premioValor = round2(premioFaixaValor + premioSequenciaValor);

      return {
        ...v,
        baseTotal: baseLiquida,
        basePorOrigem: {
          vendaPeriodo: round2(v.basePorOrigem.vendaPeriodo),
          saldoAnterior: round2(v.basePorOrigem.saldoAnterior),
        },
        restituicoes: restituicao,
        comissao: comissaoLiquida,
        percentualMeta,
        premioFaixa: faixa,
        premioSequencia: sequencia,
        premioValor,
        totalPagar: round2(comissaoLiquida + premioValor),
      };
    })
    .sort((a, b) => b.baseTotal - a.baseTotal);
}
