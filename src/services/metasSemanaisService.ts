// src/services/metasSemanaisService.ts
// Fase 2 — Metas semanais (docs/REVISAO_VENDAS_METAS.md §5.2/§5.3).
//
// DESIGN: só as linhas tipo LOJA são MATERIALIZADAS em metas_semanais (geradas
// da meta mensal). As metas de VENDEDOR, GERENTE e SUPERVISOR são DERIVADAS na
// leitura:
//   VENDEDOR   = meta_loja(semana) × percentual_divisao/100 ÷ num_vendedores
//                (parâmetros em divisao_semanal; fallback lojas_configuracao)
//   GERENTE    = meta_loja(semana)
//   SUPERVISOR = Σ meta_loja das lojas do grupo (grupos_lojas)
// Ajustes manuais (origem='AJUSTADA') são persistidos em metas_semanais para
// qualquer tipo e têm precedência sobre o valor derivado. Assim, alterar o
// divisor de uma semana "regenera" as metas dos vendedores automaticamente
// (são derivadas), preservando as ajustadas — sem problema de roster.

import { supabase } from '@/integrations/supabase/client';
import {
  gerarSemanasDoPeriodo,
  gerarSemanasDeCortes,
  validarCortes,
  calcularMetaSemanalLoja,
  derivarMetaVendedor,
  sugerirMetaMensal,
  type MetaSemanalCalculada,
  type CorteSemana,
} from '@/lib/metas/metasSemanais';
export type { CorteSemana };
import { getDatasDoPeriodo } from '@/lib/metas/calendario';
import {
  getMetaPeriodo,
  getFeriados,
  getLojaConfiguracao,
  getLojasExcecoes,
} from './calendarioService';
import { getRecebimentosAgregado } from './recebimentosService';
import { isCredito, isDevolucao } from '@/lib/vendas/formaPagamento';

// ==================== TIPOS ====================

export type TipoMetaSemanal = 'LOJA' | 'VENDEDOR' | 'GERENTE' | 'SUPERVISOR';

export interface MetaSemanal {
  id?: string;
  tipo: TipoMetaSemanal;
  codReferencia: number;
  nomeReferencia: string | null;
  codEmpresa: number | null;
  ano: number;
  mes: number;
  semanaInicio: string;
  semanaFim: string;
  metaValor: number;
  diasUteis: number;
  origem: 'AUTO' | 'AJUSTADA';
}

export interface DivisaoSemanal {
  codEmpresa: number;
  semanaInicio: string;
  percentualDivisao: number;
  numVendedores: number;
}

export interface GrupoLojas {
  codGrupo: number;
  nome: string;
  membros: number[];
}

export interface ComissaoTaxa {
  formaCategoria: string;
  percentual: number;
}

export interface PremioConfig {
  id?: string;
  tipo: 'FAIXA' | 'SEQUENCIA';
  percentualMetaMin: number | null;
  percentualPremio: number;
  semanasConsecutivas: number | null;
  ativo: boolean;
  /** PERCENTUAL = % sobre a base da semana; FIXO = valor em R$ */
  tipoValor: 'PERCENTUAL' | 'FIXO';
  valorFixo: number;
}

export interface GerarSemanasResult {
  semanas: MetaSemanalCalculada[];
  avisos: string[];
}

// ==================== CORTES SEMANAIS (globais por ano/mês) ====================

/** Cortes manuais do mês comercial; [] = usar sugestão automática (seg→dom). */
export async function getSemanaCortes(ano: number, mes: number): Promise<CorteSemana[]> {
  const { data, error } = await (supabase as any)
    .from('metas_semana_cortes')
    .select('semana_inicio, semana_fim')
    .eq('ano', ano)
    .eq('mes', mes)
    .order('semana_inicio');
  if (error) throw new Error(`Erro ao ler cortes: ${error.message}`);
  return ((data || []) as any[]).map((r) => ({
    semanaInicio: r.semana_inicio,
    semanaFim: r.semana_fim,
  }));
}

/**
 * Salva os cortes finalizados pelo gestor (valida contiguidade/cobertura do
 * período 21→20). Remove metas semanais LOJA do mês cujo semana_inicio não
 * exista mais nos novos cortes (inclusive AJUSTADAS — avisadas no retorno).
 */
