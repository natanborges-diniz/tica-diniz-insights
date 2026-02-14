// src/services/aiCentralService.ts
// Serviço para Central de IA - análise multi-dimensional consolidada

import { supabase } from "@/integrations/supabase/client";
import { EmpresaParam, formatEmpresaParam } from "./firebirdBridge";
import { getResumoFormasPagamento, getAnaliseSku } from "./vendasService";
import { getVendasAgregado } from "./agregadosService";
import { getAnaliseFamiliaVendedor } from "./vendasService";

// ============================================
// INTERFACES
// ============================================

export interface DadosVendasConsolidado {
  totalFaturamento: number;
  totalDesconto: number;
  percentualDesconto: number;
  qtdVendas: number;
  ticketMedio: number;
  porLoja: Array<{
    loja: string;
    faturamento: number;
    percentualDesconto: number;
    ticketMedio: number;
    qtdVendas: number;
  }>;
  porVendedor: Array<{
    vendedor: string;
    loja: string;
    faturamento: number;
    percentualDesconto: number;
    ticketMedio: number;
  }>;
}

export interface DadosFormaPagamentoConsolidado {
  formaPagamento: string;
  totalGeral: number;
  qtdVendas: number;
  percentualMix: number;
}

export interface DadosFamiliaConsolidado {
  familia: string;
  totalVendido: number;
  qtdProdutos: number;
  percentualMix: number;
}

export interface DadosEstoqueConsolidado {
  totalItens: number;
  itensSemGiro: number;
  itensGiroLento: number;
  itensGiroNormal: number;
  itensGiroRapido: number;
  itensParaCompra: number;
  porFornecedor: Array<{
    fornecedor: string;
    qtdItens: number;
    itensSemGiro: number;
    itensParaCompra: number;
  }>;
}

// Interface para análise de SKU por marca/fornecedor
export interface DadosFornecedorMarcaConsolidado {
  fornecedor: string;
  marca: string;
  tipo: string;
  qtdSkus: number;
  estoqueTotal: number;
  qtdVendidos: number;
  totalVendido: number;
  margemMediaBruta: number;
  diasMedioDesdeVenda: number;
  skusSemGiro: number; // sem venda no período
  skusGiroRapido: number; // giro > 1
  recomendacaoCompra: 'PRIORIZAR' | 'MANTER' | 'EVITAR';
}

export interface DadosCentralIA {
  periodo: string;
  empresa?: string;
  vendas?: DadosVendasConsolidado;
  formasPagamento?: DadosFormaPagamentoConsolidado[];
  familias?: DadosFamiliaConsolidado[];
  estoque?: DadosEstoqueConsolidado;
  fornecedoresMarcas?: DadosFornecedorMarcaConsolidado[];
  metas?: any;
}

export interface ColetarDadosParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  incluirEstoque?: boolean;
  incluirAnaliseSku?: boolean;
}

// ============================================
// COLETA DE DADOS
// ============================================

/**
 * Coleta dados de vendas do cache agregado
 */
