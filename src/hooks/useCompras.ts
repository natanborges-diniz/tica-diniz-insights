// src/hooks/useCompras.ts
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  isHealing: boolean;
  error: string | null;
}

/** Verifica se há gap entre o período pedido e o cache disponível. */
async function detectGap(params: UseComprasParams): Promise<{ needs: boolean; di: string; df: string }> {
  let q = supabase
    .from("parcelas_cache")
    .select("data_emissao")
    .eq("tipo_lancamento", "PAGAR")
    .order("data_emissao", { ascending: true })
    .limit(1);
  if (params.empresa !== null) q = q.eq("cod_empresa", params.empresa);
  const { data } = await q;
  const minCached = data?.[0]?.data_emissao as string | undefined;

  // Sem cache nenhum: precisa sincronizar todo o range pedido
  if (!minCached) return { needs: true, di: params.dataInicio, df: params.dataFim };

  // Tolerância de 3 dias para evitar disparos por borda
  const diff = (new Date(minCached).getTime() - new Date(params.dataInicio).getTime()) / 86400000;
  if (diff > 3) {
    // Sincroniza só o gap (do início pedido até o mínimo cacheado)
    return { needs: true, di: params.dataInicio, df: minCached };
  }
  return { needs: false, di: "", df: "" };
}

export function useCompras(params: UseComprasParams): UseComprasResult {
  const queryClient = useQueryClient();
  const healingRef = useRef<string | null>(null);

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

  // Auto-healing: se o range pedido for além do cache, dispara sync-parcelas range e refaz a query
  useEffect(() => {
    if (isLoading || !data) return;
    if (!params.dataInicio || !params.dataFim) return;

    const key = `${params.empresa}|${params.dataInicio}|${params.dataFim}`;
    if (healingRef.current === key) return; // já tentamos para esse range

    (async () => {
      const gap = await detectGap(params);
      if (!gap.needs) return;
      healingRef.current = key;

      const toastId = toast.loading("Buscando histórico de compras do período…", {
        description: `${gap.di} → ${gap.df}`,
      });
      try {
        const { error: invokeErr } = await supabase.functions.invoke("sync-parcelas", {
          body: {
            mode: "range",
            codEmpresa: params.empresa === null ? "ALL" : String(params.empresa),
            dataInicio: gap.di,
            dataFim: gap.df,
          },
        });
        if (invokeErr) throw invokeErr;
        toast.success("Histórico atualizado", { id: toastId });
        await queryClient.invalidateQueries({ queryKey: ["compras"] });
      } catch (e: any) {
        toast.error("Não foi possível atualizar o histórico", {
          id: toastId,
          description: e?.message || "Tente novamente em alguns instantes.",
        });
      }
    })();
  }, [data, isLoading, params.dataInicio, params.dataFim, params.empresa, queryClient]);

  return {
    parcelas: data?.parcelas ?? [],
    notas: data?.notas ?? [],
    isLoading,
    isHealing: healingRef.current !== null,
    error: error instanceof Error ? error.message : null,
  };
}
