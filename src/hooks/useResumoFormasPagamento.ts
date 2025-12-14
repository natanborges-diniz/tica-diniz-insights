// src/hooks/useResumoFormasPagamento.ts

import { useState, useCallback } from 'react';
import { getResumoFormasPagamento, ResumoFormaPagamento } from '@/services/vendasService';
import { EmpresaParam } from '@/services/firebirdBridge';

interface UseResumoFormasPagamentoReturn {
  data: ResumoFormaPagamento[];
  isLoading: boolean;
  error: string | null;
  fetchData: (empresa: EmpresaParam, dataInicio: string, dataFim: string) => Promise<void>;
}

export function useResumoFormasPagamento(): UseResumoFormasPagamentoReturn {
  const [data, setData] = useState<ResumoFormaPagamento[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (empresa: EmpresaParam, dataInicio: string, dataFim: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getResumoFormasPagamento({ empresa, dataInicio, dataFim });
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
export type { ResumoFormaPagamento } from '@/services/vendasService';
