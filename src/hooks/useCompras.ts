// src/hooks/useCompras.ts
import { useQuery } from "@tanstack/react-query";
import { getComprasParcelas, aggregateNotas, ComprasNota, ComprasParcela } from "@/services/comprasService";

export interface UseComprasParams {
  dataInicio: string;
  dataFim: string;
  empresa: number | null;
}

export interface UseComprasResult {
  parcelas: ComprasParcela[];
  notas: ComprasNota[];
  isLoading: boolean;
  error: string | null;
}

export function useCompras(params: UseComprasParams) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["compras", params.empresa, params.dataInicio, params.dataFim],
    enabled: params.dataInicio !== "" && params.dataFim !== "" && params.empresa !== undefined,
    queryFn: async () => {
      const parcelas = await getComprasParcelas(params);
      const notas = aggregateNotas(parcelas);
      return { parcelas, notas };
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    parcelas: data?.parcelas ?? [],
    notas: data?.notas ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
