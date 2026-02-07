// src/services/osHubService.ts
// Service para OS Hub de Receitas - busca do Firebird e cache no Supabase

import { apiGet, EmpresaParam, formatEmpresaParam } from './firebirdBridge';
import { supabase } from '@/integrations/supabase/client';

// ============================================
// INTERFACES
// ============================================

interface OsHubRaw {
  cod_os?: number;
  numero_os?: string;
  os?: string;
  empresa?: string;
  codempresa?: number;
  cod_empresa?: number;
  cod_empresa_origem?: number;
  codcliente?: number;
  cliente?: string;
  cod_cliente?: number;
  telefone?: string;
  etapa?: string;
  status_atraso?: string;
  atraso_dias?: number;
  dataemissao?: string;
  data_emissao?: string;
  dataprevisao?: string;
  data_previsao?: string;
  datahoraentrada?: string;
  data_entrada?: string;
  datahorasaida?: string;
  data_saida?: string;
  total?: number;
  usuario?: string;
  // Receita OD
  od_longe_esf?: number;
  od_longe_cil?: number;
  od_longe_eixo?: number;
  od_perto_esf?: number;
  od_perto_cil?: number;
  od_perto_eixo?: number;
  od_adicao?: number;
  od_dnp?: number;
  od_dp?: number;
  od_altura?: number;
  od_alt?: number;
  // Receita OE
  oe_longe_esf?: number;
  oe_longe_cil?: number;
  oe_longe_eixo?: number;
  oe_perto_esf?: number;
  oe_perto_cil?: number;
  oe_perto_eixo?: number;
  oe_adicao?: number;
  oe_dnp?: number;
  oe_dp?: number;
  oe_altura?: number;
  oe_alt?: number;
  // Medidas gerais
  dp?: number;
  perto_dp?: number;
  distancia_leitura?: number;
  distancia_progressao?: number;
  distancia_vertice?: number;
  // Armação
  ponte?: number;
  aa_vertical?: number;
  ca_horizontal?: number;
  diametro?: number;
  ta?: number;
  md?: number;
  he?: number;
  st?: number;
  // Prismas
  prisma?: string;
  prismaangulo?: number;
  prismaeixo?: number;
  prisma1?: string;
  prisma1angulo?: number;
  prisma1eixo?: number;
  // Imagens
  imagem_receita?: string;
  url_imagem_receita?: string;
  imagem_armacao?: string;
  url_imagem_armacao?: string;
  imagem_tracer?: string;
  arquivo_tracer?: string;
  // Observações
  observacao_os?: string;
  observacao_lente?: string;
  observacao_pendencia?: string;
  observacao_receita?: string;
}

export interface OsHubRecord {
  codOs: number;
  numeroOs: string;
  empresa: string;
  codEmpresa: number;
  cliente: string;
  codCliente: number | null;
  telefone: string | null;
  etapa: string;
  statusAtraso: string;
  atrasoDias: number;
  dataEmissao: string | null;
  dataPrevisao: string | null;
  dataEntrada: string | null;
  dataSaida: string | null;
  total: number;
  usuario: string;
  // Receita OD
  odLongeEsf: number | null;
  odLongeCil: number | null;
  odLongeEixo: number | null;
  odPertoEsf: number | null;
  odPertoCil: number | null;
  odPertoEixo: number | null;
  odAdicao: number | null;
  odDnp: number | null;
  odAltura: number | null;
  // Receita OE
  oeLongeEsf: number | null;
  oeLongeCil: number | null;
  oeLongeEixo: number | null;
  oePertoEsf: number | null;
  oePertoCil: number | null;
  oePertoEixo: number | null;
  oeAdicao: number | null;
  oeDnp: number | null;
  oeAltura: number | null;
  // Medidas gerais
  dp: number | null;
  pertoDp: number | null;
  distanciaLeitura: number | null;
  distanciaProgressao: number | null;
  distanciaVertice: number | null;
  // Armação
  ponte: number | null;
  aaVertical: number | null;
  caHorizontal: number | null;
  diametro: number | null;
  ta: number | null;
  md: number | null;
  he: number | null;
  st: number | null;
  // Prismas
  prisma: string | null;
  prismaAngulo: number | null;
  prismaEixo: number | null;
  prisma1: string | null;
  prisma1Angulo: number | null;
  prisma1Eixo: number | null;
  // Imagens
  imagemReceita: string | null;
  urlImagemReceita: string | null;
  imagemArmacao: string | null;
  urlImagemArmacao: string | null;
  imagemTracer: string | null;
  arquivoTracer: string | null;
  // Observações
  observacaoOs: string | null;
  observacaoLente: string | null;
  observacaoPendencia: string | null;
  observacaoReceita: string | null;
  // Flags
  temReceita: boolean;
  temImagem: boolean;
  // Cache
  cacheLoadedAt?: string;
}

