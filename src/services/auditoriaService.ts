// src/services/auditoriaService.ts
// Service para endpoints de auditoria de vendas/formas de pagamento
// Suporta paginação para evitar timeouts

import { apiGet, EmpresaParam, formatEmpresaParam, ApiGetOptions } from './firebirdBridge';

// ============================================
// INTERFACES - AUDITORIA FORMAS PAGAMENTO
// ============================================

// Interface RAW do endpoint full (mais campos)
interface AuditoriaFullRaw {
  cod_empresa: number;
  empresa: string;
  cod_vendedor: number;
  vendedor: string;
  cod_forma: number;
  forma_pagamento: string;
  id_venda: number;
  numero: string;
  data_venda: string;
  total_bruto: number;
  total_desconto: number;
  total_liquido: number;
  valor_pago: number;
}

// Interface RAW do endpoint light (menos campos, mais rápido)
interface AuditoriaLightRaw {
  cod_empresa: number;
  empresa: string;
  vendedor: string;
  forma_pagamento: string;
  total_bruto: number;
  total_desconto: number;
  total_liquido: number;
  qtd_vendas: number;
}

// Interface normalizada para o frontend - versão completa
export interface AuditoriaFull {
  codEmpresa: number;
  empresa: string;
  codVendedor: number;
  vendedor: string;
  codForma: number;
  formaPagamento: string;
  idVenda: number;
  numero: string;
  dataVenda: string;
  totalBruto: number;
  totalDesconto: number;
  totalLiquido: number;
  valorPago: number;
}

// Interface normalizada para o frontend - versão light
export interface AuditoriaLight {
  codEmpresa: number;
  empresa: string;
  vendedor: string;
  formaPagamento: string;
  totalBruto: number;
  totalDesconto: number;
  totalLiquido: number;
  qtdVendas: number;
}

// ============================================
// INTERFACES - PAGINAÇÃO E PROGRESSO
// ============================================

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    hasMore: boolean;
    total?: number;
  };
}

export interface ProgressoPaginacao {
  paginaAtual: number;
  totalEstimado: number;
  registrosCarregados: number;
}

export interface AuditoriaParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  /** Exclui vendas pagas com créditos */
  excluirCreditos?: boolean;
  /** Página a buscar (padrão: 1) */
  page?: number;
  /** Tamanho da página (padrão: 500, máx: 1000) */
  pageSize?: number;
}

// ============================================
// FUNÇÕES DE AUDITORIA
// ============================================

/**
 * Busca auditoria completa (endpoint full) - mais detalhes, mais lento
 * Recomendado para: auditoria detalhada, conferência manual
 */
export async function getAuditoriaFull(
  params: AuditoriaParams
): Promise<PaginatedResponse<AuditoriaFull>> {
  const { page = 1, pageSize = 500 } = params;
  
  const queryParams: Record<string, string | number | boolean | undefined> = {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
    page,
    pageSize: Math.min(pageSize, 1000), // Máximo 1000
  };
  
  if (params.excluirCreditos) {
    queryParams.excluirCreditos = 1;
  }

  console.log(`[AuditoriaService] Fetching full audit page ${page}...`);
  
  const raw = await apiGet<AuditoriaFullRaw>('/vendas/auditoria-formas-pagamento', queryParams);

  const data = raw.map((r) => ({
    codEmpresa: r.cod_empresa ?? 0,
    empresa: (r.empresa ?? '').trim(),
    codVendedor: r.cod_vendedor ?? 0,
    vendedor: (r.vendedor ?? '').trim(),
    codForma: r.cod_forma ?? 0,
    formaPagamento: (r.forma_pagamento ?? '').trim(),
    idVenda: r.id_venda ?? 0,
    numero: r.numero ?? '',
    dataVenda: r.data_venda ?? '',
    totalBruto: r.total_bruto ?? 0,
    totalDesconto: r.total_desconto ?? 0,
    totalLiquido: r.total_liquido ?? 0,
    valorPago: r.valor_pago ?? 0,
  }));

  console.log(`[AuditoriaService] Full audit page ${page}: ${data.length} records`);

  return {
    data,
    pagination: {
      page,
      pageSize,
      hasMore: data.length === pageSize,
      total: undefined, // Backend não retorna total
    },
  };
}

/**
 * Busca auditoria resumida (endpoint light) - menos detalhes, mais rápido
 * Recomendado para: validação rápida, comparação com cache, período aberto
 */
