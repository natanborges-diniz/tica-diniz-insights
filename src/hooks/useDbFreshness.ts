// src/hooks/useDbFreshness.ts
import { useQuery } from "@tanstack/react-query";
import { getDbFreshness, type DbFreshness } from "@/services/healthService";

const DEZ_MIN = 10 * 60 * 1000;
const CINCO_MIN = 5 * 60 * 1000;

/**
 * Frescor dos dados da copia do Firebird. Reconsulta a cada 10 min e ao
 * focar a janela. Silencioso em erro de rede (o banner nao aparece), para
 * nao competir com o tratamento de conectividade ja existente.
 */
export function useDbFreshness() {
  return useQuery<DbFreshness>({
    queryKey: ["db-freshness"],
    queryFn: ({ signal }) => getDbFreshness(signal),
    refetchInterval: DEZ_MIN,
    staleTime: CINCO_MIN,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