async function coletarDadosVendas(
  empresa: EmpresaParam,
  dataInicio: string,
  dataFim: string
): Promise<DadosVendasConsolidado | null> {
  try {
    const agregados = await getVendasAgregado({
      empresa,
      dataInicio,
      dataFim,
    });

    if (!agregados || agregados.length === 0) {
      console.log('[aiCentralService] Sem dados de vendas no cache');
      return null;
    }

    // Agrupar por loja
    const porLojaMap = new Map<number, {
      loja: string;
      faturamento: number;
      desconto: number;
      bruto: number;
      qtdVendas: number;
    }>();

    // Agrupar por vendedor
    const porVendedorMap = new Map<string, {
      vendedor: string;
      loja: string;
      faturamento: number;
      desconto: number;
      bruto: number;
      qtdVendas: number;
    }>();

    let totalFaturamento = 0;
    let totalDesconto = 0;
    let totalBruto = 0;
    let qtdVendas = 0;

    agregados.forEach(a => {
      // Ignorar devoluções e créditos para cálculos de faturamento
      if (a.formaPagamento === 'DEVOLUCAO' || a.formaPagamento === 'CREDITO') {
        return;
      }

      totalFaturamento += a.totalGeral;
      totalDesconto += a.totalDesconto;
      totalBruto += a.totalBruto;
      qtdVendas += a.qtdVendas;

      // Por loja
      const lojaKey = a.codEmpresa;
      const lojaExistente = porLojaMap.get(lojaKey);
      if (lojaExistente) {
        lojaExistente.faturamento += a.totalGeral;
        lojaExistente.desconto += a.totalDesconto;
        lojaExistente.bruto += a.totalBruto;
        lojaExistente.qtdVendas += a.qtdVendas;
      } else {
        porLojaMap.set(lojaKey, {
          loja: `Loja ${a.codEmpresa}`,
          faturamento: a.totalGeral,
          desconto: a.totalDesconto,
          bruto: a.totalBruto,
          qtdVendas: a.qtdVendas,
        });
      }

      // Por vendedor
      const vendedorKey = `${a.codEmpresa}|${a.vendedor}`;
      const vendedorExistente = porVendedorMap.get(vendedorKey);
      if (vendedorExistente) {
        vendedorExistente.faturamento += a.totalGeral;
        vendedorExistente.desconto += a.totalDesconto;
        vendedorExistente.bruto += a.totalBruto;
        vendedorExistente.qtdVendas += a.qtdVendas;
      } else {
        porVendedorMap.set(vendedorKey, {
          vendedor: a.vendedor,
          loja: `Loja ${a.codEmpresa}`,
          faturamento: a.totalGeral,
          desconto: a.totalDesconto,
          bruto: a.totalBruto,
          qtdVendas: a.qtdVendas,
        });
      }
    });

    const porLoja = Array.from(porLojaMap.values())
      .map(l => ({
        loja: l.loja,
        faturamento: l.faturamento,
        percentualDesconto: l.bruto > 0 ? (l.desconto / l.bruto) * 100 : 0,
        ticketMedio: l.qtdVendas > 0 ? l.faturamento / l.qtdVendas : 0,
        qtdVendas: l.qtdVendas,
      }))
      .sort((a, b) => b.faturamento - a.faturamento);

    const porVendedor = Array.from(porVendedorMap.values())
      .map(v => ({
        vendedor: v.vendedor,
        loja: v.loja,
        faturamento: v.faturamento,
        percentualDesconto: v.bruto > 0 ? (v.desconto / v.bruto) * 100 : 0,
        ticketMedio: v.qtdVendas > 0 ? v.faturamento / v.qtdVendas : 0,
      }))
      .sort((a, b) => b.faturamento - a.faturamento);

    return {
      totalFaturamento,
      totalDesconto,
      percentualDesconto: totalBruto > 0 ? (totalDesconto / totalBruto) * 100 : 0,
      qtdVendas,
      ticketMedio: qtdVendas > 0 ? totalFaturamento / qtdVendas : 0,
      porLoja,
      porVendedor,
    };
  } catch (err) {
    console.error('[aiCentralService] Erro ao coletar vendas:', err);
    return null;
  }
}

/**
 * Coleta dados de formas de pagamento
 */
async function coletarDadosFormasPagamento(
  empresa: EmpresaParam,
  dataInicio: string,
  dataFim: string
): Promise<DadosFormaPagamentoConsolidado[]> {
  try {
    const dados = await getResumoFormasPagamento({
      empresa,
      dataInicio,
      dataFim,
      excluirCreditos: true,
    });

    if (!dados || dados.length === 0) {
      return [];
    }

    // Agrupar por forma de pagamento
    const porFormaMap = new Map<string, { total: number; qtd: number }>();
    let totalGeral = 0;

    dados.forEach(d => {
      if (d.formaPagamento === 'DEVOLUCAO') return;
      
      const forma = d.formaPagamento || 'OUTROS';
      const existente = porFormaMap.get(forma);
      if (existente) {
        existente.total += d.totalGeral;
        existente.qtd += d.qtdVendas;
      } else {
        porFormaMap.set(forma, { total: d.totalGeral, qtd: d.qtdVendas });
      }
      totalGeral += d.totalGeral;
    });

    return Array.from(porFormaMap.entries())
      .map(([forma, dados]) => ({
        formaPagamento: forma,
        totalGeral: dados.total,
        qtdVendas: dados.qtd,
        percentualMix: totalGeral > 0 ? (dados.total / totalGeral) * 100 : 0,
      }))
      .sort((a, b) => b.totalGeral - a.totalGeral);
  } catch (err) {
    console.error('[aiCentralService] Erro ao coletar formas de pagamento:', err);
    return [];
  }
}

/**
 * Coleta dados de famílias de produtos
 */
