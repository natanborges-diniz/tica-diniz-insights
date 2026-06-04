// src/services/vendasService.ts
// Service para endpoints de vendas

import { apiGet, EmpresaParam, formatEmpresaParam, ApiGetOptions } from './firebirdBridge';

// ============================================
// INTERFACES - RESUMO EMPRESA/VENDEDOR
// ============================================

// Interface RAW - campos snake_case como vêm da API (padrão dos endpoints)
interface ResumoEmpresaVendedorRaw {
  empresa: string;
  empresa_cod_logico: number;
  empresa_nome_logico: string;
  vendedor: string;
  qtd_transacao: number;
  qtd_produtos: number;
  total_bruto: number;
  total_vendido: number;
  total_desconto: number;
  perc_desconto: number;
  total_creditos: number;
  total_vendido_sem_creditos: number;
}

// Interface normalizada para o frontend (camelCase)
export interface ResumoEmpresaVendedor {
  empresa: string;
  empresaCodLogico: number;
  empresaNomeLogico: string;
  vendedor: string;
  qtdTransacao: number;
  qtdProdutos: number;
  totalBruto: number;
  totalVendido: number;
  totalDesconto: number;
  percentualDesconto: number;
  totalCreditos: number;
  totalVendidoSemCreditos: number;
  // Calculado no frontend
  ticketMedio: number;
}

export interface GetResumoEmpresaVendedorParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  /** Se true, ignora cache e busca dados ao vivo */
  bypassCache?: boolean;
  /** Se true, exclui vendas pagas com créditos (forma tipo 6) */
  excluirCreditos?: boolean;
}

export async function getResumoEmpresaVendedor(
  params: GetResumoEmpresaVendedorParams
): Promise<ResumoEmpresaVendedor[]> {
  const options: ApiGetOptions = params.bypassCache ? { cache: false } : {};
  
  const queryParams: Record<string, string | number | boolean | undefined> = {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
  };
  
  // Adicionar parâmetro excluirCreditos se especificado
  if (params.excluirCreditos) {
    queryParams.excluirCreditos = true;
  }
  
  const raw = await apiGet<ResumoEmpresaVendedorRaw>('/vendas/resumo-empresa-vendedor', queryParams, options);

  console.log('[vendasService] Raw data count:', raw.length);
  console.log('[vendasService] Raw data sample:', raw[0]);

  // Mapear campos snake_case da API para camelCase
  const mapped = raw.map((r) => {
    const totalVendidoSemCreditos = r.total_vendido_sem_creditos ?? 0;
    const qtdTransacao = r.qtd_transacao ?? 0;

    return {
      empresa: (r.empresa ?? '').trim(),
      empresaCodLogico: r.empresa_cod_logico ?? 0,
      empresaNomeLogico: (r.empresa_nome_logico ?? r.empresa ?? '').trim(),
      vendedor: (r.vendedor ?? '').trim(),
      qtdTransacao,
      qtdProdutos: r.qtd_produtos ?? 0,
      // Valores do backend - NÃO recalcular
      totalBruto: r.total_bruto ?? 0,
      totalVendido: r.total_vendido ?? 0,
      totalDesconto: r.total_desconto ?? 0,
      percentualDesconto: r.perc_desconto ?? 0,
      totalCreditos: r.total_creditos ?? 0,
      totalVendidoSemCreditos,
      // Ticket médio calculado usando vendas sem créditos
      ticketMedio: qtdTransacao > 0 ? totalVendidoSemCreditos / qtdTransacao : 0,
    };
  });

  return mapped;
}

// ============================================
// INTERFACES - FORMAS DE PAGAMENTO
// ============================================

interface ResumoFormaPagamentoRaw {
  empresa: string;
  empresa_cod_logico: number;
  empresa_nome_logico: string;
  vendedor: string;
  formapagamento: string;
  totalgeral: number;
  qtd_vendas: number;
  // Campos de desconto (já vêm do backend!)
  total_bruto: number;
  total_desconto: number;
  perc_desconto: number;
}

export interface ResumoFormaPagamento {
  codEmpresa: number;
  empresa: string;
  vendedor: string;
  formaPagamento: string;
  totalGeral: number;
  qtdVendas: number;
  // Campos de desconto
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
}

export interface GetResumoFormasPagamentoParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  /** Se true, ignora cache e busca dados ao vivo */
  bypassCache?: boolean;
  /** Se true, exclui forma de pagamento "Créditos" dos resultados */
  excluirCreditos?: boolean;
  /** Se true, inclui devoluções como registros negativos */
  incluirDevolucoes?: boolean;
  /** Timeout customizado em ms (padrão: 15000) */
  timeoutMs?: number;
}

export async function getResumoFormasPagamento(
  params: GetResumoFormasPagamentoParams
): Promise<ResumoFormaPagamento[]> {
  const options: ApiGetOptions = {
    ...(params.bypassCache ? { cache: false } : {}),
    ...(params.timeoutMs ? { timeoutMs: params.timeoutMs } : {}),
  };
  
  const queryParams: Record<string, string | number | boolean | undefined> = {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
  };
  
  // Adicionar parâmetros opcionais conforme documentação Railway
  if (params.excluirCreditos !== undefined) {
    queryParams.excluirCreditos = params.excluirCreditos;
  }
  if (params.incluirDevolucoes !== undefined) {
    queryParams.incluirDevolucoes = params.incluirDevolucoes;
  }
  
  const raw = await apiGet<ResumoFormaPagamentoRaw>('/vendas/resumo-formas-pagamento', queryParams, options);

  return raw.map((r) => ({
    codEmpresa: r.empresa_cod_logico ?? 0,
    empresa: r.empresa ?? '',
    vendedor: (r.vendedor ?? '').trim(),
    formaPagamento: r.formapagamento ?? '',
    totalGeral: r.totalgeral ?? 0,
    qtdVendas: r.qtd_vendas ?? 0,
    // Mapear campos de desconto
    totalBruto: r.total_bruto ?? 0,
    totalDesconto: r.total_desconto ?? 0,
    percentualDesconto: r.perc_desconto ?? 0,
  }));
}

// ============================================
// INTERFACES - ANÁLISE FAMÍLIA/VENDEDOR
// ============================================

interface AnaliseFamiliaVendedorRaw {
  cod_empresa: number;
  empresa: string;
  empresa_cod_logico: number;
  empresa_nome_logico: string;
  cod_vendedor: number;
  vendedor: string;
  familia: string;
  qtd_transacao: number;
  qtd_produtos: number;
  total_vendido: number;
}

export interface AnaliseFamiliaVendedor {
  codEmpresa: number;
  empresa: string;
  codVendedor: number;
  vendedor: string;
  familia: string;
  qtdTransacao: number;
  qtdProdutos: number;
  totalVendido: number;
}

export interface GetAnaliseFamiliaVendedorParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  codEmpresaEstoque?: number;
  /** Se true, ignora cache e busca dados ao vivo */
  bypassCache?: boolean;
}

export async function getAnaliseFamiliaVendedor(
  params: GetAnaliseFamiliaVendedorParams
): Promise<AnaliseFamiliaVendedor[]> {
  const options: ApiGetOptions = params.bypassCache ? { cache: false } : {};
  
  const raw = await apiGet<AnaliseFamiliaVendedorRaw>('/vendas/analise-familia-vendedor', {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
    codEmpresaEstoque: params.codEmpresaEstoque,
  }, options);

  return raw.map((r) => ({
    codEmpresa: r.empresa_cod_logico ?? r.cod_empresa ?? 0,
    empresa: r.empresa ?? '',
    codVendedor: r.cod_vendedor ?? 0,
    vendedor: (r.vendedor ?? '').trim(),
    familia: r.familia ?? '',
    qtdTransacao: r.qtd_transacao ?? 0,
    qtdProdutos: r.qtd_produtos ?? 0,
    totalVendido: r.total_vendido ?? 0,
  }));
}

// ============================================
// INTERFACES - ANÁLISE SKU (OTB)
// ============================================

