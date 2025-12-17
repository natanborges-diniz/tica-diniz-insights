// src/services/empresaService.ts
// Service para buscar empresas

import { apiGet } from './firebirdBridge';
import { supabase } from '@/integrations/supabase/client';

// Apenas Loja 10 é inativa (cod_empresa = 10 no Supabase)
const EMPRESAS_INATIVAS_SUPABASE = [10];

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
    // Tenta buscar do firebird-bridge primeiro (já vem filtrado pelo backend)
    const raw = await apiGet<EmpresaRaw>('/empresas');
    
    if (raw && raw.length > 0) {
      return raw
        .filter(r => !EMPRESAS_INATIVAS_SUPABASE.includes(r.cod_empresa))
        .map((r) => ({
          codEmpresa: r.cod_empresa,
          nome: r.empresa_nome,
        }));
    }
  } catch (err) {
    console.warn('Firebird bridge indisponível, usando fallback Supabase:', err);
  }
  
  // Fallback: buscar do Supabase (apenas filtra Loja 10)
  const { data, error } = await supabase
    .from('empresa')
    .select('cod_empresa, nome_fantasia')
    .order('cod_empresa');
  
  if (error) {
    console.error('Erro ao buscar empresas do Supabase:', error);
    return [];
  }
  
  return (data || [])
    .filter(e => !EMPRESAS_INATIVAS_SUPABASE.includes(e.cod_empresa))
    .map(e => ({
      codEmpresa: e.cod_empresa,
      nome: e.nome_fantasia || `Loja ${e.cod_empresa}`,
    }));
}