export async function salvarSemanaCortes(
  ano: number,
  mes: number,
  cortes: CorteSemana[]
): Promise<{ avisos: string[] }> {
  const periodoCfg = await getMetaPeriodo(ano, mes);
  const { dataInicio, dataFim } = getDatasDoPeriodo(ano, mes, periodoCfg);
  const ini = dataInicio.toISOString().split('T')[0];
  const fim = dataFim.toISOString().split('T')[0];
  const erros = validarCortes(cortes, ini, fim);
  if (erros.length) throw new Error(erros.join(' · '));

  const avisos: string[] = [];
  const iniciosNovos = new Set(cortes.map((c) => c.semanaInicio));

  // metas existentes fora dos novos cortes (qualquer tipo) → remover
  const { data: orfas } = await (supabase as any)
    .from('metas_semanais')
    .select('id, tipo, cod_referencia, semana_inicio, origem')
    .eq('ano', ano)
    .eq('mes', mes);
  const remover = ((orfas || []) as any[]).filter((m) => !iniciosNovos.has(m.semana_inicio));
  if (remover.length) {
    const ajustadas = remover.filter((m) => m.origem === 'AJUSTADA').length;
    if (ajustadas) {
      avisos.push(
        `${ajustadas} meta(s) AJUSTADA(s) removida(s) — os cortes mudaram; ajuste novamente se necessário`
      );
    }
    const { error: errDel } = await (supabase as any)
      .from('metas_semanais')
      .delete()
      .in('id', remover.map((m) => m.id));
    if (errDel) throw new Error(`Erro ao limpar metas antigas: ${errDel.message}`);
  }

  // substituir cortes do mês
  const { error: errDelCortes } = await (supabase as any)
    .from('metas_semana_cortes')
    .delete()
    .eq('ano', ano)
    .eq('mes', mes);
  if (errDelCortes) throw new Error(`Erro ao limpar cortes: ${errDelCortes.message}`);
  const ordenados = cortes.slice().sort((a, b) => a.semanaInicio.localeCompare(b.semanaInicio));
  const { error: errIns } = await (supabase as any).from('metas_semana_cortes').insert(
    ordenados.map((c, i) => ({
      ano,
      mes,
      ordem: i + 1,
      semana_inicio: c.semanaInicio,
      semana_fim: c.semanaFim,
    }))
  );
  if (errIns) throw new Error(`Erro ao salvar cortes: ${errIns.message}`);
  return { avisos };
}

/** Volta o mês para a sugestão automática (remove cortes manuais). */
export async function removerSemanaCortes(ano: number, mes: number): Promise<void> {
  const { error } = await (supabase as any)
    .from('metas_semana_cortes')
    .delete()
    .eq('ano', ano)
    .eq('mes', mes);
  if (error) throw new Error(`Erro ao remover cortes: ${error.message}`);
}

// ==================== GERAÇÃO (LOJA) ====================

/**
 * Gera/regenera as metas semanais da LOJA a partir da meta mensal
 * (metas_vendas), respeitando o período comercial e o calendário da loja.
 * Linhas AJUSTADAS manualmente são preservadas (aviso no retorno).
 */
