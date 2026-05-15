export type FaixaDoente =
  | 'PROMOCAO_20'
  | 'LIQUIDACAO_30'
  | 'LIQUIDACAO_50'
  | 'DESCARTE'
  | 'REVISAO_URGENTE';

export const FAIXAS_SANEAMENTO = [
  { ate: 90,       rotulo: 'ANALISE PARA RECOMPRA', desconto: 0,   acao: 'manter'    },
  { ate: 180,      rotulo: 'ACOMPANHAMENTO',        desconto: 0,   acao: 'observar'  },
  { ate: 270,      rotulo: 'PROMOCAO 20%',          desconto: 20,  acao: 'promover'  },
  { ate: 360,      rotulo: 'LIQUIDA 30%',           desconto: 30,  acao: 'liquidar'  },
  { ate: 720,      rotulo: 'LIQUIDA 50%',           desconto: 50,  acao: 'liquidar'  },
  { ate: Infinity, rotulo: 'DESCARTE 100%',         desconto: 100, acao: 'descartar' },
] as const;

export type FaixaSaneamento = typeof FAIXAS_SANEAMENTO[number];

export function classificarPorIdade(diasEmEstoque: number): FaixaSaneamento {
  return (
    FAIXAS_SANEAMENTO.find(f => diasEmEstoque <= f.ate) ??
    FAIXAS_SANEAMENTO[FAIXAS_SANEAMENTO.length - 1]
  );
}

// Maps a saneamento entry (desconto > 0) to its FaixaDoente enum value.
// Only call for entries where desconto > 0 (i.e. diasEmEstoque > 180).
export function toFaixaDoente(entry: FaixaSaneamento): Exclude<FaixaDoente, 'REVISAO_URGENTE'> {
  switch (entry.desconto as number) {
    case 100: return 'DESCARTE';
    case 50:  return 'LIQUIDACAO_50';
    case 30:  return 'LIQUIDACAO_30';
    default:  return 'PROMOCAO_20';
  }
}
