import { supabase } from "@/integrations/supabase/client";

export interface MetaVenda {
  id: string;
  tipo: 'LOJA' | 'VENDEDOR';
  codReferencia: number;
  nomeReferencia: string | null;
  ano: number;
  mes: number;
  metaFaturamento: number;
  metaTicketMedio: number;
  metaDescontoMax: number;
  metaQtdVendas: number;
  numVendedores: number;
  percentualAceitavel: number;
}

function mapMetaRow(m: any): MetaVenda {
  return {
    id: m.id,
    tipo: m.tipo,
    codReferencia: m.cod_referencia,
    nomeReferencia: m.nome_referencia,
    ano: m.ano,
    mes: m.mes,
    metaFaturamento: Number(m.meta_faturamento) || 0,
    metaTicketMedio: Number(m.meta_ticket_medio) || 0,
    metaDescontoMax: Number(m.meta_desconto_max) || 0,
    metaQtdVendas: m.meta_qtd_vendas || 0,
    numVendedores: m.num_vendedores || 1,
    percentualAceitavel: Number(m.percentual_aceitavel) || 100,
  };
}

export async function getMetasPorPeriodo(
  tipo: 'LOJA' | 'VENDEDOR',
  ano: number,
  mes: number
): Promise<MetaVenda[]> {
  const { data, error } = await supabase
    .from('metas_vendas')
    .select('*')
    .eq('tipo', tipo)
    .eq('ano', ano)
    .eq('mes', mes);

  if (error) {
    console.error('Erro ao buscar metas:', error);
    return [];
  }

  return (data || []).map(mapMetaRow);
}

/**
 * F8: busca o ano INTEIRO de um tipo em 1 query (sem filtro de mês).
 * Substitui o padrão antigo de 12 queries (uma por mês) na tela de metas.
 */
export async function getMetasPorAno(
  tipo: 'LOJA' | 'VENDEDOR',
  ano: number
): Promise<MetaVenda[]> {
  const { data, error } = await supabase
    .from('metas_vendas')
    .select('*')
    .eq('tipo', tipo)
    .eq('ano', ano)
    .order('mes', { ascending: true });

  if (error) {
    console.error('Erro ao buscar metas do ano:', error);
    return [];
  }

  return (data || []).map(mapMetaRow);
}

export async function upsertMeta(meta: Omit<MetaVenda, 'id'>): Promise<boolean> {
  const { error } = await supabase
    .from('metas_vendas')
    .upsert({
      tipo: meta.tipo,
      cod_referencia: meta.codReferencia,
      nome_referencia: meta.nomeReferencia,
      ano: meta.ano,
      mes: meta.mes,
      meta_faturamento: meta.metaFaturamento,
      meta_ticket_medio: meta.metaTicketMedio,
      meta_desconto_max: meta.metaDescontoMax,
      meta_qtd_vendas: meta.metaQtdVendas,
      num_vendedores: meta.numVendedores || 1,
      percentual_aceitavel: meta.percentualAceitavel || 100,
    }, {
      onConflict: 'tipo,cod_referencia,ano,mes'
    });

  if (error) {
    console.error('Erro ao salvar meta:', error);
    return false;
  }
  return true;
}

export async function deleteMeta(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('metas_vendas')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao deletar meta:', error);
    return false;
  }
  return true;
}
