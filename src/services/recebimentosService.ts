// src/services/recebimentosService.ts
// Fase 1 — Dados de recebimento (docs/REVISAO_VENDAS_METAS.md §5.2/§5.3).
// Leitura do cache diário recebimentos_agregado_diario (Supabase) — a fonte
// primária de metas/comissões sobre VALORES RECEBIDOS — e disparo manual da
// edge function sync-recebimentos-diario (mesmo padrão do syncCacheService).
// Sem tela ainda: as telas vêm na Fase 3.

import { supabase } from '@/integrations/supabase/client';
import {
  EmpresaParam,
  aplicarFiltroEmpresaSupabase,
} from './firebirdBridge';
import {
  FormaCategoria,
  OrigemRecebimento,
  RecebimentoAgregado,
  RecebimentosSemana,
  agruparRecebimentosPorSemana,
} from '@/lib/recebimentos/semanaComercial';

// Tipos re-exportados (contrato público do service)
export type { FormaCategoria, OrigemRecebimento, RecebimentoAgregado, RecebimentosSemana };
export {
  agruparRecebimentosPorSemana,
  inicioSemanaComercial,
  fimSemanaComercial,
} from '@/lib/recebimentos/semanaComercial';

export interface GetRecebimentosParams {
  empresa: EmpresaParam;
  /** YYYY-MM-DD */
  dataInicio: string;
  /** YYYY-MM-DD */
  dataFim: string;
  /** Filtra um vendedor específico (0 = sem vendedor identificado) */
  codVendedor?: number;
}

// Supabase limita cada select a ~1000 linhas — paginamos para períodos longos.
const PAGE_SIZE = 1000;

type RecebimentoRow = {
  cod_empresa: number;
  cod_vendedor: number;
  vendedor_nome: string | null;
  data_pagamento: string;
  forma_categoria: string;
  origem: string;
  valor_recebido: number;
  qtd_parcelas: number;
};

function mapRow(row: RecebimentoRow): RecebimentoAgregado {
  return {
    codEmpresa: row.cod_empresa,
    codVendedor: row.cod_vendedor,
    vendedorNome: row.vendedor_nome,
    dataPagamento: row.data_pagamento,
    formaCategoria: (row.forma_categoria || 'OUTROS') as FormaCategoria,
    origem: (row.origem || 'VENDA_PERIODO') as OrigemRecebimento,
    valorRecebido: Number(row.valor_recebido) || 0,
    qtdParcelas: row.qtd_parcelas || 0,
  };
}

/**
 * Lê o agregado diário de recebimentos do cache Supabase para o período,
 * com filtro opcional de empresas (numero, lista ou 'ALL') e de vendedor.
 */
export async function getRecebimentosAgregado(
  params: GetRecebimentosParams
): Promise<RecebimentoAgregado[]> {
  const todas: RecebimentoAgregado[] = [];
  let from = 0;

  for (;;) {
    let query: any = (supabase as any)
      .from('recebimentos_agregado_diario')
      .select('cod_empresa, cod_vendedor, vendedor_nome, data_pagamento, forma_categoria, origem, valor_recebido, qtd_parcelas')
      .gte('data_pagamento', params.dataInicio)
      .lte('data_pagamento', params.dataFim)
      .order('data_pagamento', { ascending: true })
      .order('cod_empresa', { ascending: true })
      .order('cod_vendedor', { ascending: true })
      .order('forma_categoria', { ascending: true })
      .order('origem', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    query = aplicarFiltroEmpresaSupabase(query, params.empresa);
    if (params.codVendedor != null) {
      query = query.eq('cod_vendedor', params.codVendedor);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Erro ao buscar recebimentos agregados: ${error.message}`);
    }
    const page = (data || []) as RecebimentoRow[];
    todas.push(...page.map(mapRow));
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return todas;
}

/**
 * Recebimentos do período agrupados por semana comercial (segunda → domingo).
 * `origem` já vem relativa à semana comercial da data de pagamento (garantido
 * pelo sync), então VENDA_PERIODO/SALDO_ANTERIOR de cada semana são coerentes.
 */
export async function getRecebimentosPorSemana(
  params: GetRecebimentosParams
): Promise<RecebimentosSemana[]> {
  const recebimentos = await getRecebimentosAgregado(params);
  return agruparRecebimentosPorSemana(recebimentos);
}

// ============================================
// SYNC — disparo manual da edge function
// ============================================

export interface SincronizarRecebimentosParams {
  /** YYYY-MM-DD — a edge ancora na segunda-feira da semana comercial */
  dataInicio?: string;
  /** YYYY-MM-DD — default: hoje (BRT) */
  dataFim?: string;
  /** default: todas as empresas ativas (lista da edge) */
  empresas?: number[];
}

export interface SincronizarRecebimentosResult {
  success: boolean;
  status?: 'OK' | 'PARCIAL' | 'ERRO';
  periodo?: string;
  linhas?: number;
  erro?: string;
}

/**
 * Invoca a edge sync-recebimentos-diario (JWT do usuário logado propagado
 * automaticamente; server-side exige admin). Sem parâmetros, sincroniza a
 * semana comercial corrente — mesmo comportamento do cron diário.
 */
export async function sincronizarRecebimentos(
  params: SincronizarRecebimentosParams = {}
): Promise<SincronizarRecebimentosResult> {
  const { data, error } = await supabase.functions.invoke('sync-recebimentos-diario', {
    body: params,
  });

  if (error) {
    console.error('[recebimentosService] Erro ao invocar sync:', error);
    return { success: false, erro: error.message || String(error) };
  }

  return {
    success: data?.success ?? false,
    status: data?.status,
    periodo: data?.periodo,
    linhas: data?.linhas,
    erro: data?.error,
  };
}

export interface UltimoSyncRecebimentos {
  executadoEm: string;
  status: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  linhas: number;
}

/**
 * Última execução registrada em sync_log (para exibir "dados de DD/MM HH:mm"
 * no frontend — plano §4).
 */
export async function getUltimoSyncRecebimentos(): Promise<UltimoSyncRecebimentos | null> {
  const { data, error } = await supabase
    .from('sync_log')
    .select('executado_em, status, periodo_inicio, periodo_fim, linhas')
    .eq('sync_tipo', 'recebimentos_diario')
    .order('executado_em', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return {
    executadoEm: row.executado_em,
    status: row.status,
    periodoInicio: row.periodo_inicio,
    periodoFim: row.periodo_fim,
    linhas: row.linhas ?? 0,
  };
}
