// src/lib/metas/calendario.ts
// Tipos e cálculos PUROS de calendário comercial (sem Supabase), extraídos de
// calendarioService.ts na Fase 2 para serem testáveis em vitest e reusáveis
// pela lib de metas semanais. O calendarioService reexporta tudo isto para
// manter compatibilidade.

export interface MetaPeriodo {
  id: string;
  ano: number;
  mes: number;
  diaInicio: number;
  diaFim: number;
  mesInicio: number | null;
  mesFim: number | null;
  descricao: string | null;
}

export interface Feriado {
  id: string;
  data: string;
  descricao: string;
  tipo: 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL';
  uf: string | null;
  cidade: string | null;
  recorrente: boolean;
}

export interface LojaConfiguracao {
  id: string;
  codEmpresa: number;
  tipoLoja: 'RUA' | 'SHOPPING';
  abreDomingo: boolean;
  abreFeriado: boolean;
  numVendedores: number;
  percentualAceitavel: number;
}

export interface LojaExcecao {
  id: string;
  codEmpresa: number;
  data: string;
  aberto: boolean;
  motivo: string | null;
}

/**
 * Calcula os dias úteis em um período considerando regras da loja
 * (domingo/feriado/exceções).
 */
export function calcularDiasUteis(
  dataInicio: Date,
  dataFim: Date,
  config: LojaConfiguracao | null,
  feriados: Feriado[],
  excecoes: LojaExcecao[]
): number {
  let diasUteis = 0;
  const current = new Date(dataInicio);

  const abreDomingo = config?.abreDomingo ?? false;
  const abreFeriado = config?.abreFeriado ?? false;

  const excecoesMap = new Map<string, boolean>();
  excecoes.forEach((e) => {
    excecoesMap.set(e.data, e.aberto);
  });

  const feriadosSet = new Set<string>();
  feriados.forEach((f) => {
    if (f.recorrente) {
      const [, mes, dia] = f.data.split('-');
      const anoAtual = current.getFullYear();
      feriadosSet.add(`${anoAtual}-${mes}-${dia}`);
    } else {
      feriadosSet.add(f.data);
    }
  });

  while (current <= dataFim) {
    const dataStr = current.toISOString().split('T')[0];
    const diaSemana = current.getDay(); // 0 = Domingo
    const ehDomingo = diaSemana === 0;
    const ehFeriado = feriadosSet.has(dataStr);

    if (excecoesMap.has(dataStr)) {
      if (excecoesMap.get(dataStr)) {
        diasUteis++;
      }
    } else {
      let aberto = true;
      if (ehDomingo && !abreDomingo) aberto = false;
      if (ehFeriado && !abreFeriado) aberto = false;
      if (aberto) diasUteis++;
    }

    current.setDate(current.getDate() + 1);
  }

  return diasUteis;
}

/**
 * Retorna as datas do período da meta (considerando config de período
 * comercial customizado, ex. 21→20).
 */
export function getDatasDoPeriodo(
  ano: number,
  mes: number,
  periodoConfig: MetaPeriodo | null
): { dataInicio: Date; dataFim: Date } {
  if (periodoConfig) {
    const mesInicio = periodoConfig.mesInicio ?? mes;
    const mesFim = periodoConfig.mesFim ?? mes;

    const anoInicio = mesInicio > mes ? ano - 1 : ano;
    const anoFim = mesFim < mes ? ano + 1 : ano;

    return {
      dataInicio: new Date(anoInicio, mesInicio - 1, periodoConfig.diaInicio),
      dataFim: new Date(anoFim, mesFim - 1, periodoConfig.diaFim),
    };
  }

  return {
    dataInicio: new Date(ano, mes - 1, 1),
    dataFim: new Date(ano, mes, 0),
  };
}
