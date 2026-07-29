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
  /** feriado MUNICIPAL só se aplica se a cidade da loja bater com a do feriado */
  cidade?: string | null;
  /** feriado ESTADUAL só se aplica se a UF bater (default SP) */
  uf?: string | null;
}

/**
 * Feriado se aplica à loja? NACIONAL sempre; ESTADUAL se a UF bater (feriado
 * sem UF vale para todos); MUNICIPAL só com cidade igual — loja sem cidade
 * configurada NÃO fecha por feriado municipal (evita fechar a cidade errada).
 */
export function feriadoAplicaALoja(f: Feriado, config: LojaConfiguracao | null): boolean {
  if (f.tipo === 'NACIONAL') return true;
  if (f.tipo === 'ESTADUAL') {
    if (!f.uf) return true;
    return (config?.uf ?? 'SP').toUpperCase() === f.uf.toUpperCase();
  }
  // MUNICIPAL
  const cidadeLoja = (config?.cidade ?? '').trim().toLowerCase();
  const cidadeFeriado = (f.cidade ?? '').trim().toLowerCase();
  return !!cidadeLoja && !!cidadeFeriado && cidadeLoja === cidadeFeriado;
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
  feriados
    .filter((f) => feriadoAplicaALoja(f, config))
    .forEach((f) => {
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
 * Retorna as datas do período da meta.
 *
 * PADRÃO DA CASA (Natan, 2026-07-28): o mês comercial M vai SEMPRE do dia 21
 * do mês anterior ao dia 20 do mês M (ex.: julho = 21/06 → 20/07; janeiro =
 * 21/12 do ano anterior → 20/01). Esse é o DEFAULT mesmo sem registro em
 * metas_periodos — um registro lá só serve para EXCEÇÕES pontuais.
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

  // default 21 → 20 (mes-1 dia 21 até mes dia 20); Date lida com mes 0 = dez/ano-1
  return {
    dataInicio: new Date(ano, mes - 2, 21),
    dataFim: new Date(ano, mes - 1, 20),
  };
}
