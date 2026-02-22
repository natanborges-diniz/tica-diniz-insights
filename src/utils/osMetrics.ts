// src/utils/osMetrics.ts
// Métricas calculadas client-side usando dados do backend

import { OsRecord, StatusAtraso } from "../services/osService";

export interface OsMetrics {
  totalOs: number;
  emAndamento: number;
  entregues: number;
  atrasadas: number;
  semPrevisao: number;
  tempoMedioCicloDias: number | null;
}

export function getStatusColor(status: StatusAtraso): string {
  switch (status) {
    case 'ENTREGUE':
      return 'bg-success-soft text-success border-success-muted';
    case 'NO_PRAZO':
      return 'bg-info-soft text-info border-info-muted';
    case 'ATRASO_LEVE':
      return 'bg-warning-soft text-warning border-warning-muted';
    case 'ATRASO':
      return 'bg-danger-soft text-danger border-danger-muted';
    case 'SEM_DATA':
    default:
      return 'bg-muted text-muted-foreground border-muted-foreground/30';
  }
}

export function getStatusLabel(status: StatusAtraso): string {
  switch (status) {
    case 'ENTREGUE':
      return 'Entregue';
    case 'NO_PRAZO':
      return 'No Prazo';
    case 'ATRASO_LEVE':
      return 'Atraso Leve';
    case 'ATRASO':
      return 'Atrasada';
    case 'SEM_DATA':
    default:
      return 'Sem Data';
  }
}

export function calculateOsMetrics(data: OsRecord[]): OsMetrics {
  const totalOs = data.length;
  
  // Em andamento = tudo que NÃO é ENTREGUE
  const emAndamento = data.filter(os => os.statusAtraso !== 'ENTREGUE').length;
  
  // Entregues
  const entregues = data.filter(os => os.statusAtraso === 'ENTREGUE').length;
  
  // Atrasadas = ATRASO + ATRASO_LEVE
  const atrasadas = data.filter(os => 
    os.statusAtraso === 'ATRASO' || os.statusAtraso === 'ATRASO_LEVE'
  ).length;
  
  // Sem previsão = SEM_DATA
  const semPrevisao = data.filter(os => os.statusAtraso === 'SEM_DATA').length;
  
  // Tempo médio de ciclo (somente ENTREGUE, usando dataHoraEntrada)
  const entreguesComData = data.filter(os => 
    os.statusAtraso === 'ENTREGUE' && os.dataEmissao && os.dataHoraEntrada
  );
  
  let tempoMedioCicloDias: number | null = null;
  if (entreguesComData.length > 0) {
    const ciclos = entreguesComData.map(os => {
      const inicio = new Date(os.dataEmissao!);
      const fim = new Date(os.dataHoraEntrada!);
      const diffMs = fim.getTime() - inicio.getTime();
      return diffMs / (1000 * 60 * 60 * 24);
    }).filter(d => d >= 0 && isFinite(d));
    
    if (ciclos.length > 0) {
      const soma = ciclos.reduce((acc, c) => acc + c, 0);
      tempoMedioCicloDias = Math.round((soma / ciclos.length) * 10) / 10;
    }
  }

  return {
    totalOs,
    emAndamento,
    entregues,
    atrasadas,
    semPrevisao,
    tempoMedioCicloDias,
  };
}

// Ordenação padrão: Atrasadas > Em andamento > Entregues
export function sortOsByPriority(data: OsRecord[]): OsRecord[] {
  const priorityOrder: Record<StatusAtraso, number> = {
    'ATRASO': 0,
    'ATRASO_LEVE': 1,
    'SEM_DATA': 2,
    'NO_PRAZO': 3,
    'ENTREGUE': 4,
  };
  
  return [...data].sort((a, b) => {
    const priorityDiff = priorityOrder[a.statusAtraso] - priorityOrder[b.statusAtraso];
    if (priorityDiff !== 0) return priorityDiff;
    // Dentro da mesma prioridade, ordenar por atraso_dias DESC
    return b.atrasoDias - a.atrasoDias;
  });
}
