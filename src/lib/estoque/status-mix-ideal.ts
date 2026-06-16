import type { MixMarcaV2 } from './mix-ideal-v2';

export interface StatusDisplay {
  label: string;
  className: string;
}

// Princípio #34 — Status semântico e combinável.
// 'OK' é o padrão; flags especiais agregam contexto ao gestor.
export function getStatusInfo(m: Pick<MixMarcaV2, 'status' | 'estrategica'>, recemIntroduzida: boolean): StatusDisplay {
  const isEstrategica = m.estrategica;
  const isRecem = recemIntroduzida;
  const isSemVendas = m.status === 'SEM_VENDAS_180D';
  const isAbaixoMinimo = m.status === 'SUGERIR_DESCONTINUAR' || m.status === 'ABAIXO_MINIMO_ESTRATEGICA';

  const parts: string[] = [];

  if (isEstrategica) parts.push('ESTRATÉGICA');
  if (isRecem) parts.push('RECÉM');
  // SEM VENDAS 180D só quando não há flag manual (estratégica/recém já implica que o gestor decidiu manter)
  if (isSemVendas && !isEstrategica && !isRecem) parts.push('SEM VENDAS 180D');
  if (isAbaixoMinimo) parts.push('AB. MÍN.');

  if (parts.length === 0) {
    return { label: 'OK', className: 'bg-green-100 text-green-800 border-green-300' };
  }

  const label = parts.join(' • ');

  if (isEstrategica || isRecem) {
    return { label, className: 'bg-blue-100 text-blue-800 border-blue-300 text-xs' };
  }
  if (isSemVendas) {
    return { label, className: 'bg-amber-100 text-amber-700 border-amber-300 text-xs' };
  }
  return { label, className: 'bg-red-100 text-red-800 border-red-300 text-xs' };
}