async function coletarDadosFamilias(
  empresa: EmpresaParam,
  dataInicio: string,
  dataFim: string
): Promise<DadosFamiliaConsolidado[]> {
  try {
    const dados = await getAnaliseFamiliaVendedor({
      empresa,
      dataInicio,
      dataFim,
    });

    if (!dados || dados.length === 0) {
      return [];
    }

    // Agrupar por família
    const porFamiliaMap = new Map<string, { total: number; qtd: number }>();
    let totalGeral = 0;

    dados.forEach(d => {
      const familia = d.familia || 'OUTROS';
      const existente = porFamiliaMap.get(familia);
      if (existente) {
        existente.total += d.totalVendido;
        existente.qtd += d.qtdProdutos;
      } else {
        porFamiliaMap.set(familia, { total: d.totalVendido, qtd: d.qtdProdutos });
      }
      totalGeral += d.totalVendido;
    });

    return Array.from(porFamiliaMap.entries())
      .map(([familia, dados]) => ({
        familia,
        totalVendido: dados.total,
        qtdProdutos: dados.qtd,
        percentualMix: totalGeral > 0 ? (dados.total / totalGeral) * 100 : 0,
      }))
      .sort((a, b) => b.totalVendido - a.totalVendido);
  } catch (err) {
    console.error('[aiCentralService] Erro ao coletar famílias:', err);
    return [];
  }
}

/**
 * Coleta dados de estoque
 */
