export type MotivoQtd = 'BASE' | 'GIRO_RAPIDO' | 'GIRO_MUITO_RAPIDO';

/** Campos mínimos por SKU para a distribuição de lacuna.
 *  Manter enxuto: evita acoplamento com o "God type" ItemEstoque.
 */
export type SkuParaPool = {
  codSku: number;
  qtdVendidos: number;
  precoCusto: number;
  diasGiroUltimaPeca: number | null;
  diasGiroMedio: number | null;
  pecasGiroConsideradas: number;
  curvaABC: 'A' | 'B' | 'C';
};

export interface LacunaItemResult {
  codSku: number;
  qtdAComprar: number;
  motivo: MotivoQtd;
}

export interface LacunaResult {
  alocados: LacunaItemResult[];
  naoPreenchivel: number;
  poolSize: number;
}

const PESO_CURVA: Record<'A' | 'B' | 'C', number> = { A: 3, B: 2, C: 1 };

/**
 * Distribui a lacuna de peças de uma marca entre os SKUs "bons" do pool.
 *
 * Passe 1 — BASE: 1 peça por SKU do pool, do melhor score ao pior.
 * Passe 2 — GIRO_RAPIDO: +1 nos SKUs com giro ≤ 45d.
 * Passe 3 — GIRO_MUITO_RAPIDO: +1 nos SKUs com giro ≤ 30d.
 * Passes 4+: repete descendo o limite por [21,15,10,7]d enquanto houver restante.
 *
 * Score = (1/giroEf) × max(1,pecasGiroConsideradas) × PESO_CURVA[curvaABC].
 * Teto = max(1, ceil(qtdVendidos × 1.2)) — nenhum SKU recebe mais que seu histórico + 20%.
 */
export function distribuirLacuna(
  skus: ReadonlyArray<SkuParaPool>,
  lacuna: number,
  opts?: { limitesGiro?: { maxGiro?: number } }
): LacunaResult {
  const maxGiro = opts?.limitesGiro?.maxGiro ?? 90;

  if (lacuna <= 0 || skus.length === 0) {
    return { alocados: [], naoPreenchivel: Math.max(0, lacuna), poolSize: 0 };
  }

  type PoolItem = {
    codSku: number;
    giroEf: number;
    score: number;
    tetoCompra: number;
    qtd: number;
    motivo: MotivoQtd | undefined;
  };

  const pool: PoolItem[] = skus
    .filter(s => {
      const giroEf = s.diasGiroUltimaPeca ?? s.diasGiroMedio ?? null;
      return (
        s.precoCusto > 0 &&
        s.qtdVendidos > 0 &&
        giroEf !== null &&
        giroEf > 0 &&
        giroEf <= maxGiro
      );
    })
    .map(s => {
      const giroEf = (s.diasGiroUltimaPeca ?? s.diasGiroMedio) as number;
      const amostra = Math.max(1, s.pecasGiroConsideradas);
      const peso = PESO_CURVA[s.curvaABC];
      const score = (1 / giroEf) * amostra * peso;
      const tetoCompra = Math.max(1, Math.ceil(s.qtdVendidos * 1.2));
      return { codSku: s.codSku, giroEf, score, tetoCompra, qtd: 0, motivo: undefined };
    })
    .sort((a, b) => b.score - a.score);

  let restante = lacuna;

  // Passe 1 — base: 1 peça por SKU, melhor ao pior.
  for (const p of pool) {
    if (restante <= 0) break;
    if (p.qtd < p.tetoCompra) {
      p.qtd += 1;
      restante -= 1;
      p.motivo = 'BASE';
    }
  }

  // Passe 2 — escalonamento: +1 nos giros ≤ 45d.
  if (restante > 0) {
    for (const p of pool) {
      if (restante <= 0) break;
      if (p.giroEf <= 45 && p.qtd < p.tetoCompra) {
        p.qtd += 1;
        restante -= 1;
        p.motivo = 'GIRO_RAPIDO';
      }
    }
  }

  // Passe 3 — escalonamento: +1 nos giros ≤ 30d.
  if (restante > 0) {
    for (const p of pool) {
      if (restante <= 0) break;
      if (p.giroEf <= 30 && p.qtd < p.tetoCompra) {
        p.qtd += 1;
        restante -= 1;
        p.motivo = 'GIRO_MUITO_RAPIDO';
      }
    }
  }

  // Passes 4+ — descendo limites [21,15,10,7]d até esgotar tetos ou lacuna.
  const limites = [21, 15, 10, 7];
  for (const lim of limites) {
    if (restante <= 0) break;
    let alocou = false;
    for (const p of pool) {
      if (restante <= 0) break;
      if (p.giroEf <= lim && p.qtd < p.tetoCompra) {
        p.qtd += 1;
        restante -= 1;
        p.motivo = 'GIRO_MUITO_RAPIDO';
        alocou = true;
      }
    }
    if (!alocou) break;
  }

  const alocados: LacunaItemResult[] = pool
    .filter(p => p.qtd > 0)
    .map(p => ({ codSku: p.codSku, qtdAComprar: p.qtd, motivo: p.motivo as MotivoQtd }));

  return { alocados, naoPreenchivel: restante, poolSize: pool.length };
}
