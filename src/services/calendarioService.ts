import { supabase } from "@/integrations/supabase/client";

// ==================== TIPOS ====================

export interface MetaPeriodo {
  id: string;
  ano: number;
  mes: number;
  diaInicio: number;
  diaFim: number;
  mesInicio: number | null;
  mesFim: number | null;
  descricao: string | null;
}

export interface Feriado {
  id: string;
  data: string;
  descricao: string;
  tipo: 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL';
  uf: string | null;
  cidade: string | null;
  recorrente: boolean;
}

export interface LojaConfiguracao {
  id: string;
  codEmpresa: number;
  tipoLoja: 'RUA' | 'SHOPPING';
  abreDomingo: boolean;
  abreFeriado: boolean;
}

export interface LojaExcecao {
  id: string;
  codEmpresa: number;
  data: string;
  aberto: boolean;
  motivo: string | null;
}

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

// ==================== UTILITÁRIOS DE CÁLCULO ====================

/**
 * Calcula os dias úteis em um período considerando regras da loja
 */
export function calcularDiasUteis(
  dataInicio: Date,
  dataFim: Date,
  config: LojaConfiguracao | null,
  feriados: Feriado[],
  excecoes: LojaExcecao[]
): number {
  let diasUteis = 0;
  const current = new Date(dataInicio);
  
  // Configuração padrão se não houver config
  const abreDomingo = config?.abreDomingo ?? false;
  const abreFeriado = config?.abreFeriado ?? false;
  
  // Mapear exceções por data
  const excecoesMap = new Map<string, boolean>();
  excecoes.forEach(e => {
    excecoesMap.set(e.data, e.aberto);
  });
  
  // Mapear feriados por data (considerar recorrentes)
  const feriadosSet = new Set<string>();
  feriados.forEach(f => {
    if (f.recorrente) {
      // Para feriados recorrentes, usar apenas mês/dia
      const [, mes, dia] = f.data.split('-');
      const anoAtual = current.getFullYear();
      feriadosSet.add(`${anoAtual}-${mes}-${dia}`);
    } else {
      feriadosSet.add(f.data);
    }
  });
  
  while (current <= dataFim) {
    const dataStr = current.toISOString().split('T')[0];
    const diaSemana = current.getDay(); // 0 = Domingo
    const ehDomingo = diaSemana === 0;
    const ehFeriado = feriadosSet.has(dataStr);
    
    // Verificar exceção primeiro
    if (excecoesMap.has(dataStr)) {
      if (excecoesMap.get(dataStr)) {
        diasUteis++;
      }
    } else {
      // Aplicar regras normais
      let aberto = true;
      
      if (ehDomingo && !abreDomingo) {
        aberto = false;
      }
      if (ehFeriado && !abreFeriado) {
        aberto = false;
      }
      
      if (aberto) {
        diasUteis++;
      }
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return diasUteis;
}

/**
 * Retorna as datas do período da meta (considerando config de período customizado)
 */
export function getDatasDoPeríodo(
  ano: number,
  mes: number,
  periodoConfig: MetaPeriodo | null
): { dataInicio: Date; dataFim: Date } {
  if (periodoConfig) {
    const mesInicio = periodoConfig.mesInicio ?? mes;
    const mesFim = periodoConfig.mesFim ?? mes;
    
    // Ajustar ano se mês início for maior que mês fim (virada de ano)
    const anoInicio = mesInicio > mes ? ano - 1 : ano;
    const anoFim = mesFim < mes ? ano + 1 : ano;
    
    return {
      dataInicio: new Date(anoInicio, mesInicio - 1, periodoConfig.diaInicio),
      dataFim: new Date(anoFim, mesFim - 1, periodoConfig.diaFim),
    };
  }
  
  // Padrão: primeiro e último dia do mês
  return {
    dataInicio: new Date(ano, mes - 1, 1),
    dataFim: new Date(ano, mes, 0), // Último dia do mês
  };
}
