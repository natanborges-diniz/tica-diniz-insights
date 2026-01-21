// src/services/empresaService.ts
// Service para buscar empresas

import { apiGet } from './firebirdBridge';
import { supabase } from '@/integrations/supabase/client';

// Empresas ativas que DEVEM aparecer nos filtros (whitelist)
// 1, 2, 4, 6, 9, 13, 14, 15, 16, 17, 18
const EMPRESAS_ATIVAS = [1, 2, 4, 6, 9, 13, 14, 15, 16, 17, 18];

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
  // PRIMEIRO: Buscar do Supabase (instantâneo, sem dependência de API externa)
  const { data, error } = await supabase
    .from('empresa')
    .select('cod_empresa, nome_fantasia')
    .order('cod_empresa');
  
  if (!error && data && data.length > 0) {
    return data
      .filter(e => EMPRESAS_ATIVAS.includes(e.cod_empresa))
      .map(e => ({
        codEmpresa: e.cod_empresa,
        nome: e.nome_fantasia || `Loja ${e.cod_empresa}`,
      }));
  }
  
  // FALLBACK: Se Supabase falhar, tentar Firebird Bridge com timeout reduzido
  console.warn('Supabase falhou, tentando Firebird Bridge:', error);
  try {
    const raw = await apiGet<EmpresaRaw>('/empresas', undefined, { timeoutMs: 10000 });
    
    if (raw && raw.length > 0) {
      return raw
        .filter(r => EMPRESAS_ATIVAS.includes(r.cod_empresa))
        .map((r) => ({
          codEmpresa: r.cod_empresa,
          nome: r.empresa_nome,
        }));
    }
  } catch (err) {
    console.error('Ambas as fontes falharam para buscar empresas:', err);
  }
  
  return [];
}
