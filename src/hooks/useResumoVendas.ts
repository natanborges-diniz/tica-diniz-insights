// src/hooks/useResumoVendas.ts

import { useState, useCallback } from 'react';
import { getResumoEmpresaVendedor, ResumoEmpresaVendedor } from '@/services/vendasService';
import { EmpresaParam } from '@/services/firebirdBridge';

interface UseResumoVendasReturn {
  data: ResumoEmpresaVendedor[];
  isLoading: boolean;
  error: string | null;
  fetchData: (empresa: EmpresaParam, dataInicio: string, dataFim: string, bypassCache?: boolean) => Promise<void>;
}

export function useResumoVendas(): UseResumoVendasReturn {
  const [data, setData] = useState<ResumoEmpresaVendedor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (
    empresa: EmpresaParam, 
    dataInicio: string, 
    dataFim: string,
    bypassCache?: boolean
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getResumoEmpresaVendedor({ 
        empresa, 
        dataInicio, 
        dataFim,
        bypassCache,
      });
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar dados';
      setError(message);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, fetchData };
}

// Re-export types
export type { ResumoEmpresaVendedor } from '@/services/vendasService';
