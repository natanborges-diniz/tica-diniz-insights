import { useState, useCallback } from 'react';
import { fetchResumoEmpresaVendedor, ResumoEmpresaVendedor } from '@/services/firebirdBridge';

interface UseResumoVendasReturn {
  dados: ResumoEmpresaVendedor[];
  isLoading: boolean;
  error: string | null;
  fetchData: (dataInicio: string, dataFim: string) => Promise<void>;
}

export function useResumoVendas(): UseResumoVendasReturn {
  const [dados, setDados] = useState<ResumoEmpresaVendedor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (dataInicio: string, dataFim: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fetchResumoEmpresaVendedor(dataInicio, dataFim);
      setDados(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido ao buscar dados';
      setError(message);
      setDados([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { dados, isLoading, error, fetchData };
}
