// src/hooks/useUserEmpresas.ts
// Hook que retorna apenas as empresas que o usuário tem permissão de acessar.
// Admin: acessa todas. Demais: apenas as configuradas em user_empresa_permissions.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getEmpresas, Empresa } from '@/services/empresaService';

interface UseUserEmpresasReturn {
  empresas: Empresa[];
  isLoading: boolean;
  error: string | null;
  /** Se o usuário pode ver "Todas as Empresas" (admin com acesso total) */
  canSeeAll: boolean;
  /** Recarregar dados */
  reload: () => void;
}

export function useUserEmpresas(): UseUserEmpresasReturn {
  const { user, isAdmin } = useAuth();
  const [allEmpresas, setAllEmpresas] = useState<Empresa[]>([]);
  const [allowedCods, setAllowedCods] = useState<number[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setAllEmpresas([]);
      setAllowedCods(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch all active empresas and user permissions in parallel
      const [empresasData, permsRes] = await Promise.all([
        getEmpresas(),
        supabase
          .from('user_empresa_permissions')
          .select('cod_empresa')
          .eq('user_id', user.id),
      ]);

      setAllEmpresas(empresasData);

      if (permsRes.error) {
        console.warn('Erro ao buscar permissões de empresa:', permsRes.error);
        setAllowedCods(null);
      } else if (permsRes.data && permsRes.data.length > 0) {
        setAllowedCods(permsRes.data.map(p => p.cod_empresa));
      } else {
        // Nenhuma permissão configurada = sem acesso (exceto admin)
        setAllowedCods([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar empresas';
      setError(message);
      setAllEmpresas([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Admin always sees all
  if (isAdmin) {
    return {
      empresas: allEmpresas,
      isLoading,
      error,
      canSeeAll: true,
      reload: load,
    };
  }

  // Non-admin: filter by allowed codes
  const filtered = allowedCods
    ? allEmpresas.filter(e => allowedCods.includes(e.codEmpresa))
    : [];

  const canSeeAll = allowedCods !== null && allEmpresas.length > 0 && allowedCods.length >= allEmpresas.length;

  return {
    empresas: filtered,
    isLoading,
    error,
    canSeeAll,
    reload: load,
  };
}
