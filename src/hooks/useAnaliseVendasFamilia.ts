// src/hooks/useAnaliseVendasFamilia.ts

import { useState, useEffect, useCallback } from 'react';
import { getAnaliseFamiliaVendedor, AnaliseFamiliaVendedor } from '@/services/vendasService';
import { EmpresaParam } from '@/services/firebirdBridge';

interface UseAnaliseVendasFamiliaParams {
  dataInicio: string;
  dataFim: string;
  empresa: EmpresaParam;
  bypassCache?: boolean;
}

interface UseAnaliseVendasFamiliaReturn {
  data: AnaliseFamiliaVendedor[];
  isLoading: boolean;
  error: string | null;
  reload: (bypassCache?: boolean) => void;
}

export function useAnaliseVendasFamilia({
  dataInicio,
  dataFim,
  empresa,
  bypassCache: initialBypassCache,
}: UseAnaliseVendasFamiliaParams): UseAnaliseVendasFamiliaReturn {
  const [data, setData] = useState<AnaliseFamiliaVendedor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (bypassCache?: boolean) => {
    if (!dataInicio || !dataFim) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const result = await getAnaliseFamiliaVendedor({
        dataInicio,
        dataFim,
        empresa,
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
  }, [dataInicio, dataFim, empresa]);

  useEffect(() => {
    fetchData(initialBypassCache);
  }, [fetchData, initialBypassCache]);

  const reload = useCallback((bypassCache?: boolean) => {
    fetchData(bypassCache);
  }, [fetchData]);

  return { data, isLoading, error, reload };
}

// Re-export types
export type { AnaliseFamiliaVendedor } from '@/services/vendasService';
