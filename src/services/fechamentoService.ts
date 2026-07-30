// src/services/fechamentoService.ts
// Fase 4 — prévia e fechamento semanal de comissões (docs/REVISAO_VENDAS_METAS
// §5.3 itens 5-6 e §5.4 item 3).
//
// Fluxo: gerarPrevia (busca detalhe no bridge + taxas/prêmios/metas e roda o
// motor puro) → fecharSemana (congela snapshot em fechamentos_comissao) →
// exportar/integrar (edge rh-fechamentos). Fechado é imutável; reabertura só
// admin (status REABERTO permite re-fechar, com log).
//
// Modo RECEBIDO (padrão): parcelas PAGAS na semana (bridge /vendas/recebimentos),
// comissão por categoria de pagamento. Modo EMITIDO (escolha do gestor): vendas
// emitidas na semana (bridge /vendas/emitidos) — sem forma de pagamento, usa a
// taxa da categoria especial 'EMITIDO' de comissao_taxas (se não configurada,
// 0% — o master define).

import { supabase } from '@/integrations/supabase/client';
import { apiGet } from './firebirdBridge';
import {
  calcularFechamento,
  type LinhaRecebimento,
  type ResultadoVendedor,
  type FaixaPremio,
  type SequenciaPremio,
} from '@/lib/comissoes/motorComissao';
import {
  getMetasSemanais,
  getDivisaoSemanal,
  getComissaoTaxas,
  getPremiosConfig,
  getSemanaCortes,
  getGruposLojas,
} from './metasSemanaisService';
import { derivarMetaVendedor } from '@/lib/metas/metasSemanais';
import { getRecebimentosAgregado } from './recebimentosService';
import { lojasEquivalentesParam } from '@/lib/metas/lojas';

export type ModoFechamento = 'RECEBIDO' | 'EMITIDO';

export interface PreviaFechamento {
  codEmpresa: number;
  nomeEmpresa: string | null;
  ano: number;
  mes: number;
  semanaInicio: string;
  semanaFim: string;
  modo: ModoFechamento;
  taxas: Record<string, number>;
  faixas: FaixaPremio[];
  sequencia: SequenciaPremio | null;
  vendedores: ResultadoVendedor[];
  totais: { base: number; restituicoes: number; comissao: number; premio: number; pagar: number };
  avisos: string[];
}