export async function getAuditoriaLight(
  params: AuditoriaParams,
  signal?: AbortSignal
): Promise<PaginatedResponse<AuditoriaLight>> {
  const { page = 1, pageSize = 500 } = params;
  
  const queryParams: Record<string, string | number | boolean | undefined> = {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
    page,
    pageSize: Math.min(pageSize, 1000),
  };
  
  if (params.excluirCreditos) {
    queryParams.excluirCreditos = 1;
  }

  console.log(`[AuditoriaService] Fetching light audit page ${page}:`, { 
    empresa: queryParams.empresa, 
    dataInicio: queryParams.dataInicio, 
    dataFim: queryParams.dataFim 
  });
  
  const raw = await apiGet<AuditoriaLightRaw>(
    '/vendas/auditoria-formas-pagamento-light', 
    queryParams,
    { signal, timeoutMs: 60000 } // 60s timeout por página
  );

  const data = raw.map((r) => ({
    codEmpresa: r.cod_empresa ?? 0,
    empresa: (r.empresa ?? '').trim(),
    vendedor: (r.vendedor ?? '').trim(),
    formaPagamento: (r.forma_pagamento ?? '').trim(),
    totalBruto: r.total_bruto ?? 0,
    totalDesconto: r.total_desconto ?? 0,
    totalLiquido: r.total_liquido ?? 0,
    qtdVendas: r.qtd_vendas ?? 0,
  }));

  console.log(`[AuditoriaService] Light audit page ${page}: ${data.length} records`);

  return {
    data,
    pagination: {
      page,
      pageSize,
      hasMore: data.length === pageSize,
      total: undefined,
    },
  };
}

/**
 * Busca todas as páginas de auditoria light (agregado)
 * Útil para períodos abertos quando cache é insuficiente
 * @param onProgress Callback para reportar progresso da paginação
 * @param signal AbortSignal para cancelar a busca
 */
export async function getAuditoriaLightCompleta(
  params: Omit<AuditoriaParams, 'page' | 'pageSize'>,
  maxPages = 20,
  onProgress?: (progresso: ProgressoPaginacao) => void,
  signal?: AbortSignal
): Promise<AuditoriaLight[]> {
  const allData: AuditoriaLight[] = [];
  let page = 1;
  let hasMore = true;
  // Reduzido para 100 para evitar timeout em lojas com muitos dados
  const pageSize = 100;

  console.log(`[AuditoriaService] Fetching complete light audit:`, {
    empresa: params.empresa,
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
  });

  while (hasMore && page <= maxPages) {
    // Verificar se foi cancelado antes de cada página
    if (signal?.aborted) {
      console.log('[AuditoriaService] Busca cancelada pelo usuário');
      throw new Error('Requisição cancelada');
    }
    
    // Reportar progresso antes de cada página
    onProgress?.({
      paginaAtual: page,
      totalEstimado: maxPages,
      registrosCarregados: allData.length,
    });

    const response = await getAuditoriaLight({
      ...params,
      page,
      pageSize,
    }, signal);

    allData.push(...response.data);
    hasMore = response.pagination.hasMore;
    
    // Atualizar estimativa se terminou
    if (!hasMore) {
      onProgress?.({
        paginaAtual: page,
        totalEstimado: page,
        registrosCarregados: allData.length,
      });
    }
    
    page++;
  }

  if (page > maxPages && hasMore) {
    console.warn(`[AuditoriaService] Reached max pages (${maxPages}), some data may be missing`);
  }

  console.log(`[AuditoriaService] Complete light audit: ${allData.length} total records from ${page - 1} pages`);

  return allData;
}

/**
 * Converte dados de auditoria light para formato de ResumoFormaPagamento
 * Para manter compatibilidade com o restante do frontend
 */
export function auditoriaLightToResumo(data: AuditoriaLight[]): {
  codEmpresa: number;
  empresa: string;
  vendedor: string;
  formaPagamento: string;
  totalGeral: number;
  qtdVendas: number;
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
}[] {
  return data.map((r) => ({
    codEmpresa: r.codEmpresa,
    empresa: r.empresa,
    vendedor: r.vendedor,
    formaPagamento: r.formaPagamento,
    totalGeral: r.totalLiquido,
    qtdVendas: r.qtdVendas,
    totalBruto: r.totalBruto,
    totalDesconto: r.totalDesconto,
    percentualDesconto: r.totalBruto > 0 ? (r.totalDesconto / r.totalBruto) * 100 : 0,
  }));
}

// Função getDetalheDia removida - detalhamento desabilitado temporariamente
