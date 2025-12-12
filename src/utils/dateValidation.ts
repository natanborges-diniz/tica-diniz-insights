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
 * Retorna as datas padrão para o mês atual
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
