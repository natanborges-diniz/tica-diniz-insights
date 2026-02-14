// src/utils/dateValidation.ts

/**
 * Formata uma data para string YYYY-MM-DD sem conversão de timezone
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calcula a diferença em dias entre duas datas
 */
export function diffInDays(dataIni: string, dataFim: string): number {
  const d1 = new Date(dataIni + "T00:00:00");
  const d2 = new Date(dataFim + "T00:00:00");
  const diffMs = d2.getTime() - d1.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Valida se o período está dentro do limite máximo de dias (default: 365)
 */
export function validarPeriodoMaximo(dataIni: string, dataFim: string, maxDias = 365): boolean {
  const dias = diffInDays(dataIni, dataFim);
  return dias <= maxDias;
}

/**
 * Ajusta o período para o limite máximo de dias (ajusta dataIni se necessário)
 * Retorna as datas originais se já estiverem dentro do limite
 */
export function limitarPeriodo(
  dataIni: string, 
  dataFim: string, 
  maxDias = 365
): { dataIni: string; dataFim: string; foiAjustado: boolean } {
  const dias = diffInDays(dataIni, dataFim);
  
  if (dias <= maxDias) {
    return { dataIni, dataFim, foiAjustado: false };
  }
  
  // Ajusta dataIni para maxDias antes de dataFim
  const novaDataIni = new Date(dataFim + "T00:00:00");
  novaDataIni.setDate(novaDataIni.getDate() - maxDias);
  
  return {
    dataIni: formatLocalDate(novaDataIni),
    dataFim,
    foiAjustado: true,
  };
}

/**
 * Retorna as datas padrão para o mês atual (dia 1 ao último dia)
 */
export function getDefaultPeriodoMesAtual(): { dataIni: string; dataFim: string } {
  const hoje = new Date();
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  
  return {
    dataIni: formatLocalDate(primeiroDiaMes),
    dataFim: formatLocalDate(ultimoDiaMes),
  };
}

/**
 * Retorna o período comercial baseado na configuração do banco (metas_periodos).
 * Se não houver config cadastrada, usa fallback: dia 1 ao último dia do mês.
 * Esta é a ÚNICA fonte de verdade para período comercial.
 */
export async function getPeriodoComercial(): Promise<{ dataIni: string; dataFim: string }> {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1; // 1-indexed

  try {
    const { getMetaPeriodo, getDatasDoPeriodo } = await import('@/services/calendarioService');
    const periodo = await getMetaPeriodo(anoAtual, mesAtual);
    
    if (periodo) {
      const { dataInicio, dataFim } = getDatasDoPeriodo(anoAtual, mesAtual, periodo);
      return {
        dataIni: formatLocalDate(dataInicio),
        dataFim: formatLocalDate(dataFim),
      };
    }
  } catch (err) {
    console.warn('Não foi possível carregar período comercial do banco, usando fallback:', err);
  }

  // Fallback: primeiro ao último dia do mês atual
  const primeiroDia = new Date(anoAtual, mesAtual - 1, 1);
  const ultimoDia = new Date(anoAtual, mesAtual, 0);
  return {
    dataIni: formatLocalDate(primeiroDia),
    dataFim: formatLocalDate(ultimoDia),
  };
}
