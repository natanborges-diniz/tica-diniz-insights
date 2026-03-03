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
 * Retorna o período comercial padrão baseado no ciclo 21–20.
 * - Se hoje está entre dia 1 e dia 20: período = 21 do mês anterior até 20 do mês atual
 * - Se hoje está entre dia 21 e último dia: período = 21 do mês atual até 20 do próximo mês
 */
export function getDefaultPeriodoMesAtual(): { dataIni: string; dataFim: string } {
  const hoje = new Date();
  const dia = hoje.getDate();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-indexed

  if (dia <= 20) {
    // Período: 21 do mês anterior → 20 do mês atual
    const inicio = new Date(ano, mes - 1, 21);
    const fim = new Date(ano, mes, 20);
    return { dataIni: formatLocalDate(inicio), dataFim: formatLocalDate(fim) };
  } else {
    // Período: 21 do mês atual → 20 do próximo mês
    const inicio = new Date(ano, mes, 21);
    const fim = new Date(ano, mes + 1, 20);
    return { dataIni: formatLocalDate(inicio), dataFim: formatLocalDate(fim) };
  }
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

  // Fallback: ciclo comercial 21–20
  return getDefaultPeriodoMesAtual();
}
