// src/hooks/useAnaliseEstoque.ts

import { useState, useCallback } from 'react';
import { getAnaliseEstoqueAcao, AnaliseEstoqueAcao } from '@/services/estoqueService';
import { EmpresaParam } from '@/services/firebirdBridge';

interface UseAnaliseEstoqueReturn {
  data: AnaliseEstoqueAcao[];
  isLoading: boolean;
  error: string | null;
  fetchData: (empresa: EmpresaParam) => Promise<void>;
}

export function useAnaliseEstoque(): UseAnaliseEstoqueReturn {
  const [data, setData] = useState<AnaliseEstoqueAcao[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (empresa: EmpresaParam) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getAnaliseEstoqueAcao({ empresa });
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
export type { AnaliseEstoqueAcao } from '@/services/estoqueService';
