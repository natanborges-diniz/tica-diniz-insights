// src/utils/osMetrics.ts

import { OsRecord } from "../services/osMonitor";

export type OsStatus = "EM_ANDAMENTO" | "ENTREGUE" | "CONCLUIDA_LOJA" | "CANCELADA";

export interface OsMetrics {
  totalOs: number;
  emProducao: number;
  atrasadas: number;
  entreguesNoPeriodo: number;
  tempoMedioCicloDias: number | null;
}

export function mapStatus(os: OsRecord): OsStatus {
  switch (os.codEtapaAtual) {
    case 8:
      return "ENTREGUE";
    case 9:
      return "CANCELADA";
    case 6:
      return "CONCLUIDA_LOJA";
    default:
      return "EM_ANDAMENTO";
  }
}

export function getStatusLegivel(status: OsStatus): string {
  switch (status) {
    case "ENTREGUE":
      return "Entregue";
    case "CANCELADA":
      return "Cancelada";
    case "CONCLUIDA_LOJA":
      return "Concluída na loja";
    case "EM_ANDAMENTO":
    default:
      return "Em produção";
  }
}

export function isAtrasada(os: OsRecord, status: OsStatus): boolean {
  // Se não está em andamento, não é atrasada
  if (status !== "EM_ANDAMENTO") return false;
  if (!os.dataEmissao) return false;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const emissao = new Date(os.dataEmissao);
  emissao.setHours(0, 0, 0, 0);

  if (os.dataPrevisao) {
    const previsao = new Date(os.dataPrevisao);
    previsao.setHours(0, 0, 0, 0);
    return previsao < hoje;
  }

  // Sem previsão: considera atrasada se passou mais de 7 dias desde emissão
  const diffMs = hoje.getTime() - emissao.getTime();
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  return diffDias > 7;
}

export function calcularDiasCiclo(os: OsRecord): number | null {
  if (!os.dataEmissao || !os.dataHoraSaidaUltima) return null;
  const emissao = new Date(os.dataEmissao);
  const fim = new Date(os.dataHoraSaidaUltima);
  const diffMs = fim.getTime() - emissao.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

export function calculateOsMetrics(data: OsRecord[]): OsMetrics {
  const totalOs = data.length;

  let emProducao = 0;
  let atrasadas = 0;
  let entreguesNoPeriodo = 0;
  const ciclos: number[] = [];

  for (const os of data) {
    const status = mapStatus(os);

    if (status === "EM_ANDAMENTO" || status === "CONCLUIDA_LOJA") {
      emProducao++;
    }

    if (status === "ENTREGUE") {
      entreguesNoPeriodo++;
      const ciclo = calcularDiasCiclo(os);
      if (ciclo !== null) {
        ciclos.push(ciclo);
      }
    }

    if (isAtrasada(os, status)) {
      atrasadas++;
    }
  }

  let tempoMedioCicloDias: number | null = null;
  if (ciclos.length > 0) {
    const soma = ciclos.reduce((acc, c) => acc + c, 0);
    tempoMedioCicloDias = Math.round((soma / ciclos.length) * 10) / 10;
  }

  return {
    totalOs,
    emProducao,
    atrasadas,
    entreguesNoPeriodo,
    tempoMedioCicloDias,
  };
}
