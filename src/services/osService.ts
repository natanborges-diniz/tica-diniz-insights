// src/services/osService.ts
// Service para endpoint de OS Monitor

import { apiGet, EmpresaParam, formatEmpresaParam } from './firebirdBridge';

// ============================================
// INTERFACES
// ============================================

interface OsRecordRaw {
  OS: number;
  EMPRESA?: string;
  CODEMPRESA?: number;
  COD_EMPRESA?: number;
  CLIENTE?: string;
  CODCLIENTE?: number;
  CPF?: string;
  TOTAL?: number;
  DATAEMISSAO?: string;
  DATAPREVISAO?: string;
  CODETAPA_ATUAL?: number;
  DATAHORAENTRADA_ULTIMA?: string;
  DATAHORASAIDA_ULTIMA?: string;
  IS_REPARO?: number;
  IS_ECOMMERCE?: number;
  ETAPA?: string;
  NUMEROORDEMSERVICO?: string;
  TELEFONE?: string;
}

export interface OsRecord {
  numeroOs: number;
  empresa: string | null;
  codEmpresa: number | null;
  cliente: string | null;
  codCliente: number | null;
  cpf: string | null;
  total: number | null;
  dataEmissao: string | null;
  dataPrevisao: string | null;
  codEtapaAtual: number | null;
  dataHoraEntradaUltima: string | null;
  dataHoraSaidaUltima: string | null;
  isReparo: boolean;
  isEcommerce: boolean;
  etapa: string | null;
  numeroOrdemServico: string | null;
  telefone: string | null;
}

export interface GetOsMonitorParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
}

function mapOsRecordRaw(r: OsRecordRaw): OsRecord {
  return {
    numeroOs: r.OS ?? 0,
    empresa: r.EMPRESA ?? null,
    codEmpresa: r.CODEMPRESA ?? r.COD_EMPRESA ?? null,
    cliente: r.CLIENTE ?? null,
    codCliente: r.CODCLIENTE ?? null,
    cpf: r.CPF ?? null,
    total: r.TOTAL ?? null,
    dataEmissao: r.DATAEMISSAO ?? null,
    dataPrevisao: r.DATAPREVISAO ?? null,
    codEtapaAtual: r.CODETAPA_ATUAL ?? null,
    dataHoraEntradaUltima: r.DATAHORAENTRADA_ULTIMA ?? null,
    dataHoraSaidaUltima: r.DATAHORASAIDA_ULTIMA ?? null,
    isReparo: r.IS_REPARO === 1,
    isEcommerce: r.IS_ECOMMERCE === 1,
    etapa: r.ETAPA ?? null,
    numeroOrdemServico: r.NUMEROORDEMSERVICO ?? null,
    telefone: r.TELEFONE ?? null,
  };
}

export async function getOsMonitor(params: GetOsMonitorParams): Promise<OsRecord[]> {
  const queryParams = {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
  };
  
  console.log('[osService] Sending params:', queryParams);
  
  const raw = await apiGet<OsRecordRaw>('/os/monitor', queryParams);

  console.log('[osService] Raw data sample:', raw[0]);
  
  const mapped = raw.map(mapOsRecordRaw);
  console.log('[osService] Mapped data sample:', mapped[0]);
  
  return mapped;
}
