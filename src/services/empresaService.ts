// src/services/empresaService.ts
// Service para buscar empresas

import { apiGet } from './firebirdBridge';

// ============================================
// INTERFACES
// ============================================

interface EmpresaRaw {
  cod_empresa: number;
  empresa_nome: string;
}

export interface Empresa {
  codEmpresa: number;
  nome: string;
}

// ============================================
// SERVICE FUNCTION
// ============================================

export async function getEmpresas(): Promise<Empresa[]> {
  const raw = await apiGet<EmpresaRaw>('/empresas');
  
  return raw.map((r) => ({
    codEmpresa: r.cod_empresa,
    nome: r.empresa_nome,
  }));
}