async function coletarDadosEstoque(
  empresa: EmpresaParam
): Promise<DadosEstoqueConsolidado | null> {
  try {
    // Usa getAnaliseSku (endpoint /vendas/analise-sku) — fonte unificada de estoque+vendas
    const hoje = new Date();
    const dataFim = hoje.toISOString().split('T')[0];
    const dataInicio = new Date(hoje.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const dados = await getAnaliseSku({ empresa, dataInicio, dataFim });

    if (!dados || dados.length === 0) {
      return null;
    }

    let itensSemGiro = 0;
    let itensGiroLento = 0;
    let itensGiroNormal = 0;
    let itensGiroRapido = 0;
    let itensParaCompra = 0;

    const porFornecedorMap = new Map<string, {
      qtdItens: number;
      itensSemGiro: number;
      itensParaCompra: number;
    }>();

    dados.forEach(d => {
      const diasEstoque = d.diasDesdeUltimaVenda ?? 0;
      
      if (diasEstoque > 180) {
        itensSemGiro++;
      } else if (diasEstoque > 90) {
        itensGiroLento++;
      } else if (diasEstoque > 30) {
        itensGiroNormal++;
      } else {
        itensGiroRapido++;
      }

      if (d.estoqueAtual <= 0 && d.qtdProdutos > 0) {
        itensParaCompra++;
      }

      const fornecedor = d.fornecedor || 'DESCONHECIDO';
      const existente = porFornecedorMap.get(fornecedor);
      if (existente) {
        existente.qtdItens++;
        if (diasEstoque > 180) existente.itensSemGiro++;
        if (d.estoqueAtual <= 0 && d.qtdProdutos > 0) existente.itensParaCompra++;
      } else {
        porFornecedorMap.set(fornecedor, {
          qtdItens: 1,
          itensSemGiro: diasEstoque > 180 ? 1 : 0,
          itensParaCompra: (d.estoqueAtual <= 0 && d.qtdProdutos > 0) ? 1 : 0,
        });
      }
    });

    const porFornecedor = Array.from(porFornecedorMap.entries())
      .map(([fornecedor, dados]) => ({
        fornecedor,
        ...dados,
      }))
      .sort((a, b) => b.qtdItens - a.qtdItens);

    return {
      totalItens: dados.length,
      itensSemGiro,
      itensGiroLento,
      itensGiroNormal,
      itensGiroRapido,
      itensParaCompra,
      porFornecedor,
    };
  } catch (err) {
    console.error('[aiCentralService] Erro ao coletar estoque:', err);
    return null;
  }
}

/**
 * Coleta e consolida dados de SKU por fornecedor/marca
 */
async function coletarDadosFornecedoresMarcas(
  empresa: EmpresaParam,
  dataInicio: string,
  dataFim: string
): Promise<DadosFornecedorMarcaConsolidado[]> {
  try {
    const dados = await getAnaliseSku({ empresa, dataInicio, dataFim });

    if (!dados || dados.length === 0) {
      console.log('[aiCentralService] Sem dados de SKU');
      return [];
    }

    // Agrupar por fornecedor + marca + tipo
    const agrupado = new Map<string, {
      fornecedor: string;
      marca: string;
      tipo: string;
      qtdSkus: number;
      estoqueTotal: number;
      qtdVendidos: number;
      totalVendido: number;
      somaMargens: number;
      somaDias: number;
      skusSemGiro: number;
      skusGiroRapido: number;
    }>();

    dados.forEach(sku => {
      const key = `${sku.fornecedor}|${sku.marca}|${sku.tipo}`;
      const existente = agrupado.get(key);
      
      const semGiro = sku.qtdProdutos === 0 || sku.diasDesdeUltimaVenda > 180;
      const giroRapido = sku.giroEstoque > 1;

      if (existente) {
        existente.qtdSkus++;
        existente.estoqueTotal += sku.estoqueAtual;
        existente.qtdVendidos += sku.qtdProdutos;
        existente.totalVendido += sku.totalVendido;
        existente.somaMargens += sku.margemBruta;
        existente.somaDias += sku.diasDesdeUltimaVenda;
        if (semGiro) existente.skusSemGiro++;
        if (giroRapido) existente.skusGiroRapido++;
      } else {
        agrupado.set(key, {
          fornecedor: sku.fornecedor,
          marca: sku.marca,
          tipo: sku.tipo,
          qtdSkus: 1,
          estoqueTotal: sku.estoqueAtual,
          qtdVendidos: sku.qtdProdutos,
          totalVendido: sku.totalVendido,
          somaMargens: sku.margemBruta,
          somaDias: sku.diasDesdeUltimaVenda,
          skusSemGiro: semGiro ? 1 : 0,
          skusGiroRapido: giroRapido ? 1 : 0,
        });
      }
    });

    // Converter e calcular métricas finais
    const resultado = Array.from(agrupado.values()).map(g => {
      const margemMediaBruta = g.qtdSkus > 0 ? g.somaMargens / g.qtdSkus : 0;
      const diasMedioDesdeVenda = g.qtdSkus > 0 ? g.somaDias / g.qtdSkus : 999;
      const percSemGiro = g.qtdSkus > 0 ? (g.skusSemGiro / g.qtdSkus) * 100 : 100;
      const percGiroRapido = g.qtdSkus > 0 ? (g.skusGiroRapido / g.qtdSkus) * 100 : 0;

      // Determinar recomendação de compra
      let recomendacaoCompra: 'PRIORIZAR' | 'MANTER' | 'EVITAR';
      if (percGiroRapido >= 30 && margemMediaBruta >= 40 && percSemGiro < 30) {
        recomendacaoCompra = 'PRIORIZAR';
      } else if (percSemGiro >= 50 || diasMedioDesdeVenda > 120) {
        recomendacaoCompra = 'EVITAR';
      } else {
        recomendacaoCompra = 'MANTER';
      }

      return {
        fornecedor: g.fornecedor,
        marca: g.marca,
        tipo: g.tipo,
        qtdSkus: g.qtdSkus,
        estoqueTotal: g.estoqueTotal,
        qtdVendidos: g.qtdVendidos,
        totalVendido: g.totalVendido,
        margemMediaBruta,
        diasMedioDesdeVenda,
        skusSemGiro: g.skusSemGiro,
        skusGiroRapido: g.skusGiroRapido,
        recomendacaoCompra,
      };
    });

    // Ordenar por total vendido (maiores primeiro)
    return resultado.sort((a, b) => b.totalVendido - a.totalVendido);
  } catch (err) {
    console.error('[aiCentralService] Erro ao coletar dados de SKU:', err);
    return [];
  }
}

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

/**
 * Coleta todos os dados necessários para a análise da Central de IA
 */
export async function coletarDadosCentralIA(
  params: ColetarDadosParams
): Promise<DadosCentralIA> {
  const { empresa, dataInicio, dataFim, incluirEstoque = true, incluirAnaliseSku = true } = params;
  
  console.log('[aiCentralService] Coletando dados para:', { empresa, dataInicio, dataFim });

  // Executar coletas em paralelo
  const [vendas, formasPagamento, familias, estoque, fornecedoresMarcas] = await Promise.all([
    coletarDadosVendas(empresa, dataInicio, dataFim),
    coletarDadosFormasPagamento(empresa, dataInicio, dataFim),
    coletarDadosFamilias(empresa, dataInicio, dataFim),
    incluirEstoque ? coletarDadosEstoque(empresa) : Promise.resolve(null),
    incluirAnaliseSku ? coletarDadosFornecedoresMarcas(empresa, dataInicio, dataFim) : Promise.resolve([]),
  ]);

  const periodo = `${dataInicio} a ${dataFim}`;
  const empresaStr = empresa === 'ALL' ? 'Todas as Empresas' : formatEmpresaParam(empresa);

  return {
    periodo,
    empresa: empresaStr,
    vendas: vendas || undefined,
    formasPagamento: formasPagamento.length > 0 ? formasPagamento : undefined,
    familias: familias.length > 0 ? familias : undefined,
    estoque: estoque || undefined,
    fornecedoresMarcas: fornecedoresMarcas.length > 0 ? fornecedoresMarcas : undefined,
  };
}

/**
 * Gera análise da Central de IA
 */
export async function gerarAnaliseCentralIA(dados: DadosCentralIA): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-central', {
    body: dados
  });

  if (error) {
    console.error('Erro ao gerar análise central:', error);
    throw new Error(error.message || 'Erro ao processar análise de IA');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data?.analise || 'Não foi possível gerar análise.';
}
