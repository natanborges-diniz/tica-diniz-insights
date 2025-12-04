import { useState, useEffect } from 'react';
import { fetchEmpresas, Empresa } from '@/services/firebirdBridge';

interface UseEmpresasReturn {
  empresas: Empresa[];
  isLoading: boolean;
  error: string | null;
}

export function useEmpresas(): UseEmpresasReturn {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchEmpresas();
        setEmpresas(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar empresas';
        setError(message);
        setEmpresas([]);
      } finally {
        setIsLoading(false);
      }
    }
    carregar();
  }, []);

  return { empresas, isLoading, error };
}
