// src/services/empresaService.ts
// Service para buscar empresas — fonte de verdade: tabela 'empresa' (coluna ativa)

import { apiGet } from './firebirdBridge';
import { supabase } from '@/integrations/supabase/client';
import { isAbortError } from '@/lib/isAbortError';

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
  // Fonte de verdade: Supabase tabela empresa, filtrada por ativa = true
  const { data, error } = await supabase
    .from('empresa')
    .select('cod_empresa, nome_fantasia, ativa')
    .eq('ativa', true)
    .order('cod_empresa');
  
  if (!error && data && data.length > 0) {
    return data.map(e => ({
      codEmpresa: e.cod_empresa,
      nome: e.nome_fantasia || `Loja ${e.cod_empresa}`,
    }));
  }
  
  // FALLBACK: Se Supabase falhar, tentar Firebird Bridge com timeout reduzido
  console.warn('Supabase falhou para empresas, tentando Firebird Bridge:', error);
  try {
    const raw = await apiGet<EmpresaRaw>('/empresas', undefined, { timeoutMs: 10000 });
    
    if (raw && raw.length > 0) {
      return raw.map((r) => ({
        codEmpresa: r.cod_empresa,
        nome: r.empresa_nome,
      }));
    }
  } catch (err) {
    console.error('Ambas as fontes falharam para buscar empresas:', err);
  }
  
  return [];
}