export interface GetOsHubParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  os?: number | string;
}

// ============================================
// MAPPER
// ============================================

function mapRawToRecord(r: OsHubRaw): OsHubRecord {
  const hasReceita = !!(
    r.od_longe_esf || r.od_longe_cil || r.od_perto_esf ||
    r.oe_longe_esf || r.oe_longe_cil || r.oe_perto_esf ||
    r.od_adicao || r.oe_adicao
  );
  const hasImagem = !!(r.url_imagem_receita || r.url_imagem_armacao || r.imagem_tracer || r.arquivo_tracer);

  return {
    codOs: r.cod_os ?? 0,
    numeroOs: String(r.numero_os ?? r.os ?? ''),
    empresa: (r.empresa ?? '').trim(),
    codEmpresa: r.codempresa ?? r.cod_empresa ?? r.cod_empresa_origem ?? 0,
    cliente: (r.cliente ?? '').trim(),
    codCliente: r.cod_cliente ?? r.codcliente ?? null,
    telefone: r.telefone?.trim() ?? null,
    etapa: (r.etapa ?? '').trim(),
    statusAtraso: (r.status_atraso ?? 'SEM_DATA').trim().toUpperCase(),
    atrasoDias: r.atraso_dias ?? 0,
    dataEmissao: r.dataemissao ?? r.data_emissao ?? null,
    dataPrevisao: r.dataprevisao ?? r.data_previsao ?? null,
    dataEntrada: r.datahoraentrada ?? r.data_entrada ?? null,
    dataSaida: r.datahorasaida ?? r.data_saida ?? null,
    total: r.total ?? 0,
    usuario: (r.usuario ?? '').trim(),
    odLongeEsf: r.od_longe_esf ?? null,
    odLongeCil: r.od_longe_cil ?? null,
    odLongeEixo: r.od_longe_eixo ?? null,
    odPertoEsf: r.od_perto_esf ?? null,
    odPertoCil: r.od_perto_cil ?? null,
    odPertoEixo: r.od_perto_eixo ?? null,
    odAdicao: r.od_adicao ?? null,
    odDnp: r.od_dnp ?? r.od_dp ?? null,
    odAltura: r.od_altura ?? r.od_alt ?? null,
    oeLongeEsf: r.oe_longe_esf ?? null,
    oeLongeCil: r.oe_longe_cil ?? null,
    oeLongeEixo: r.oe_longe_eixo ?? null,
    oePertoEsf: r.oe_perto_esf ?? null,
    oePertoCil: r.oe_perto_cil ?? null,
    oePertoEixo: r.oe_perto_eixo ?? null,
    oeAdicao: r.oe_adicao ?? null,
    oeDnp: r.oe_dnp ?? r.oe_dp ?? null,
    oeAltura: r.oe_altura ?? r.oe_alt ?? null,
    // Medidas gerais
    dp: r.dp ?? null,
    pertoDp: r.perto_dp ?? null,
    distanciaLeitura: r.distancia_leitura ?? null,
    distanciaProgressao: r.distancia_progressao ?? null,
    distanciaVertice: r.distancia_vertice ?? null,
    // Armação
    ponte: r.ponte ?? null,
    aaVertical: r.aa_vertical ?? null,
    caHorizontal: r.ca_horizontal ?? null,
    diametro: r.diametro ?? null,
    ta: r.ta ?? null,
    md: r.md ?? null,
    he: r.he ?? null,
    st: r.st ?? null,
    // Prismas completos
    prisma: r.prisma?.trim() ?? null,
    prismaAngulo: r.prismaangulo ?? null,
    prismaEixo: r.prismaeixo ?? null,
    prisma1: r.prisma1?.trim() ?? null,
    prisma1Angulo: r.prisma1angulo ?? null,
    prisma1Eixo: r.prisma1eixo ?? null,
    // Imagens
    imagemReceita: r.imagem_receita?.trim() ?? null,
    urlImagemReceita: r.url_imagem_receita?.trim() ?? null,
    imagemArmacao: r.imagem_armacao?.trim() ?? null,
    urlImagemArmacao: r.url_imagem_armacao?.trim() ?? null,
    imagemTracer: r.imagem_tracer?.trim() ?? null,
    arquivoTracer: r.arquivo_tracer?.trim() ?? null,
    // Observações
    observacaoOs: r.observacao_os?.trim() ?? null,
    observacaoLente: r.observacao_lente?.trim() ?? null,
    observacaoPendencia: r.observacao_pendencia?.trim() ?? null,
    observacaoReceita: r.observacao_receita?.trim() ?? null,
    temReceita: hasReceita,
    temImagem: hasImagem,
  };
}