export async function gerarSemanasLoja(
  codEmpresa: number,
  ano: number,
  mes: number
): Promise<GerarSemanasResult> {
  const avisos: string[] = [];

  // 1) meta mensal da loja
  const { data: metaMensalRow, error: errMeta } = await supabase
    .from('metas_vendas')
    .select('meta_faturamento, nome_referencia')
    .eq('tipo', 'LOJA')
    .eq('cod_referencia', codEmpresa)
    .eq('ano', ano)
    .eq('mes', mes)
    .maybeSingle();
  if (errMeta) throw new Error(`Erro ao ler meta mensal: ${errMeta.message}`);
  if (!metaMensalRow) {
    throw new Error(
      `Sem meta mensal configurada para loja ${codEmpresa} em ${mes}/${ano} (metas_vendas)`
    );
  }
  const metaMensal = Number(metaMensalRow.meta_faturamento) || 0;

  // 2) calendário: período comercial + feriados + config + exceções
  const periodo = await getMetaPeriodo(ano, mes);
  const { dataInicio, dataFim } = getDatasDoPeriodo(ano, mes, periodo);
  const [feriados, config, excecoes] = await Promise.all([
    getFeriados(ano),
    getLojaConfiguracao(codEmpresa),
    getLojasExcecoes(
      codEmpresa,
      dataInicio.toISOString().split('T')[0],
      dataFim.toISOString().split('T')[0]
    ),
  ]);
  if (!config) avisos.push(`Loja ${codEmpresa} sem lojas_configuracao — usando padrão (fecha domingo/feriado)`);

  // 3) cálculo puro — cortes MANUAIS têm precedência sobre a sugestão seg→dom
  const cortes = await getSemanaCortes(ano, mes);
  const semanas = cortes.length
    ? gerarSemanasDeCortes(cortes, config, feriados, excecoes)
    : gerarSemanasDoPeriodo(dataInicio, dataFim, config, feriados, excecoes);
  const metas = calcularMetaSemanalLoja(metaMensal, semanas);

  // 4) preservar AJUSTADAS existentes
  const { data: existentes, error: errExist } = await (supabase as any)
    .from('metas_semanais')
    .select('semana_inicio, origem, meta_valor')
    .eq('tipo', 'LOJA')
    .eq('cod_referencia', codEmpresa)
    .in('semana_inicio', metas.map((m) => m.semanaInicio));
  if (errExist) throw new Error(`Erro ao ler metas existentes: ${errExist.message}`);
  const ajustadas = new Set(
    ((existentes || []) as any[])
      .filter((e) => e.origem === 'AJUSTADA')
      .map((e) => e.semana_inicio as string)
  );

  // 5) upsert das AUTO
  const linhas = metas
    .filter((m) => !ajustadas.has(m.semanaInicio))
    .map((m) => ({
      tipo: 'LOJA',
      cod_referencia: codEmpresa,
      nome_referencia: metaMensalRow.nome_referencia ?? null,
      cod_empresa: codEmpresa,
      ano,
      mes,
      semana_inicio: m.semanaInicio,
      semana_fim: m.semanaFim,
      meta_valor: m.metaValor,
      dias_uteis: m.diasUteis,
      origem: 'AUTO',
      atualizado_em: new Date().toISOString(),
    }));

  if (linhas.length) {
    const { error: errUpsert } = await (supabase as any)
      .from('metas_semanais')
      .upsert(linhas, { onConflict: 'tipo,cod_referencia,semana_inicio' });
    if (errUpsert) throw new Error(`Erro ao gravar metas semanais: ${errUpsert.message}`);
  }
  if (ajustadas.size) {
    avisos.push(
      `${ajustadas.size} semana(s) com ajuste manual preservada(s): ${[...ajustadas].join(', ')}`
    );
  }

  return { semanas: metas, avisos };
}

/** Marca uma meta semanal como AJUSTADA com novo valor (qualquer tipo). */
export async function ajustarMetaSemanal(
  tipo: TipoMetaSemanal,
  codReferencia: number,
  semanaInicio: string,
  metaValor: number,
  extras?: Partial<{ codEmpresa: number; nomeReferencia: string; ano: number; mes: number; semanaFim: string; diasUteis: number }>
): Promise<void> {
  const { error } = await (supabase as any).from('metas_semanais').upsert(
    {
      tipo,
      cod_referencia: codReferencia,
      nome_referencia: extras?.nomeReferencia ?? null,
      cod_empresa: extras?.codEmpresa ?? null,
      ano: extras?.ano ?? Number(semanaInicio.slice(0, 4)),
      mes: extras?.mes ?? Number(semanaInicio.slice(5, 7)),
      semana_inicio: semanaInicio,
      semana_fim: extras?.semanaFim ?? semanaInicio,
      meta_valor: metaValor,
      dias_uteis: extras?.diasUteis ?? 0,
      origem: 'AJUSTADA',
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'tipo,cod_referencia,semana_inicio' }
  );
  if (error) throw new Error(`Erro ao ajustar meta: ${error.message}`);
}

/** Volta uma meta AJUSTADA para AUTO (na próxima regeração ela é recalculada). */
export async function reverterAjuste(
  tipo: TipoMetaSemanal,
  codReferencia: number,
  semanaInicio: string
): Promise<void> {
  const { error } = await (supabase as any)
    .from('metas_semanais')
    .update({ origem: 'AUTO' })
    .eq('tipo', tipo)
    .eq('cod_referencia', codReferencia)
    .eq('semana_inicio', semanaInicio);
  if (error) throw new Error(`Erro ao reverter ajuste: ${error.message}`);
}

