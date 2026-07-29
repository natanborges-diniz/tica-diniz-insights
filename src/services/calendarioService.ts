import { supabase } from "@/integrations/supabase/client";

// ==================== TIPOS E CÁLCULOS PUROS ====================
// Extraídos para src/lib/metas/calendario.ts (Fase 2) para serem testáveis
// sem o client Supabase. Reexportados aqui por compatibilidade.
import type {
  MetaPeriodo,
  Feriado,
  LojaConfiguracao,
  LojaExcecao,
} from "@/lib/metas/calendario";
export type { MetaPeriodo, Feriado, LojaConfiguracao, LojaExcecao };
export { calcularDiasUteis, getDatasDoPeriodo } from "@/lib/metas/calendario";

// ==================== PERÍODOS DE METAS ====================

export async function getMetasPeriodos(ano?: number): Promise<MetaPeriodo[]> {
  let query = supabase.from('metas_periodos').select('*');
  
  if (ano) {
    query = query.eq('ano', ano);
  }
  
  const { data, error } = await query.order('ano', { ascending: false }).order('mes', { ascending: true });
  
  if (error) {
    console.error('Erro ao buscar períodos:', error);
    return [];
  }
  
  return (data || []).map((p: any) => ({
    id: p.id,
    ano: p.ano,
    mes: p.mes,
    diaInicio: p.dia_inicio,
    diaFim: p.dia_fim,
    mesInicio: p.mes_inicio,
    mesFim: p.mes_fim,
    descricao: p.descricao,
  }));
}

export async function getMetaPeriodo(ano: number, mes: number): Promise<MetaPeriodo | null> {
  const { data, error } = await supabase
    .from('metas_periodos')
    .select('*')
    .eq('ano', ano)
    .eq('mes', mes)
    .maybeSingle();
  
  if (error || !data) {
    return null;
  }
  
  return {
    id: data.id,
    ano: data.ano,
    mes: data.mes,
    diaInicio: data.dia_inicio,
    diaFim: data.dia_fim,
    mesInicio: data.mes_inicio,
    mesFim: data.mes_fim,
    descricao: data.descricao,
  };
}

export async function upsertMetaPeriodo(periodo: Omit<MetaPeriodo, 'id'>): Promise<boolean> {
  const { error } = await supabase
    .from('metas_periodos')
    .upsert({
      ano: periodo.ano,
      mes: periodo.mes,
      dia_inicio: periodo.diaInicio,
      dia_fim: periodo.diaFim,
      mes_inicio: periodo.mesInicio,
      mes_fim: periodo.mesFim,
      descricao: periodo.descricao,
    }, {
      onConflict: 'ano,mes'
    });
  
  if (error) {
    console.error('Erro ao salvar período:', error);
    return false;
  }
  return true;
}

// ==================== FERIADOS ====================

export async function getFeriados(ano?: number): Promise<Feriado[]> {
  let query = supabase.from('calendario_feriados').select('*');
  
  if (ano) {
    // Pegar feriados do ano específico ou recorrentes
    query = query.or(`data.gte.${ano}-01-01,data.lte.${ano}-12-31,recorrente.eq.true`);
  }
  
  const { data, error } = await query.order('data', { ascending: true });
  
  if (error) {
    console.error('Erro ao buscar feriados:', error);
    return [];
  }
  
  return (data || []).map((f: any) => ({
    id: f.id,
    data: f.data,
    descricao: f.descricao,
    tipo: f.tipo,
    uf: f.uf,
    cidade: f.cidade,
    recorrente: f.recorrente,
  }));
}

export async function upsertFeriado(feriado: Omit<Feriado, 'id'>): Promise<boolean> {
  const { error } = await supabase
    .from('calendario_feriados')
    .upsert({
      data: feriado.data,
      descricao: feriado.descricao,
      tipo: feriado.tipo,
      uf: feriado.uf,
      cidade: feriado.cidade,
      recorrente: feriado.recorrente,
    }, {
      onConflict: 'data,tipo,uf,cidade'
    });
  
  if (error) {
    console.error('Erro ao salvar feriado:', error);
    return false;
  }
  return true;
}

