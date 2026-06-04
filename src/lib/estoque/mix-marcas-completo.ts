// src/lib/estoque/mix-marcas-completo.ts
// Helpers para construir a lista completa de marcas (Onda 2.A).
//
// Separado do motor mix-ideal-v2 para permitir testes unitários isolados
// sem depender do estado do componente (overrides, pctSolarDefault, etc.).

import { MIX_MINIMO_MARCA } from './constants';
import type { ItemMixV2, MixMarcaV2, StatusMixV2 } from './mix-ideal-v2';

// Subset das colunas de overrides relevantes para este cálculo
export interface MarcaOverrideLite {
  estrategica?: boolean;
  pct_solar?: number | null;
}

/**
 * Augmenta `mixMarcas` (saída do motor) com marcas que têm estoque ARMACOES
 * positivo mas não entraram no motor (sem vendas no período de análise).
 *
 * Regras:
 * - Marcas já presentes em `mixMarcas` são ignoradas.
 * - Só considera itens com `categoria === 'ARMACOES'` e `estoqueAtual > 0`.
 * - Status atribuído ao extra:
 *   - `ABAIXO_MINIMO_ESTRATEGICA` + `mixTotal=MIX_MINIMO_MARCA` se estratégica.
 *   - `SUGERIR_DESCONTINUAR` se todo estoque for dead stock.
 *   - `SEM_VENDAS_180D` caso contrário (há estoque ativo mas sem vendas).
 * - Extras ordenados por `estoqueEfetivo DESC` antes de concatenar.
 */
export function construirMixMarcasCompleto(
  mixMarcas: MixMarcaV2[],
  itensMix: ReadonlyArray<ItemMixV2>,
  overrides: Map<string, MarcaOverrideLite>,
  pctSolarDefault: number,
): MixMarcaV2[] {
  const marcasNoMix = new Set(mixMarcas.map(m => m.marca));

  const extraMap = new Map<string, { estoqueEfetivo: number; allDeadStock: boolean }>();
  itensMix.forEach(i => {
    if (i.categoria !== 'ARMACOES' || i.estoqueAtual <= 0) return;
    if (marcasNoMix.has(i.marca)) return;
    const entry = extraMap.get(i.marca) ?? { estoqueEfetivo: 0, allDeadStock: true };
    if (!i.isDeadStock) {
      entry.estoqueEfetivo += i.estoqueAtual;
      entry.allDeadStock = false;
    }
    extraMap.set(i.marca, entry);
  });

  const extras: MixMarcaV2[] = Array.from(extraMap.entries())
    .sort((a, b) => b[1].estoqueEfetivo - a[1].estoqueEfetivo)
    .map(([marca, data]) => {
      const cfg = overrides.get(marca);
      const isEstrategica = cfg?.estrategica ?? false;
      const pctSolar = cfg?.pct_solar != null ? cfg.pct_solar : pctSolarDefault;
      const mixTotal = isEstrategica ? MIX_MINIMO_MARCA : 0;
      const mixRX = Math.round(mixTotal * (1 - pctSolar / 100));
      const status: StatusMixV2 = isEstrategica
        ? 'ABAIXO_MINIMO_ESTRATEGICA'
        : data.allDeadStock
        ? 'SUGERIR_DESCONTINUAR'
        : 'SEM_VENDAS_180D';

      return {
        marca,
        participacao: 0,
        pctPecas: 0,
        pctFaturamento: 0,
        pecasVendidas: 0,
        faturamento: 0,
        mixTotal,
        mixRX,
        mixSolar: mixTotal - mixRX,
        pctSolar,
        estoqueEfetivo: data.estoqueEfetivo,
        lacuna: Math.max(0, mixTotal - data.estoqueEfetivo),
        status,
        estrategica: isEstrategica,
        skusAlocados: [],
      };
    });

  return [...mixMarcas, ...extras];
}

/**
 * Calcula os dois índices de corte visual para a tabela da Etapa 4.
 *
 * - `corte1`: primeiro índice em que `mixTotal < MIX_MINIMO_MARCA`
 *   (todas as marcas antes têm mix viável).
 * - `corte2`: `floor(capacidadeTotal / MIX_MINIMO_MARCA)` — quantas marcas
 *   caberiam teoricamente se cada uma recebesse exatamente o mínimo.
 */
export function calcularCortes(
  mixMarcasCompleto: MixMarcaV2[],
  capacidadeTotal: number,
): { corte1: number; corte2: number } {
  const corte1 = mixMarcasCompleto.filter(m => m.mixTotal >= MIX_MINIMO_MARCA).length;
  const corte2 = Math.floor(capacidadeTotal / MIX_MINIMO_MARCA);
  return { corte1, corte2 };
}
