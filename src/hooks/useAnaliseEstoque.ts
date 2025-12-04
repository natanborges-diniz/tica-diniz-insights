import { useState, useCallback } from 'react';
import { fetchAnaliseEstoqueAcao, AnaliseEstoqueAcao } from '@/services/firebirdBridge';

interface UseAnaliseEstoqueReturn {
  dados: AnaliseEstoqueAcao[];
  isLoading: boolean;
  error: string | null;
  fetchData: (codEmpresa: number | string) => Promise<void>;
}

export function useAnaliseEstoque(): UseAnaliseEstoqueReturn {
  const [dados, setDados] = useState<AnaliseEstoqueAcao[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (codEmpresa: number | string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fetchAnaliseEstoqueAcao(codEmpresa);
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