export async function deleteFeriado(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('calendario_feriados')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Erro ao excluir feriado:', error);
    return false;
  }
  return true;
}

// ==================== CONFIGURAÇÃO DE LOJAS ====================

export async function getLojasConfiguracao(): Promise<LojaConfiguracao[]> {
  const { data, error } = await supabase
    .from('lojas_configuracao')
    .select('*')
    .order('cod_empresa', { ascending: true });
  
  if (error) {
    console.error('Erro ao buscar configuração de lojas:', error);
    return [];
  }
  
  return (data || []).map((l: any) => ({
    id: l.id,
    codEmpresa: l.cod_empresa,
    tipoLoja: l.tipo_loja,
    abreDomingo: l.abre_domingo,
    abreFeriado: l.abre_feriado,
    numVendedores: l.num_vendedores ?? 1,
    percentualAceitavel: l.percentual_aceitavel ?? 100,
    cidade: l.cidade ?? null,
    uf: l.uf ?? 'SP',
  }));
}

export async function getLojaConfiguracao(codEmpresa: number): Promise<LojaConfiguracao | null> {
  const { data, error } = await supabase
    .from('lojas_configuracao')
    .select('*')
    .eq('cod_empresa', codEmpresa)
    .maybeSingle();
  
  if (error || !data) {
    return null;
  }
  
  return {
    id: data.id,
    codEmpresa: data.cod_empresa,
    tipoLoja: data.tipo_loja as 'RUA' | 'SHOPPING',
    abreDomingo: data.abre_domingo,
    abreFeriado: data.abre_feriado,
    numVendedores: data.num_vendedores ?? 1,
    percentualAceitavel: data.percentual_aceitavel ?? 100,
    cidade: data.cidade ?? null,
    uf: data.uf ?? 'SP',
  };
}

export async function upsertLojaConfiguracao(config: Omit<LojaConfiguracao, 'id'>): Promise<boolean> {
  const { error } = await supabase
    .from('lojas_configuracao')
    .upsert({
      cod_empresa: config.codEmpresa,
      tipo_loja: config.tipoLoja,
      abre_domingo: config.abreDomingo,
      abre_feriado: config.abreFeriado,
      num_vendedores: config.numVendedores,
      percentual_aceitavel: config.percentualAceitavel,
      cidade: config.cidade ?? null,
      uf: config.uf ?? 'SP',
    }, {
      onConflict: 'cod_empresa'
    });
  
  if (error) {
    console.error('Erro ao salvar configuração de loja:', error);
    return false;
  }
  return true;
}

// ==================== EXCEÇÕES DE FUNCIONAMENTO ====================

export async function getLojasExcecoes(codEmpresa?: number, dataInicio?: string, dataFim?: string): Promise<LojaExcecao[]> {
  let query = supabase.from('lojas_excecoes').select('*');
  
  if (codEmpresa) {
    query = query.eq('cod_empresa', codEmpresa);
  }
  if (dataInicio) {
    query = query.gte('data', dataInicio);
  }
  if (dataFim) {
    query = query.lte('data', dataFim);
  }
  
  const { data, error } = await query.order('data', { ascending: true });
  
  if (error) {
    console.error('Erro ao buscar exceções:', error);
    return [];
  }
  
  return (data || []).map((e: any) => ({
    id: e.id,
    codEmpresa: e.cod_empresa,
    data: e.data,
    aberto: e.aberto,
    motivo: e.motivo,
  }));
}

export async function upsertLojaExcecao(excecao: Omit<LojaExcecao, 'id'>): Promise<boolean> {
  const { error } = await supabase
    .from('lojas_excecoes')
    .upsert({
      cod_empresa: excecao.codEmpresa,
      data: excecao.data,
      aberto: excecao.aberto,
      motivo: excecao.motivo,
    }, {
      onConflict: 'cod_empresa,data'
    });
  
  if (error) {
    console.error('Erro ao salvar exceção:', error);
    return false;
  }
  return true;
}

export async function deleteLojaExcecao(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('lojas_excecoes')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Erro ao excluir exceção:', error);
    return false;
  }
  return true;
}

// (utilitários de cálculo puros movidos para src/lib/metas/calendario.ts —
// reexportados no topo deste arquivo)