// ============================================
// FETCH DO FIREBIRD
// ============================================

export async function fetchOsHubFromFirebird(params: GetOsHubParams): Promise<OsHubRecord[]> {
  const queryParams: Record<string, string | number | undefined> = {
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
  };

  if (params.empresa === 'ALL' || params.empresa === null) {
    queryParams.codEmpresa = 'ALL';
  } else {
    queryParams.codEmpresa = Number(params.empresa);
  }

  if (params.os) {
    queryParams.os = params.os;
  }

  console.log('[osHubService] Fetching from Firebird /os/hub-receitas:', queryParams);
  const raw = await apiGet<OsHubRaw>('/os/hub-receitas', queryParams, { timeoutMs: 120000 });
  console.log('[osHubService] Firebird returned:', raw.length, 'records');

  return raw.map(mapRawToRecord);
}

// ============================================
// FETCH SINGLE OS (on-demand recipe lookup)
// ============================================

export async function fetchSingleOsRecipe(codOs: number, codEmpresa?: number): Promise<OsHubRecord | null> {
  const empresaParam = codEmpresa && codEmpresa > 0 ? codEmpresa : 'ALL';
  const fallbackStart = new Date();
  fallbackStart.setMonth(fallbackStart.getMonth() - 2);

  const records = await fetchOsHubFromFirebird({
    empresa: empresaParam,
    dataInicio: fallbackStart.toISOString().slice(0, 10),
    dataFim: new Date().toISOString().slice(0, 10),
    os: codOs,
  });

  return records.find(r => r.codOs === codOs) ?? records[0] ?? null;
}

// ============================================
// CACHE (SUPABASE)
// ============================================

