// src/services/empresaService.ts
// Service para buscar empresas

import { apiGet } from './firebirdBridge';
import { supabase } from '@/integrations/supabase/client';

// Empresas inativas ou "lixo" que não devem aparecer nos filtros
const EMPRESAS_INATIVAS_SUPABASE = [3, 5, 7, 8, 10, 11, 12];

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
      .filter(e => !EMPRESAS_INATIVAS_SUPABASE.includes(e.cod_empresa))
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
        .filter(r => !EMPRESAS_INATIVAS_SUPABASE.includes(r.cod_empresa))
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
