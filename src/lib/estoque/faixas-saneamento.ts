export type FaixaDoente =
  | 'PROMOCAO_20'
  | 'LIQUIDACAO_30'
  | 'LIQUIDACAO_50'
  | 'ACAO_ESPECIAL'
  | 'REVISAO_URGENTE';

export const FAIXAS_SANEAMENTO = [
  { ate: 90,       rotulo: 'ANALISE PARA RECOMPRA', desconto: 0,   acao: 'manter'    },
  { ate: 180,      rotulo: 'ACOMPANHAMENTO',        desconto: 0,   acao: 'observar'  },
  { ate: 270,      rotulo: 'PROMOCAO 20%',          desconto: 20,  acao: 'promover'  },
  { ate: 360,      rotulo: 'LIQUIDA 30%',           desconto: 30,  acao: 'liquidar'  },
  { ate: 720,      rotulo: 'LIQUIDA 50%',           desconto: 50,  acao: 'liquidar'  },
  { ate: Infinity, rotulo: 'AÇÃO ESPECIAL',          desconto: 0,   acao: 'destinar'  },
] as const;

// Special entry returned for items with no valid time data (null, undefined, or negative).
// Never stored in FAIXAS_SANEAMENTO to keep the array clean and ordered.
const SEM_CADASTRO = {
  ate: -1 as const,
  rotulo: 'SEM CADASTRO' as const,
  desconto: 0 as const,
  acao: 'cadastrar' as const,
};

export type FaixaSaneamento = typeof FAIXAS_SANEAMENTO[number] | typeof SEM_CADASTRO;

export function classificarPorIdade(diasEmEstoque: number | null | undefined): FaixaSaneamento {
  if (diasEmEstoque == null || diasEmEstoque < 0) return SEM_CADASTRO;
  return (
    FAIXAS_SANEAMENTO.find(f => diasEmEstoque <= f.ate) ??
    FAIXAS_SANEAMENTO[FAIXAS_SANEAMENTO.length - 1]
  );
}

// Derives the upper-bound (days) for a faixa by rotulo — keyed lookup prevents
// silent breakage if the table is ever reordered.
function limitePor(rotulo: string): number {
  const f = FAIXAS_SANEAMENTO.find(f => f.rotulo === rotulo);
  if (!f || !Number.isFinite(f.ate)) throw new Error(`Limite não encontrado: ${rotulo}`);
  return f.ate;
}

export const LIMITES = {
  ATENCAO:      limitePor('ACOMPANHAMENTO'), // 180
  ACAO_SUAVE:   limitePor('PROMOCAO 20%'),   // 270
  ACAO_URGENTE: limitePor('LIQUIDA 30%'),    // 360
  ACAO_CRITICA: limitePor('LIQUIDA 50%'),    // 720
} as const;

// Maps a saneamento entry to its FaixaDoente enum value.
// Switch on rotulo (unique per entry) to avoid ambiguity from shared desconto values.
export function toFaixaDoente(entry: FaixaSaneamento): Exclude<FaixaDoente, 'REVISAO_URGENTE'> {
  switch (entry.rotulo) {
    case 'LIQUIDA 50%':  return 'LIQUIDACAO_50';
    case 'LIQUIDA 30%':  return 'LIQUIDACAO_30';
    case 'AÇÃO ESPECIAL': return 'ACAO_ESPECIAL';
    default:             return 'PROMOCAO_20';
  }
}