export async function saveToCache(records: OsHubRecord[]): Promise<void> {
  if (records.length === 0) return;

  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize).map(r => ({
      cod_os: r.codOs,
      numero_os: r.numeroOs,
      cod_empresa: r.codEmpresa,
      empresa: r.empresa,
      cliente: r.cliente,
      cod_cliente: r.codCliente,
      telefone: r.telefone,
      etapa: r.etapa,
      status_atraso: r.statusAtraso,
      atraso_dias: r.atrasoDias,
      data_emissao: r.dataEmissao,
      data_previsao: r.dataPrevisao,
      data_entrada: r.dataEntrada,
      data_saida: r.dataSaida,
      total: r.total,
      usuario: r.usuario,
      od_longe_esf: r.odLongeEsf,
      od_longe_cil: r.odLongeCil,
      od_longe_eixo: r.odLongeEixo,
      od_perto_esf: r.odPertoEsf,
      od_perto_cil: r.odPertoCil,
      od_perto_eixo: r.odPertoEixo,
      od_adicao: r.odAdicao,
      od_dnp: r.odDnp,
      od_altura: r.odAltura,
      oe_longe_esf: r.oeLongeEsf,
      oe_longe_cil: r.oeLongeCil,
      oe_longe_eixo: r.oeLongeEixo,
      oe_perto_esf: r.oePertoEsf,
      oe_perto_cil: r.oePertoCil,
      oe_perto_eixo: r.oePertoEixo,
      oe_adicao: r.oeAdicao,
      oe_dnp: r.oeDnp,
      oe_altura: r.oeAltura,
      prisma: r.prisma,
      prisma1: r.prisma1,
      imagem_receita: r.imagemReceita,
      url_imagem_receita: r.urlImagemReceita,
      imagem_armacao: r.imagemArmacao,
      url_imagem_armacao: r.urlImagemArmacao,
      imagem_tracer: r.imagemTracer,
      observacao_os: r.observacaoOs,
      observacao_lente: r.observacaoLente,
      observacao_pendencia: r.observacaoPendencia,
      tem_receita: r.temReceita,
      tem_imagem: r.temImagem,
      cache_loaded_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('os_hub_receitas')
      .upsert(batch, { onConflict: 'cod_os' });

    if (error) {
      console.error('[osHubService] Cache upsert error:', error.message);
    }
  }

  console.log('[osHubService] Cached', records.length, 'records to Supabase');
}

export async function loadFromCache(params: {
  codEmpresa?: number | string;
  dataInicio?: string;
  dataFim?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: OsHubRecord[]; count: number }> {
  let query = supabase
    .from('os_hub_receitas')
    .select('*', { count: 'exact' });

  if (params.codEmpresa && params.codEmpresa !== 'ALL') {
    query = query.eq('cod_empresa', Number(params.codEmpresa));
  }
  if (params.dataInicio) {
    query = query.gte('data_emissao', params.dataInicio);
  }
  if (params.dataFim) {
    query = query.lte('data_emissao', params.dataFim + 'T23:59:59');
  }

  query = query.order('data_emissao', { ascending: false });

  if (params.limit) {
    const offset = params.offset ?? 0;
    query = query.range(offset, offset + params.limit - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[osHubService] Cache load error:', error.message);
    return { data: [], count: 0 };
  }

  const mapped: OsHubRecord[] = (data ?? []).map((r: Record<string, unknown>) => ({
    codOs: r.cod_os as number,
    numeroOs: (r.numero_os as string) ?? '',
    empresa: (r.empresa as string) ?? '',
    codEmpresa: r.cod_empresa as number,
    cliente: (r.cliente as string) ?? '',
    codCliente: (r.cod_cliente as number) ?? null,
    telefone: (r.telefone as string) ?? null,
    etapa: (r.etapa as string) ?? '',
    statusAtraso: (r.status_atraso as string) ?? 'SEM_DATA',
    atrasoDias: (r.atraso_dias as number) ?? 0,
    dataEmissao: (r.data_emissao as string) ?? null,
    dataPrevisao: (r.data_previsao as string) ?? null,
    dataEntrada: (r.data_entrada as string) ?? null,
    dataSaida: (r.data_saida as string) ?? null,
    total: Number(r.total) || 0,
    usuario: (r.usuario as string) ?? '',
    odLongeEsf: r.od_longe_esf != null ? Number(r.od_longe_esf) : null,
    odLongeCil: r.od_longe_cil != null ? Number(r.od_longe_cil) : null,
    odLongeEixo: (r.od_longe_eixo as number) ?? null,
    odPertoEsf: r.od_perto_esf != null ? Number(r.od_perto_esf) : null,
    odPertoCil: r.od_perto_cil != null ? Number(r.od_perto_cil) : null,
    odPertoEixo: (r.od_perto_eixo as number) ?? null,
    odAdicao: r.od_adicao != null ? Number(r.od_adicao) : null,
    odDnp: r.od_dnp != null ? Number(r.od_dnp) : null,
    odAltura: r.od_altura != null ? Number(r.od_altura) : null,
    oeLongeEsf: r.oe_longe_esf != null ? Number(r.oe_longe_esf) : null,
    oeLongeCil: r.oe_longe_cil != null ? Number(r.oe_longe_cil) : null,
    oeLongeEixo: (r.oe_longe_eixo as number) ?? null,
    oePertoEsf: r.oe_perto_esf != null ? Number(r.oe_perto_esf) : null,
    oePertoCil: r.oe_perto_cil != null ? Number(r.oe_perto_cil) : null,
    oePertoEixo: (r.oe_perto_eixo as number) ?? null,
    oeAdicao: r.oe_adicao != null ? Number(r.oe_adicao) : null,
    oeDnp: r.oe_dnp != null ? Number(r.oe_dnp) : null,
    oeAltura: r.oe_altura != null ? Number(r.oe_altura) : null,
    // Campos extras não estão no cache Supabase, vêm null
    dp: null,
    pertoDp: null,
    distanciaLeitura: null,
    distanciaProgressao: null,
    distanciaVertice: null,
    ponte: null,
    aaVertical: null,
    caHorizontal: null,
    diametro: null,
    ta: null,
    md: null,
    he: null,
    st: null,
    prisma: (r.prisma as string) ?? null,
    prismaAngulo: null,
    prismaEixo: null,
    prisma1: (r.prisma1 as string) ?? null,
    prisma1Angulo: null,
    prisma1Eixo: null,
    imagemReceita: (r.imagem_receita as string) ?? null,
    urlImagemReceita: (r.url_imagem_receita as string) ?? null,
    imagemArmacao: (r.imagem_armacao as string) ?? null,
    urlImagemArmacao: (r.url_imagem_armacao as string) ?? null,
    imagemTracer: (r.imagem_tracer as string) ?? null,
    arquivoTracer: null,
    observacaoOs: (r.observacao_os as string) ?? null,
    observacaoLente: (r.observacao_lente as string) ?? null,
    observacaoPendencia: (r.observacao_pendencia as string) ?? null,
    observacaoReceita: null,
    temReceita: (r.tem_receita as boolean) ?? false,
    temImagem: (r.tem_imagem as boolean) ?? false,
    cacheLoadedAt: (r.cache_loaded_at as string) ?? undefined,
  }));

  return { data: mapped, count: count ?? 0 };
}

export async function getCacheStats(): Promise<{ total: number; lastUpdate: string | null }> {
  const { count } = await supabase
    .from('os_hub_receitas')
    .select('*', { count: 'exact', head: true });

  const { data } = await supabase
    .from('os_hub_receitas')
    .select('cache_loaded_at')
    .order('cache_loaded_at', { ascending: false })
    .limit(1);

  return {
    total: count ?? 0,
    lastUpdate: data?.[0]?.cache_loaded_at ?? null,
  };
}
