// src/utils/osMetrics.ts

import { OsMonitorItem } from "../services/osMonitor";

export interface OsMetrics {
  totalOs: number;
  emProducao: number;
  atrasadas: number;
  entreguesNoPeriodo: number;
  tempoMedioCicloDias: number | null;
}

export function calculateOsMetrics(data: OsMonitorItem[]): OsMetrics {
  const hoje = new Date();

  const totalOs = data.length;

  const emProducao = data.filter(
    (o) =>
      !o.DataHoraSaida &&
      !/cancelada/i.test(o.Etapa) &&
      !/entregue/i.test(o.Etapa)
  ).length;

  const atrasadas = data.filter((o) => {
    if (!o.DataPrevisao || o.DataHoraSaida) return false;
    const prev = new Date(o.DataPrevisao);
    return prev < hoje;
  }).length;

  const entreguesNoPeriodo = data.filter((o) =>
    /entregue/i.test(o.Etapa)
  ).length;

  // Tempo médio de ciclo: diferença entre DataHoraSaida e DataHoraEntrada para OS entregues
  const osComCiclo = data.filter(
    (o) => o.DataHoraEntrada && o.DataHoraSaida
  );

  let tempoMedioCicloDias: number | null = null;
  if (osComCiclo.length > 0) {
    const totalDias = osComCiclo.reduce((acc, o) => {
      const entrada = new Date(o.DataHoraEntrada);
      const saida = new Date(o.DataHoraSaida!);
      const diffMs = saida.getTime() - entrada.getTime();
      const diffDias = diffMs / (1000 * 60 * 60 * 24);
      return acc + diffDias;
    }, 0);
    tempoMedioCicloDias = Math.round((totalDias / osComCiclo.length) * 10) / 10;
  }

  return {
    totalOs,
    emProducao,
    atrasadas,
    entreguesNoPeriodo,
    tempoMedioCicloDias,
  };
}
