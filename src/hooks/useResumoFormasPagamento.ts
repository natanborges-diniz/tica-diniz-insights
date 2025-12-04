import { useState, useCallback } from 'react';
import { fetchResumoFormasPagamento, ResumoFormaPagamento } from '@/services/firebirdBridge';

interface UseResumoFormasPagamentoReturn {
  dados: ResumoFormaPagamento[];
  isLoading: boolean;
  error: string | null;
  fetchData: (dataInicio: string, dataFim: string) => Promise<void>;
}

export function useResumoFormasPagamento(): UseResumoFormasPagamentoReturn {
  const [dados, setDados] = useState<ResumoFormaPagamento[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (dataInicio: string, dataFim: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fetchResumoFormasPagamento(dataInicio, dataFim);
      setDados(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido ao buscar formas de pagamento';
      setError(message);
      setDados([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { dados, isLoading, error, fetchData };
}