interface AnaliseSkuRaw {
  cod_sku: number;
  descricao_item: string;
  marca: string;
  fornecedor: string;
  tipo: string;
  estoque_atual: number;
  data_ultima_venda: string | null;
  dias_desde_ultima_venda: number;
  data_ultimo_custo: string | null;
  preco_custo: number;
  preco_venda_final: number;
  qtd_produtos: number;
  total_vendido: number;
  // Bridge af64a42
  subcategoria?: string | null;
  dias_giro_medio?: number | null;
  dias_giro_mediano?: number | null;
  dias_giro_ultima_peca?: number | null;
  pecas_vendidas_consideradas?: number | null;
  // Bridge 73ef85f
  cod_barras_interno?: string | null;
  ean?: string | null;
}

export interface AnaliseSku {
  codSku: number;
  descricaoItem: string;
  marca: string;
  fornecedor: string;
  tipo: string;
  estoqueAtual: number;
  dataUltimaVenda: string | null;
  diasDesdeUltimaVenda: number;
  dataUltimoCusto: string | null;
  precoCusto: number;
  precoVendaFinal: number;
  qtdProdutos: number;
  totalVendido: number;
  // Calculados
  margemBruta: number;
  giroEstoque: number;
  // Bridge af64a42
  subcategoria: string | null;
  diasGiroMedio: number | null;
  diasGiroMediano: number | null;
  diasGiroUltimaPeca: number | null;
  pecasGiroConsideradas: number;
  // Bridge 73ef85f
  codigoBarra: string;
  ean: string | null;
}

export interface GetAnaliseSkuParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  /** Se true, ignora cache e busca dados ao vivo */
  bypassCache?: boolean;
}

/**
 * Busca análise por SKU para OTB e Central de IA
 * Retorna dados de vendas, estoque e custos por produto
 */
export async function getAnaliseSku(
  params: GetAnaliseSkuParams
): Promise<AnaliseSku[]> {
  const options: ApiGetOptions = { timeoutMs: 60000, ...(params.bypassCache ? { cache: false } : {}) };
  
  const raw = await apiGet<AnaliseSkuRaw>('/vendas/analise-sku', {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
  }, options);

  return raw.map((r) => {
    const precoCusto = r.preco_custo ?? 0;
    const precoVenda = r.preco_venda_final ?? 0;
    const estoqueAtual = r.estoque_atual ?? 0;
    const qtdProdutos = r.qtd_produtos ?? 0;
    
    // Margem bruta = (preço venda - custo) / preço venda * 100
    const margemBruta = precoVenda > 0 
      ? ((precoVenda - precoCusto) / precoVenda) * 100 
      : 0;
    
    // Giro = qtd vendida / estoque atual (se estoque > 0)
    const giroEstoque = estoqueAtual > 0 
      ? qtdProdutos / estoqueAtual 
      : qtdProdutos > 0 ? 999 : 0; // 999 indica sem estoque mas com vendas

    return {
      codSku: Number(r.cod_sku ?? 0) || 0,
      descricaoItem: (r.descricao_item ?? '').trim(),
      marca: (r.marca ?? 'SEM MARCA').trim(),
      // Fornecedor: tratar valores nulos, vazios ou apenas espaços
      fornecedor: (() => {
        const forn = (r.fornecedor ?? '').trim();
        if (!forn || forn === '' || forn.toUpperCase() === 'NULL') {
          return 'SEM FORNECEDOR';
        }
        return forn;
      })(),
      tipo: (r.tipo ?? 'OUTROS').trim(),
      estoqueAtual,
      dataUltimaVenda: r.data_ultima_venda,
      diasDesdeUltimaVenda: r.dias_desde_ultima_venda ?? 999,
      dataUltimoCusto: r.data_ultimo_custo,
      precoCusto,
      precoVendaFinal: precoVenda,
      qtdProdutos,
      totalVendido: r.total_vendido ?? 0,
      margemBruta,
      giroEstoque,
      subcategoria: r.subcategoria ? String(r.subcategoria).toUpperCase().trim() : null,
      diasGiroMedio: r.dias_giro_medio ?? null,
      diasGiroMediano: r.dias_giro_mediano ?? null,
      diasGiroUltimaPeca: r.dias_giro_ultima_peca ?? null,
      pecasGiroConsideradas: r.pecas_vendidas_consideradas ?? 0,
      codigoBarra: r.cod_barras_interno?.trim() || '',
      ean: r.ean?.trim() || null,
    };
  });
}
