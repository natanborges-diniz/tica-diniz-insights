// src/services/empresaService.ts
// Service para buscar empresas

import { apiGet } from './firebirdBridge';
import { supabase } from '@/integrations/supabase/client';

// Empresas que não devem aparecer nos filtros (sem operação ativa)
const EMPRESAS_INATIVAS = [3, 5, 7, 8, 10, 11, 12];

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
  try {
    // Tenta buscar do firebird-bridge primeiro
    const raw = await apiGet<EmpresaRaw>('/empresas');
    
    if (raw && raw.length > 0) {
      return raw.map((r) => ({
        codEmpresa: r.cod_empresa,
        nome: r.empresa_nome,
      }));
    }
  } catch (err) {
    console.warn('Firebird bridge indisponível, usando fallback Supabase:', err);
  }
  
  // Fallback: buscar do Supabase
  const { data, error } = await supabase
    .from('empresa')
    .select('cod_empresa, nome_fantasia')
    .order('cod_empresa');
  
  if (error) {
    console.error('Erro ao buscar empresas do Supabase:', error);
    return [];
  }
  
  return (data || [])
    .filter(e => !EMPRESAS_INATIVAS.includes(e.cod_empresa))
    .map(e => ({
      codEmpresa: e.cod_empresa,
      nome: e.nome_fantasia || `Loja ${e.cod_empresa}`,
    }));
}
