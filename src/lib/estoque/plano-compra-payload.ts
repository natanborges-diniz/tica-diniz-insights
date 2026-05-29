// src/lib/estoque/plano-compra-payload.ts
// Módulo PURO — sem React, sem Supabase.
//
// Serialização do mix V2 para a tabela `plano_compra_historico` + regras de
// avanço do Wizard. Tudo isolado pra ser testável em node sem DOM.

import type { MixMarcaV2 } from './mix-ideal-v2';

// ── Tipos do payload persistido ───────────────────────────────────────────────

export interface PlanoSugeridoMarca {
  marca: string;
  participacao: number;
  mixTotal: number;
  mixRX: number;
  mixSolar: number;
  pctSolar: number;
  estoqueEfetivo: number;
  lacuna: number;
  status: MixMarcaV2['status'];
  estrategica: boolean;
  skusAlocados: Array<{
    codSku: number;
    descricao: string;
    diasGiroUltimaPeca: number;
    qtdSugerida: number;
  }>;
}

export interface PlanoFinalMarca {
  marca: string;
  qtdComprar: number;
  ajusteUsuario: boolean;
}

export interface ParametrosPlano {
  capacidadeTotal: number;
  pctSolarDefault: number;
  pesoPecas: number;
  pesoFaturamento: number;
  janelaParticipacaoDias: number;
  janelaCandidatosDias: number;
  mixMinimoMarca: number;
  dataInicio: string;
  dataFim: string;
}

export interface PlanoCompraInsert {
  cod_empresa: number;
  data_geracao: string;
  parametros: ParametrosPlano;
  plano_sugerido: PlanoSugeridoMarca[];
  plano_final: PlanoFinalMarca[];
  total_sugerido: number;
  total_final: number;
}

// ── Serialização do plano sugerido ───────────────────────────────────────────

export function serializarPlanoSugerido(mix: ReadonlyArray<MixMarcaV2>): PlanoSugeridoMarca[] {
  return mix.map(m => ({
    marca: m.marca,
    participacao: m.participacao,
    mixTotal: m.mixTotal,
    mixRX: m.mixRX,
    mixSolar: m.mixSolar,
    pctSolar: m.pctSolar,
    estoqueEfetivo: m.estoqueEfetivo,
    lacuna: m.lacuna,
    status: m.status,
    estrategica: m.estrategica,
    skusAlocados: m.skusAlocados.map(s => ({
      codSku: s.codSku,
      descricao: s.descricao,
      diasGiroUltimaPeca: s.diasGiroUltimaPeca,
      qtdSugerida: s.qtdSugerida,
    })),
  }));
}

/** Plano final inicial = espelho da lacuna sugerida (qtd a comprar por marca). */
export function derivarPlanoFinalInicial(mix: ReadonlyArray<MixMarcaV2>): PlanoFinalMarca[] {
  return mix.map(m => ({
    marca: m.marca,
    qtdComprar: m.lacuna,
    ajusteUsuario: false,
  }));
}

/** Aplica edição manual: marca como ajusteUsuario quando diverge do sugerido. */
export function aplicarAjustePlanoFinal(
  planoFinal: ReadonlyArray<PlanoFinalMarca>,
  mix: ReadonlyArray<MixMarcaV2>,
  marca: string,
  qtdNova: number,
): PlanoFinalMarca[] {
  const qtdSeg = Math.max(0, Math.floor(qtdNova));
  const sugerida = mix.find(m => m.marca === marca)?.lacuna ?? 0;
  return planoFinal.map(p =>
    p.marca === marca
      ? { ...p, qtdComprar: qtdSeg, ajusteUsuario: qtdSeg !== sugerida }
      : p,
  );
}

export function totalLacunaSugerida(mix: ReadonlyArray<MixMarcaV2>): number {
  return mix.reduce((s, m) => s + m.lacuna, 0);
}

export function totalPlanoFinal(plano: ReadonlyArray<PlanoFinalMarca>): number {
  return plano.reduce((s, p) => s + p.qtdComprar, 0);
}

// ── Payload completo para insert no Supabase ──────────────────────────────────

export interface MontarPayloadInput {
  codEmpresa: number;
  mix: ReadonlyArray<MixMarcaV2>;
  planoFinal: ReadonlyArray<PlanoFinalMarca>;
  parametros: ParametrosPlano;
  dataGeracao?: Date;
}

export function montarPayloadInsert({
  codEmpresa,
  mix,
  planoFinal,
  parametros,
  dataGeracao = new Date(),
}: MontarPayloadInput): PlanoCompraInsert {
  return {
    cod_empresa: codEmpresa,
    data_geracao: dataGeracao.toISOString(),
    parametros,
    plano_sugerido: serializarPlanoSugerido(mix),
    plano_final: [...planoFinal],
    total_sugerido: totalLacunaSugerida(mix),
    total_final: totalPlanoFinal(planoFinal),
  };
}

// ── Regras de avanço do Wizard ────────────────────────────────────────────────

export type EmpresaSelecao = number | null | 'ALL';

export interface PodeAvancarInput {
  step: number;
  empresaId: EmpresaSelecao;
  loadingDados: boolean;
  qtdItens: number;
  capacidadeTotal: number;
  mixVazio: boolean;
}

/**
 * Bloqueia avanço quando o pré-requisito da etapa não foi cumprido.
 * Step 1 → exige empresa específica (não 'ALL', não null).
 * Step 2 → exige dados carregados.
 * Step 4 → exige capacidade > 0 e mix não vazio.
 */
export function podeAvancarStep({
  step,
  empresaId,
  loadingDados,
  qtdItens,
  capacidadeTotal,
  mixVazio,
}: PodeAvancarInput): boolean {
  if (step === 1) {
    return typeof empresaId === 'number';
  }
  if (step === 2) {
    return !loadingDados && qtdItens > 0;
  }
  if (step === 4) {
    return capacidadeTotal > 0 && !mixVazio;
  }
  return true;
}
