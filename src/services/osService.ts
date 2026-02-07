// src/services/osService.ts
// Service para endpoint de OS Monitor - Última Etapa

import { apiGet, EmpresaParam } from './firebirdBridge';

// ============================================
// INTERFACES
// ============================================

interface OsRecordRaw {
  cod_os?: number;
  os?: string;
  empresa?: string;
  codempresa?: number;
  cod_empresa_origem?: number;
  cliente?: string;
  etapa?: string;
  status_atraso?: string;
  atraso_dias?: number;
  dataemissao?: string;
  dataprevisao?: string;
  datahoraentrada?: string;
  datahorasaida?: string;
  total?: number;
  usuario?: string;
  vendedor?: string;
  telefone?: string;
}

export type StatusAtraso = 'ENTREGUE' | 'NO_PRAZO' | 'ATRASO_LEVE' | 'ATRASO' | 'SEM_DATA';

export interface OsRecord {
  codOs: number;
  os: string;
  empresa: string;
  codEmpresa: number | null;
  cliente: string;
  etapa: string;
  statusAtraso: StatusAtraso;
  atrasoDias: number;
  dataEmissao: string | null;
  dataPrevisao: string | null;
  dataHoraEntrada: string | null;
  dataHoraSaida: string | null;
  total: number;
  usuario: string;
  vendedor: string;
  telefone: string | null;
}

export type CampoDataOs = 'PREVISAO' | 'EMISSAO' | 'ENTRADA' | 'SAIDA';

export interface GetOsMonitorParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  campoData?: CampoDataOs;
}

function normalizeStatusAtraso(value: string | undefined): StatusAtraso {
  const trimmed = value?.trim()?.toUpperCase() ?? '';
  const valid: StatusAtraso[] = ['ENTREGUE', 'NO_PRAZO', 'ATRASO_LEVE', 'ATRASO', 'SEM_DATA'];
  return valid.includes(trimmed as StatusAtraso) ? (trimmed as StatusAtraso) : 'SEM_DATA';
}

function mapOsRecordRaw(r: OsRecordRaw): OsRecord {
  return {
    codOs: r.cod_os ?? 0,
    os: String(r.os ?? ''),
    empresa: r.empresa?.trim() ?? '',
    codEmpresa: r.codempresa || r.cod_empresa_origem || null,
    cliente: r.cliente?.trim() ?? '',
    etapa: r.etapa?.trim() ?? '',
    statusAtraso: normalizeStatusAtraso(r.status_atraso),
    atrasoDias: r.atraso_dias ?? 0,
    dataEmissao: r.dataemissao ?? null,
    dataPrevisao: r.dataprevisao ?? null,
    dataHoraEntrada: r.datahoraentrada ?? null,
    dataHoraSaida: r.datahorasaida ?? null,
    total: r.total ?? 0,
    usuario: r.usuario?.trim() ?? '',
    vendedor: r.vendedor?.trim() ?? '',
    telefone: r.telefone?.trim() ?? null,
  };
}

export async function getOsMonitor(params: GetOsMonitorParams): Promise<OsRecord[]> {
  const queryParams: Record<string, string | number | undefined> = {
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
  };

  if (params.campoData) {
    queryParams.campoData = params.campoData;
  }
  
  // codEmpresa: ALL ou número
  if (params.empresa === 'ALL' || params.empresa === null) {
    queryParams.codEmpresa = 'ALL';
  } else {
    queryParams.codEmpresa = Number(params.empresa);
  }
  
  console.log('[osService] Calling /os/monitor-ultima-etapa with:', queryParams);
  
  const raw = await apiGet<OsRecordRaw>('/os/monitor-ultima-etapa', queryParams);

  console.log('[osService] Raw data count:', raw.length);
  if (raw.length > 0) {
    console.log('[osService] Sample raw record:', raw[0]);
  }
  
  const mapped = raw.map(mapOsRecordRaw);
  
  return mapped;
}