export interface FechamentoResumo {
  id: string;
  codEmpresa: number;
  nomeEmpresa: string | null;
  semanaInicio: string;
  semanaFim: string;
  modo: ModoFechamento;
  status: 'FECHADO' | 'REABERTO';
  criadoEm: string;
  totalPagar: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- metas derivadas por vendedor (mesma regra do acompanhamento) ----------
async function metasVendedoresDaSemana(
  codEmpresa: number,
  semanaInicio: string
): Promise<{ padrao: number; ajustadas: Map<number, number>; metaLoja: number }> {
  const [metasLoja, divisao, metasVend] = await Promise.all([
    getMetasSemanais({ tipo: 'LOJA', codEmpresa, semanaInicio }),
    getDivisaoSemanal(codEmpresa, semanaInicio),
    getMetasSemanais({ tipo: 'VENDEDOR', semanaInicio }),
  ]);
  const metaLoja = metasLoja[0]?.metaValor ?? 0;
  const padrao = derivarMetaVendedor(metaLoja, divisao.percentualDivisao, divisao.numVendedores);
  const ajustadas = new Map<number, number>();
  metasVend
    .filter((m) => m.origem === 'AJUSTADA')
    .forEach((m) => ajustadas.set(m.codReferencia, m.metaValor));
  return { padrao, ajustadas, metaLoja };
}

// ---------- semanas consecutivas atingidas antes (prêmio SEQUENCIA) ----------
async function semanasAtingidasAntes(
  codEmpresa: number,
  ano: number,
  mes: number,
  semanaInicio: string
): Promise<Map<number, number>> {
  const cortes = (await getMetasSemanais({ tipo: 'LOJA', codEmpresa, ano, mes }))
    .filter((m) => m.semanaInicio < semanaInicio)
    .sort((a, b) => a.semanaInicio.localeCompare(b.semanaInicio));
  const resultado = new Map<number, number>();
  // percorre da mais recente para trás, contando consecutivas atingidas
  const porSemana: Map<string, Map<number, boolean>> = new Map();
  for (const corte of cortes) {
    const { padrao, ajustadas } = await metasVendedoresDaSemana(codEmpresa, corte.semanaInicio);
    const recebimentos = await getRecebimentosAgregado({
      empresa: lojasEquivalentesParam(codEmpresa),
      dataInicio: corte.semanaInicio,
      dataFim: corte.semanaFim,
    });
    const porVendedor = new Map<number, number>();
    recebimentos
      .filter((r) => r.formaCategoria !== 'CREDITOS')
      .forEach((r) =>
        porVendedor.set(r.codVendedor, (porVendedor.get(r.codVendedor) ?? 0) + r.valorRecebido)
      );
    const atingiu = new Map<number, boolean>();
    porVendedor.forEach((realizado, cod) => {
      const meta = ajustadas.get(cod) ?? padrao;
      atingiu.set(cod, meta > 0 && realizado >= meta);
    });
    porSemana.set(corte.semanaInicio, atingiu);
  }
  const semanasOrd = cortes.map((c) => c.semanaInicio); // asc
  const vendedores = new Set<number>();
  porSemana.forEach((m) => m.forEach((_, cod) => vendedores.add(cod)));
  vendedores.forEach((cod) => {
    let consecutivas = 0;
    for (let i = semanasOrd.length - 1; i >= 0; i--) {
      if (porSemana.get(semanasOrd[i])?.get(cod)) consecutivas++;
      else break;
    }
    resultado.set(cod, consecutivas);
  });
  return resultado;
}

// ---------- prévia ----------
export async function gerarPrevia(
  codEmpresa: number,
  nomeEmpresa: string | null,
  ano: number,
  mes: number,
  semanaInicio: string,
  semanaFim: string,
  modo: ModoFechamento
): Promise<PreviaFechamento> {
  const avisos: string[] = [];

  // 1) linhas do bridge (regime conforme o modo)
  let linhas: LinhaRecebimento[] = [];
  if (modo === 'RECEBIDO') {
    const rows = await apiGet<any>('/vendas/recebimentos', {
      empresa: codEmpresa,
      dataInicio: semanaInicio,
      dataFim: semanaFim,
      cache: 0,
    }, { timeoutMs: 60000 });
    linhas = rows.map((r: any) => ({
      codVendedor: Number(r.cod_vendedor) || 0,
      vendedorNome: (r.vendedor_nome ?? '').trim() || null,
      codTransacao: Number(r.cod_transacao),
      osList: (() => { const v = (r.os_list ?? '').toString().trim(); return v && v !== 'SEM_OS' ? v : null; })(),
      dataEmissao: String(r.dataemissao ?? '').slice(0, 10),
      dataPagamento: String(r.data_pagamento ?? '').slice(0, 10),
      formaCategoria: String(r.forma_categoria ?? 'OUTROS').trim(),
      origem: String(r.origem ?? 'VENDA_PERIODO').trim(),
      valor: Number(r.valor_recebido) || 0,
    }));
  } else {
    const rows = await apiGet<any>('/vendas/emitidos', {
      empresa: codEmpresa,
      dataInicio: semanaInicio,
      dataFim: semanaFim,
      cache: 0,
    }, { timeoutMs: 60000 });
    linhas = rows.map((r: any) => ({
      codVendedor: Number(r.cod_vendedor) || 0,
      vendedorNome: (r.vendedor_nome ?? '').trim() || null,
      codTransacao: Number(r.cod_transacao),
      dataEmissao: String(r.dataemissao ?? '').slice(0, 10),
      dataPagamento: String(r.dataemissao ?? '').slice(0, 10),
      formaCategoria: 'EMITIDO',
      origem: 'VENDA_PERIODO',
      valor: Number(r.valor_emitido) || 0,
    }));
    avisos.push(
      'Modo EMITIDO: comissão pela taxa da categoria EMITIDO (configuração do master). Sem detalhamento por forma de pagamento.'
    );
  }

  // 2) restituições da semana
  let restituicoes: { codVendedor: number; valor: number }[] = [];
  try {
    const rows = await apiGet<any>('/vendas/devolucoes-restituicao', {
      empresa: codEmpresa,
      dataInicio: semanaInicio,
      dataFim: semanaFim,
      cache: 0,
    }, { timeoutMs: 60000 });
    restituicoes = rows.map((r: any) => ({
      codVendedor: Number(r.cod_vendedor) || 0,
      valor: Number(r.valor_restituido) || 0,
    }));
  } catch {
    avisos.push('Não foi possível consultar devoluções com restituição — fechamento sem abatimentos.');
  }

  // 3) configuração vigente (congelada no snapshot ao fechar)
  const [taxasList, premios, metas] = await Promise.all([
    getComissaoTaxas(),
    getPremiosConfig(),
    metasVendedoresDaSemana(codEmpresa, semanaInicio),
  ]);
  const taxas: Record<string, number> = {};
  taxasList.forEach((t) => { taxas[t.formaCategoria] = t.percentual; });
  if (modo === 'EMITIDO' && taxas['EMITIDO'] == null) {
    avisos.push("Categoria 'EMITIDO' sem taxa em Comissões & Prêmios — comissão ficará 0%.");
  }
  const faixas: FaixaPremio[] = premios
    .filter((p) => p.ativo && p.tipo === 'FAIXA' && p.percentualMetaMin != null)
    .map((p) => ({
      percentualMetaMin: p.percentualMetaMin!,
      percentualPremio: p.percentualPremio,
      tipoValor: p.tipoValor,
      valorFixo: p.valorFixo,
    }));
  const seqCfg = premios.find((p) => p.ativo && p.tipo === 'SEQUENCIA' && p.semanasConsecutivas);
  const sequencia: SequenciaPremio | null = seqCfg
    ? {
        semanasConsecutivas: seqCfg.semanasConsecutivas!,
        percentualPremio: seqCfg.percentualPremio,
        tipoValor: seqCfg.tipoValor,
        valorFixo: seqCfg.valorFixo,
      }
    : null;

  // metas por vendedor presentes nas linhas
  const metasPorVendedor = new Map<number, number>();
  new Set(linhas.map((l) => l.codVendedor)).forEach((cod) => {
    metasPorVendedor.set(cod, metas.ajustadas.get(cod) ?? metas.padrao);
  });
  if (metas.metaLoja === 0) {
    avisos.push('Loja sem meta semanal gerada para esta semana — % de meta ficará 0.');
  }

  const atingidasAntes = sequencia
    ? await semanasAtingidasAntes(codEmpresa, ano, mes, semanaInicio)
    : new Map<number, number>();

  // 4) motor puro
  const vendedores = calcularFechamento({
    linhas,
    taxas,
    metasPorVendedor,
    restituicoes,
    faixasAtivas: faixas,
    sequenciaAtiva: sequencia,
    semanasAtingidasAntes: atingidasAntes,
  });

  // 5) transparência do período (modo RECEBIDO): emitido em OS no período e
  // saldo que ficou a receber = emitido − recebido no ato (vendaPeriodo).
  if (modo === 'RECEBIDO') {
    try {
      const emitidosRows = await apiGet<any>('/vendas/emitidos', {
        empresa: codEmpresa,
        dataInicio: semanaInicio,
        dataFim: semanaFim,
        cache: 0,
      }, { timeoutMs: 60000 });
      const emitidoPorVendedor = new Map<number, number>();
      emitidosRows.forEach((r: any) => {
        const cod = Number(r.cod_vendedor) || 0;
        emitidoPorVendedor.set(cod, (emitidoPorVendedor.get(cod) ?? 0) + (Number(r.valor_emitido) || 0));
      });
      // vendedores que emitiram mas nada receberam ainda também aparecem
      emitidoPorVendedor.forEach((_, cod) => {
        if (!vendedores.some((v) => v.codVendedor === cod)) {
          const nome = (emitidosRows.find((r: any) => (Number(r.cod_vendedor) || 0) === cod)?.vendedor_nome ?? '').trim() || null;
          vendedores.push({
            codVendedor: cod,
            vendedorNome: nome,
            metaSemana: metas.ajustadas.get(cod) ?? metas.padrao,
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
          });
        }
      });
      vendedores.forEach((v) => {
        const emitido = round2(emitidoPorVendedor.get(v.codVendedor) ?? 0);
        v.basePorOrigem.vendasEmitidas = emitido;
        v.basePorOrigem.saldoAReceber = round2(Math.max(0, emitido - v.basePorOrigem.vendaPeriodo));
      });
    } catch {
      avisos.push('Não foi possível consultar o emitido do período — colunas de saldo a receber ficarão vazias.');
    }
  }

  // 6) comissões de GESTÃO: gerente = % sobre a base recebida da loja;
  // supervisor = % sobre a base da loja (somando as lojas do grupo no mês, o
  // resultado equivale ao % sobre o grupo). Linhas com código sentinela
  // negativo (-<loja>1 gerente, -<loja>2 supervisor) para não colidir com
  // vendedores e não se fundirem entre lojas na visão por vendedor.
  const baseLoja = round2(vendedores.reduce((s, v) => s + v.baseTotal, 0));
  const linhaGestao = (
    codigo: number,
    nome: string,
    taxa: number
  ): ResultadoVendedor => ({
    codVendedor: codigo,
    vendedorNome: nome,
    metaSemana: metas.metaLoja,
    percentualMeta: metas.metaLoja > 0 ? round2((baseLoja / metas.metaLoja) * 100) : 0,
    basePorCategoria: {},
    basePorOrigem: { vendaPeriodo: 0, saldoAnterior: 0 },
    baseTotal: baseLoja,
    restituicoes: 0,
    comissao: round2((baseLoja * taxa) / 100),
    premioFaixa: null,
    premioSequencia: null,
    premioValor: 0,
    totalPagar: round2((baseLoja * taxa) / 100),
    detalhe: [],
  });
  const taxaGerente = taxas['GERENTE'] ?? 0;
  if (taxaGerente > 0 && baseLoja > 0) {
    vendedores.push(linhaGestao(-(codEmpresa * 10 + 1), `GERENTE — ${nomeEmpresa ?? `Loja ${codEmpresa}`}`, taxaGerente));
  }
  const taxaSupervisor = taxas['SUPERVISOR'] ?? 0;
  if (taxaSupervisor > 0 && baseLoja > 0) {
    try {
      const grupos = await getGruposLojas();
      const grupo = grupos.find((g) => g.membros.includes(codEmpresa));
      if (grupo) {
        vendedores.push(
          linhaGestao(-(codEmpresa * 10 + 2), `SUPERVISOR — ${grupo.nome} (parcela ${nomeEmpresa ?? codEmpresa})`, taxaSupervisor)
        );
      }
    } catch {
      avisos.push('Não foi possível verificar grupos de lojas para a comissão de supervisor.');
    }
  }
  const totais = vendedores.reduce(
    (acc, v) => ({
      base: round2(acc.base + v.baseTotal),
      restituicoes: round2(acc.restituicoes + v.restituicoes),
      comissao: round2(acc.comissao + v.comissao),
      premio: round2(acc.premio + v.premioValor),
      pagar: round2(acc.pagar + v.totalPagar),
    }),
    { base: 0, restituicoes: 0, comissao: 0, premio: 0, pagar: 0 }
  );

  return {
    codEmpresa, nomeEmpresa, ano, mes, semanaInicio, semanaFim, modo,
    taxas, faixas, sequencia, vendedores, totais, avisos,
  };
}

// ---------- fechar / listar / reabrir ----------
export async function fecharSemana(previa: PreviaFechamento): Promise<string> {
  // fechamento vigente?
  const { data: existente } = await (supabase as any)
    .from('fechamentos_comissao')
    .select('id, status')
    .eq('cod_empresa', previa.codEmpresa)
    .eq('semana_inicio', previa.semanaInicio)
    .maybeSingle();
  if (existente && existente.status === 'FECHADO') {
    throw new Error('Semana já fechada para esta loja. Reabra (admin) antes de refazer.');
  }
  if (existente) {
    // REABERTO: substitui
    const { error: errDel } = await (supabase as any)
      .from('fechamentos_comissao')
      .delete()
      .eq('id', existente.id);
    if (errDel) throw new Error(`Erro ao substituir fechamento reaberto: ${errDel.message}`);
  }

  const { data: userData } = await supabase.auth.getUser();
  const { data: header, error } = await (supabase as any)
    .from('fechamentos_comissao')
    .insert({
      cod_empresa: previa.codEmpresa,
      nome_empresa: previa.nomeEmpresa,
      ano: previa.ano,
      mes: previa.mes,
      semana_inicio: previa.semanaInicio,
      semana_fim: previa.semanaFim,
      modo: previa.modo,
      status: 'FECHADO',
      taxas_aplicadas: previa.taxas,
      premios_aplicados: { faixas: previa.faixas, sequencia: previa.sequencia },
      total_base: previa.totais.base,
      total_restituicoes: previa.totais.restituicoes,
      total_comissao: previa.totais.comissao,
      total_premio: previa.totais.premio,
      total_pagar: previa.totais.pagar,
      criado_por: userData?.user?.id ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Erro ao fechar semana: ${error.message}`);

  const itens = previa.vendedores.map((v) => ({
    fechamento_id: header.id,
    cod_vendedor: v.codVendedor,
    vendedor_nome: v.vendedorNome,
    meta_semana: v.metaSemana,
    percentual_meta: v.percentualMeta,
    base_por_categoria: v.basePorCategoria,
    base_por_origem: v.basePorOrigem,
    base_total: v.baseTotal,
    restituicoes: v.restituicoes,
    comissao: v.comissao,
    premio_faixa: v.premioFaixa,
    premio_sequencia: v.premioSequencia,
    premio_valor: v.premioValor,
    total_pagar: v.totalPagar,
    detalhe: v.detalhe,
  }));
  if (itens.length) {
    const { error: errItens } = await (supabase as any)
      .from('fechamentos_comissao_itens')
      .insert(itens);
    if (errItens) throw new Error(`Erro ao gravar itens do fechamento: ${errItens.message}`);
  }
  return header.id as string;
}

export async function listarFechamentos(filtros?: {
  ano?: number;
  mes?: number;
}): Promise<FechamentoResumo[]> {
  let q = (supabase as any)
    .from('fechamentos_comissao')
    .select('id, cod_empresa, nome_empresa, semana_inicio, semana_fim, modo, status, criado_em, total_pagar')
    .order('semana_inicio', { ascending: false })
    .order('cod_empresa');
  if (filtros?.ano) q = q.eq('ano', filtros.ano);
  if (filtros?.mes) q = q.eq('mes', filtros.mes);
  const { data, error } = await q.limit(200);
  if (error) throw new Error(`Erro ao listar fechamentos: ${error.message}`);
  return ((data || []) as any[]).map((f) => ({
    id: f.id,
    codEmpresa: f.cod_empresa,
    nomeEmpresa: f.nome_empresa,
    semanaInicio: f.semana_inicio,
    semanaFim: f.semana_fim,
    modo: f.modo,
    status: f.status,
    criadoEm: f.criado_em,
    totalPagar: Number(f.total_pagar) || 0,
  }));
}

export async function getFechamentoItens(fechamentoId: string): Promise<ResultadoVendedor[]> {
  const { data, error } = await (supabase as any)
    .from('fechamentos_comissao_itens')
    .select('*')
    .eq('fechamento_id', fechamentoId)
    .order('base_total', { ascending: false });
  if (error) throw new Error(`Erro ao ler itens: ${error.message}`);
  return ((data || []) as any[]).map((i) => ({
    codVendedor: i.cod_vendedor,
    vendedorNome: i.vendedor_nome,
    metaSemana: Number(i.meta_semana) || 0,
    percentualMeta: Number(i.percentual_meta) || 0,
    basePorCategoria: i.base_por_categoria ?? {},
    basePorOrigem: i.base_por_origem ?? { vendaPeriodo: 0, saldoAnterior: 0 },
    baseTotal: Number(i.base_total) || 0,
    restituicoes: Number(i.restituicoes) || 0,
    comissao: Number(i.comissao) || 0,
    premioFaixa: i.premio_faixa,
    premioSequencia: i.premio_sequencia,
    premioValor: Number(i.premio_valor) || 0,
    totalPagar: Number(i.total_pagar) || 0,
    detalhe: i.detalhe ?? [],
  }));
}

/** Reabertura (admin, com log) — permite refazer o fechamento. */
export async function reabrirFechamento(fechamentoId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await (supabase as any)
    .from('fechamentos_comissao')
    .update({
      status: 'REABERTO',
      reaberto_por: userData?.user?.id ?? null,
      reaberto_em: new Date().toISOString(),
    })
    .eq('id', fechamentoId);
  if (error) throw new Error(`Erro ao reabrir: ${error.message}`);
}

export interface SaldoAberto {
  codVendedor: number;
  vendedorNome: string | null;
  codTransacao: number;
  osList: string | null;
  dataEmissao: string;
  dataVencimento: string | null;
  formaCategoria: string;
  valorAberto: number;
}

/**
 * Saldos a receber EM ABERTO de vendas emitidas no período (formas com
 * inadimplência; cartões de verdade ficam fora — comissionam no
 * processamento). O saldo ainda não tem forma definida: a comissão assume a
 * forma do pagamento quando ele acontecer.
 */
export async function getSaldosAbertos(
  codEmpresa: number,
  dataInicio: string,
  dataFim: string
): Promise<SaldoAberto[]> {
  const rows = await apiGet<any>('/vendas/saldos-aberto', {
    empresa: codEmpresa,
    dataInicio,
    dataFim,
    cache: 0,
  }, { timeoutMs: 60000 });
  return rows.map((r: any) => ({
    codVendedor: Number(r.cod_vendedor) || 0,
    vendedorNome: (r.vendedor_nome ?? '').trim() || null,
    codTransacao: Number(r.cod_transacao),
    osList: (() => { const v = (r.os_list ?? '').toString().trim(); return v && v !== 'SEM_OS' ? v : null; })(),
    dataEmissao: String(r.dataemissao ?? '').slice(0, 10),
    dataVencimento: r.data_vencimento ? String(r.data_vencimento).slice(0, 10) : null,
    formaCategoria: String(r.forma_categoria ?? 'OUTROS').trim(),
    valorAberto: Number(r.valor_aberto) || 0,
  }));
}

/** Semanas do mês (cortes ou metas geradas) para o seletor da tela. */
export async function semanasDoMes(
  ano: number,
  mes: number
): Promise<{ semanaInicio: string; semanaFim: string }[]> {
  const cortes = await getSemanaCortes(ano, mes);
  if (cortes.length) return cortes.map((c) => ({ semanaInicio: c.semanaInicio, semanaFim: c.semanaFim }));
  const metas = await getMetasSemanais({ tipo: 'LOJA', ano, mes });
  const vistas = new Map<string, string>();
  metas.forEach((m) => vistas.set(m.semanaInicio, m.semanaFim));
  return Array.from(vistas.entries())
    .map(([semanaInicio, semanaFim]) => ({ semanaInicio, semanaFim }))
    .sort((a, b) => a.semanaInicio.localeCompare(b.semanaInicio));
}
