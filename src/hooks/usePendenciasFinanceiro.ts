// Pendências financeiras — consulta única, usada pela aba e pelo painel.
//
// O contador da aba e o conteúdo do painel precisam sair do mesmo lugar. Duas
// consultas separadas dariam dois retratos: a aba dizendo "3" enquanto a lista
// mostra 2, porque uma revalidou e a outra não. Com a mesma chave, o React Query
// atende as duas com uma requisição só.
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();

  // Qualquer ação do sistema (aprovar na mesa, enviar borderô, fechar folha,
  // conciliar extrato...) muda o retrato de pagamentos parados. Em vez de exigir
  // que cada tela lembre de invalidar, ouvimos o cache de mutações: toda mutação
  // bem-sucedida marca o painel como obsoleto e ele revalida sozinho.
  useEffect(() => {
    const cache = queryClient.getMutationCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event?.mutation?.state?.status === "success") {
        queryClient.invalidateQueries({ queryKey: CHAVE_PENDENCIAS });
      }
    });
    return unsubscribe;
  }, [queryClient]);

  return useQuery<RespostaPendencias>({
    queryKey: CHAVE_PENDENCIAS,
    queryFn: () => invokeAction("painel_pendencias") as Promise<RespostaPendencias>,
    // Pagamento parado é informação que envelhece: revalida ao voltar para a aba
    // e a cada minuto, para pegar também o que muda fora da tela (banco/webhook).
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