// ==================== LEITURA ====================

export interface GetMetasSemanaisFiltros {
  tipo?: TipoMetaSemanal;
  codEmpresa?: number;
  ano?: number;
  mes?: number;
  semanaInicio?: string;
}

export async function getMetasSemanais(f: GetMetasSemanaisFiltros): Promise<MetaSemanal[]> {
  let q: any = (supabase as any).from('metas_semanais').select('*');
  if (f.tipo) q = q.eq('tipo', f.tipo);
  if (f.codEmpresa != null) q = q.eq('cod_empresa', f.codEmpresa);
  if (f.ano != null) q = q.eq('ano', f.ano);
  if (f.mes != null) q = q.eq('mes', f.mes);
  if (f.semanaInicio) q = q.eq('semana_inicio', f.semanaInicio);
  const { data, error } = await q.order('semana_inicio', { ascending: true });
  if (error) throw new Error(`Erro ao buscar metas semanais: ${error.message}`);
  return ((data || []) as any[]).map((r) => ({
    id: r.id,
    tipo: r.tipo,
    codReferencia: r.cod_referencia,
    nomeReferencia: r.nome_referencia,
    codEmpresa: r.cod_empresa,
    ano: r.ano,
    mes: r.mes,
    semanaInicio: r.semana_inicio,
    semanaFim: r.semana_fim,
    metaValor: Number(r.meta_valor) || 0,
    diasUteis: r.dias_uteis ?? 0,
    origem: r.origem,
  }));
}

/**
 * Meta DERIVADA do vendedor para uma loja/semana: usa a linha LOJA + parâmetros
 * de divisao_semanal (fallback: num_vendedores da lojas_configuracao, 100%).
 * Se existir linha VENDEDOR AJUSTADA para o cod_vendedor, ela tem precedência.
 */
export async function getMetaVendedorSemana(
  codEmpresa: number,
  semanaInicio: string,
  codVendedor?: number
): Promise<{ metaDerivada: number; divisao: DivisaoSemanal; ajustada?: number }> {
  const [metasLoja, divisao] = await Promise.all([
    getMetasSemanais({ tipo: 'LOJA', codEmpresa, semanaInicio }),
    getDivisaoSemanal(codEmpresa, semanaInicio),
  ]);
  const metaLoja = metasLoja[0]?.metaValor ?? 0;
  const metaDerivada = derivarMetaVendedor(
    metaLoja,
    divisao.percentualDivisao,
    divisao.numVendedores
  );

  let ajustada: number | undefined;
  if (codVendedor != null) {
    const { data } = await (supabase as any)
      .from('metas_semanais')
      .select('meta_valor, origem')
      .eq('tipo', 'VENDEDOR')
      .eq('cod_referencia', codVendedor)
      .eq('semana_inicio', semanaInicio)
      .maybeSingle();
    if (data && data.origem === 'AJUSTADA') ajustada = Number(data.meta_valor) || 0;
  }
  return { metaDerivada, divisao, ajustada };
}

// ==================== DIVISÃO SEMANAL ====================

export async function getDivisaoSemanal(
  codEmpresa: number,
  semanaInicio: string
): Promise<DivisaoSemanal> {
  const { data } = await (supabase as any)
    .from('divisao_semanal')
    .select('*')
    .eq('cod_empresa', codEmpresa)
    .eq('semana_inicio', semanaInicio)
    .maybeSingle();
  if (data) {
    return {
      codEmpresa,
      semanaInicio,
      percentualDivisao: Number(data.percentual_divisao) || 100,
      numVendedores: data.num_vendedores || 1,
    };
  }
  // fallback: configuração fixa da loja
  const config = await getLojaConfiguracao(codEmpresa);
  return {
    codEmpresa,
    semanaInicio,
    percentualDivisao: 100,
    numVendedores: config?.numVendedores ?? 1,
  };
}

/**
 * Edição EM MASSA dos parâmetros de divisão: aplica os valores informados a
 * todas as combinações loja × semana. Campos undefined mantêm o valor vigente
 * (ou o fallback da configuração da loja).
 */
