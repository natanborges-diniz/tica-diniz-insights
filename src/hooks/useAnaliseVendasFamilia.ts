import { useState, useEffect, useCallback } from 'react';
import { fetchAnaliseFamiliaVendedor, AnaliseFamiliaVendedor } from '@/services/firebirdBridge';

interface UseAnaliseVendasFamiliaParams {
  dataInicio: string;
  dataFim: string;
  codEmpresa: number | null;
}

interface UseAnaliseVendasFamiliaReturn {
  data: AnaliseFamiliaVendedor[];
  isLoading: boolean;
  error: string | null;
}

export function useAnaliseVendasFamilia({
  dataInicio,
  dataFim,
  codEmpresa,
}: UseAnaliseVendasFamiliaParams): UseAnaliseVendasFamiliaReturn {
  const [data, setData] = useState<AnaliseFamiliaVendedor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!dataInicio || !dataFim || codEmpresa === null) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const result = await fetchAnaliseFamiliaVendedor({
        dataInicio,
        dataFim,
        codEmpresa,
      });
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar dados';
      setError(message);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [dataInicio, dataFim, codEmpresa]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
}
