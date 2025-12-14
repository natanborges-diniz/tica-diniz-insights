// src/hooks/useApiQuery.ts
// Hook genérico para requisições à API

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiQueryOptions {
  enabled?: boolean;
}

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useApiQuery<T>(
  key: unknown[],
  fetcher: () => Promise<T>,
  options: UseApiQueryOptions = {}
): UseApiQueryResult<T> {
  const { enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Ref para evitar chamadas duplicadas
  const isFetchingRef = useRef(false);
  const lastKeyRef = useRef<string>('');

  const fetchData = useCallback(async () => {
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [fetcher]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Serialize key para comparação
    const keyString = JSON.stringify(key);
    
    // Evita refetch se key não mudou
    if (keyString === lastKeyRef.current && data !== null) {
      return;
    }
    
    lastKeyRef.current = keyString;
    fetchData();
  }, [enabled, key, fetchData, data]);

  const reload = useCallback(() => {
    lastKeyRef.current = ''; // Reset para forçar reload
    fetchData();
  }, [fetchData]);

  return { data, loading, error, reload };
}