export async function upsertDivisaoEmMassa(
  codEmpresas: number[],
  semanasInicio: string[],
  params: { percentualDivisao?: number; numVendedores?: number }
): Promise<number> {
  const linhas: any[] = [];
  for (const codEmpresa of codEmpresas) {
    for (const semanaInicio of semanasInicio) {
      const atual = await getDivisaoSemanal(codEmpresa, semanaInicio);
      linhas.push({
        cod_empresa: codEmpresa,
        semana_inicio: semanaInicio,
        percentual_divisao: params.percentualDivisao ?? atual.percentualDivisao,
        num_vendedores: params.numVendedores ?? atual.numVendedores,
        atualizado_em: new Date().toISOString(),
      });
    }
  }
  if (!linhas.length) return 0;
  const { error } = await (supabase as any)
    .from('divisao_semanal')
    .upsert(linhas, { onConflict: 'cod_empresa,semana_inicio' });
  if (error) throw new Error(`Erro na edição em massa da divisão: ${error.message}`);
  return linhas.length;
}

// ==================== SUGESTÃO (ANO ANTERIOR + 10%) ====================

/**
 * Sugestão de meta mensal da loja: realizado do MESMO período comercial do ano
 * anterior × 1,10. Fonte primária: recebimentos_agregado_diario (sem CREDITOS);
 * fallback (primeiro ano, sem histórico de recebimentos): vendas_agregado_diario
 * (sem créditos/devoluções).
 */
export async function sugerirMetaMensalLoja(
  codEmpresa: number,
  ano: number,
  mes: number
): Promise<{ sugestao: number; realizadoAnoAnterior: number; fonte: 'RECEBIMENTOS' | 'VENDAS' | 'SEM_HISTORICO' }> {
  const periodoAnterior = await getMetaPeriodo(ano - 1, mes);
  const { dataInicio, dataFim } = getDatasDoPeriodo(ano - 1, mes, periodoAnterior);
  const ini = dataInicio.toISOString().split('T')[0];
  const fim = dataFim.toISOString().split('T')[0];

  // 1) recebimentos
  const recebimentos = await getRecebimentosAgregado({
    empresa: codEmpresa,
    dataInicio: ini,
    dataFim: fim,
  });
  const totalRecebido = recebimentos
    .filter((r) => r.formaCategoria !== 'CREDITOS')
    .reduce((s, r) => s + r.valorRecebido, 0);
  if (totalRecebido > 0) {
    return {
      sugestao: sugerirMetaMensal(totalRecebido),
      realizadoAnoAnterior: Math.round(totalRecebido * 100) / 100,
      fonte: 'RECEBIMENTOS',
    };
  }

  // 2) fallback: vendas agregadas (cache existente)
  const { data, error } = await (supabase as any)
    .from('vendas_agregado_diario')
    .select('forma_pagamento, total_vendido')
    .eq('cod_empresa', codEmpresa)
    .gte('data', ini)
    .lte('data', fim);
  if (error) throw new Error(`Erro no fallback de vendas: ${error.message}`);
  const totalVendas = ((data || []) as any[])
    .filter((r) => !isCredito(r.forma_pagamento) && !isDevolucao(r.forma_pagamento))
    .reduce((s, r) => s + (Number(r.total_vendido) || 0), 0);
  if (totalVendas > 0) {
    return {
      sugestao: sugerirMetaMensal(totalVendas),
      realizadoAnoAnterior: Math.round(totalVendas * 100) / 100,
      fonte: 'VENDAS',
    };
  }
  return { sugestao: 0, realizadoAnoAnterior: 0, fonte: 'SEM_HISTORICO' };
}

// ==================== GRUPOS DE LOJAS ====================

export async function getGruposLojas(): Promise<GrupoLojas[]> {
  const [{ data: grupos, error: e1 }, { data: membros, error: e2 }] = await Promise.all([
    (supabase as any).from('grupos_lojas').select('*').order('cod_grupo'),
    (supabase as any).from('grupos_lojas_membros').select('*'),
  ]);
  if (e1) throw new Error(`Erro ao buscar grupos: ${e1.message}`);
  if (e2) throw new Error(`Erro ao buscar membros: ${e2.message}`);
  return ((grupos || []) as any[]).map((g) => ({
    codGrupo: g.cod_grupo,
    nome: g.nome,
    membros: ((membros || []) as any[])
      .filter((m) => m.cod_grupo === g.cod_grupo)
      .map((m) => m.cod_empresa),
  }));
}

