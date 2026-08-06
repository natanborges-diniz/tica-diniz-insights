// Pendências financeiras — consulta única, usada pela aba e pelo painel.
//
// O contador da aba e o conteúdo do painel precisam sair do mesmo lugar. Duas
// consultas separadas dariam dois retratos: a aba dizendo "3" enquanto a lista
// mostra 2, porque uma revalidou e a outra não. Com a mesma chave, o React Query
// atende as duas com uma requisição só.
import { useQuery } from "@tanstack/react-query";
import type {
  Pendencia,
  ResumoPainel,
} from "../../supabase/functions/_shared/pendenciasFinanceiro";

export interface RespostaPendencias {
  pendencias: Pendencia[];
  resumo: ResumoPainel;
}

export const CHAVE_PENDENCIAS = ["painel-pendencias"] as const;

export function usePendenciasFinanceiro(
  invokeAction: (action: string, params?: Record<string, unknown>) => Promise<unknown>,
) {
  return useQuery<RespostaPendencias>({
    queryKey: CHAVE_PENDENCIAS,
    queryFn: () => invokeAction("painel_pendencias") as Promise<RespostaPendencias>,
    // Pagamento parado é informação que envelhece: revalida ao voltar para a aba.
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
}
