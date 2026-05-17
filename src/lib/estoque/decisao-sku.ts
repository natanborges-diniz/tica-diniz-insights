import { LIMITES } from './faixas-saneamento';

export type DecisaoSku = 'REPOR' | 'TROCAR' | 'OBSERVAR' | 'LIQUIDAR' | 'SEM_CADASTRO';

export function calcularDecisaoSku(
  sku: {
    precoCusto: number;
    estoqueAtual: number;
    qtdVendidos: number;
    diasEmEstoque: number;
    diasGiroEfetivo: number | null;
    pecasGiroConsideradas: number;
    coberturaDias: number;
    diasAlvo: number;
    vendaDiaria: number;
  },
  cortes?: { diasAtencao?: number; diasAcao?: number }
): DecisaoSku {
  const diasAtencao = cortes?.diasAtencao ?? LIMITES.ATENCAO;  // 180
  const diasAcao    = cortes?.diasAcao    ?? LIMITES.ACAO_SUAVE; // 270

  const temGiroReal = sku.diasGiroEfetivo !== null && sku.diasGiroEfetivo > 0;

  if (sku.precoCusto === 0) return 'SEM_CADASTRO';
  if (sku.estoqueAtual > 0 && sku.qtdVendidos === 0 && sku.diasEmEstoque >= diasAcao) return 'LIQUIDAR';
  if (sku.estoqueAtual > 0 && sku.qtdVendidos === 0 && sku.diasEmEstoque >= diasAtencao) return 'TROCAR';
  if (temGiroReal && sku.pecasGiroConsideradas >= 1 && sku.coberturaDias < sku.diasAlvo) return 'REPOR';
  if (!temGiroReal && sku.vendaDiaria > 0 && sku.coberturaDias < sku.diasAlvo) return 'REPOR';
  return 'OBSERVAR';
}