export async function upsertGrupoLojas(
  nome: string,
  membros: number[],
  codGrupo?: number
): Promise<number> {
  let grupo = codGrupo;
  if (grupo == null) {
    const { data, error } = await (supabase as any)
      .from('grupos_lojas')
      .insert({ nome })
      .select('cod_grupo')
      .single();
    if (error) throw new Error(`Erro ao criar grupo: ${error.message}`);
    grupo = data.cod_grupo;
  } else {
    const { error } = await (supabase as any)
      .from('grupos_lojas')
      .update({ nome, atualizado_em: new Date().toISOString() })
      .eq('cod_grupo', grupo);
    if (error) throw new Error(`Erro ao atualizar grupo: ${error.message}`);
    await (supabase as any).from('grupos_lojas_membros').delete().eq('cod_grupo', grupo);
  }
  if (membros.length) {
    const { error } = await (supabase as any)
      .from('grupos_lojas_membros')
      .insert(membros.map((cod_empresa) => ({ cod_grupo: grupo, cod_empresa })));
    if (error) throw new Error(`Erro ao gravar membros: ${error.message}`);
  }
  return grupo!;
}

export async function deleteGrupoLojas(codGrupo: number): Promise<void> {
  const { error } = await (supabase as any)
    .from('grupos_lojas')
    .delete()
    .eq('cod_grupo', codGrupo);
  if (error) throw new Error(`Erro ao excluir grupo: ${error.message}`);
}

// ==================== TAXAS E PRÊMIOS (MASTER) ====================

export async function getComissaoTaxas(): Promise<ComissaoTaxa[]> {
  const { data, error } = await (supabase as any)
    .from('comissao_taxas')
    .select('*')
    .order('forma_categoria');
  if (error) throw new Error(`Erro ao buscar taxas: ${error.message}`);
  return ((data || []) as any[]).map((r) => ({
    formaCategoria: r.forma_categoria,
    percentual: Number(r.percentual) || 0,
  }));
}

export async function upsertComissaoTaxa(taxa: ComissaoTaxa): Promise<void> {
  const { error } = await (supabase as any).from('comissao_taxas').upsert(
    {
      forma_categoria: taxa.formaCategoria,
      percentual: taxa.percentual,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'forma_categoria' }
  );
  if (error) throw new Error(`Erro ao salvar taxa: ${error.message}`);
}

export async function getPremiosConfig(): Promise<PremioConfig[]> {
  const { data, error } = await (supabase as any)
    .from('premios_config')
    .select('*')
    .order('tipo')
    .order('percentual_meta_min', { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Erro ao buscar prêmios: ${error.message}`);
  return ((data || []) as any[]).map((r) => ({
    id: r.id,
    tipo: r.tipo,
    percentualMetaMin: r.percentual_meta_min != null ? Number(r.percentual_meta_min) : null,
    percentualPremio: Number(r.percentual_premio) || 0,
    semanasConsecutivas: r.semanas_consecutivas,
    ativo: r.ativo,
    tipoValor: (r.tipo_valor ?? 'PERCENTUAL') as 'PERCENTUAL' | 'FIXO',
    valorFixo: Number(r.valor_fixo) || 0,
  }));
}

export async function upsertPremioConfig(premio: PremioConfig): Promise<void> {
  const payload = {
    tipo: premio.tipo,
    percentual_meta_min: premio.percentualMetaMin,
    percentual_premio: premio.percentualPremio,
    semanas_consecutivas: premio.semanasConsecutivas,
    ativo: premio.ativo,
    tipo_valor: premio.tipoValor ?? 'PERCENTUAL',
    valor_fixo: premio.valorFixo ?? 0,
    atualizado_em: new Date().toISOString(),
  };
  const q = premio.id
    ? (supabase as any).from('premios_config').update(payload).eq('id', premio.id)
    : (supabase as any).from('premios_config').insert(payload);
  const { error } = await q;
  if (error) throw new Error(`Erro ao salvar prêmio: ${error.message}`);
}

export async function deletePremioConfig(id: string): Promise<void> {
  const { error } = await (supabase as any).from('premios_config').delete().eq('id', id);
  if (error) throw new Error(`Erro ao excluir prêmio: ${error.message}`);
}
