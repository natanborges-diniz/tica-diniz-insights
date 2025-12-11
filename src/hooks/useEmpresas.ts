import { useState, useEffect } from 'react';
import { fetchEmpresas, Empresa } from '@/services/firebirdBridge';

// Empresas que não devem aparecer nos filtros (sem operação ativa)
const EMPRESAS_INATIVAS = [10]; // Loja 10 não tem mais operação

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
        // Filtrar empresas inativas
        const empresasAtivas = data.filter(
          (emp) => !EMPRESAS_INATIVAS.includes(emp.codEmpresa)
        );
        setEmpresas(empresasAtivas);
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
