// src/hooks/usePedidoAlertas.ts
// Hook para monitorar alertas de pedidos com status negativo (cancelado, rejeitado, etc.)
// Supports filtering by fornecedor and returns per-fornecedor counts

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoAlerta {
  id: string;
  pedido_fornecedor_id: string;
  cod_empresa: number;
  status_detectado: string;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
  numero_pedido: string | null;
  cod_os: number | null;
  fornecedor: string | null;
}

interface PedidoAlertaRow {
  id: string;
  pedido_fornecedor_id: string;
  cod_empresa: number;
  status_detectado: string;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
  pedidos_fornecedor: {
    numero_pedido: string | null;
    cod_os: number;
    fornecedor: string;
  };
}

export function usePedidoAlertas(fornecedor?: string) {
  const [alertas, setAlertas] = useState<PedidoAlerta[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlertas = useCallback(async () => {
    let query = supabase
      .from("pedido_alertas")
      .select("*, pedidos_fornecedor!inner(numero_pedido, cod_os, fornecedor)")
      .eq("acknowledged", false)
      .order("created_at", { ascending: false });

    if (fornecedor) {
      query = query.eq("pedidos_fornecedor.fornecedor" as any, fornecedor);
    }

    const { data, error } = await query;

    if (!error && data) {
      const mapped: PedidoAlerta[] = (data as unknown as PedidoAlertaRow[]).map((row) => ({
        id: row.id,
        pedido_fornecedor_id: row.pedido_fornecedor_id,
        cod_empresa: row.cod_empresa,
        status_detectado: row.status_detectado,
        acknowledged: row.acknowledged,
        acknowledged_by: row.acknowledged_by,
        acknowledged_at: row.acknowledged_at,
        created_at: row.created_at,
        numero_pedido: row.pedidos_fornecedor?.numero_pedido ?? null,
        cod_os: row.pedidos_fornecedor?.cod_os ?? null,
        fornecedor: row.pedidos_fornecedor?.fornecedor ?? null,
      }));
      setAlertas(mapped);
    }
    setLoading(false);
  }, [fornecedor]);

  useEffect(() => {
    fetchAlertas();

    const channel = supabase
      .channel("pedido-alertas-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_alertas" },
        () => {
          fetchAlertas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlertas]);

  const acknowledgeAlerta = useCallback(async (alertaId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("pedido_alertas")
      .update({
        acknowledged: true,
        acknowledged_by: user.id,
        acknowledged_at: new Date().toISOString(),
      })
      .eq("id", alertaId);

    if (!error) {
      setAlertas(prev => prev.filter(a => a.id !== alertaId));
    }
    return !error;
  }, []);

  const countByFornecedor = useMemo(() => {
    const counts: Record<string, number> = {};
    alertas.forEach(a => {
      const key = (a.fornecedor || "UNKNOWN").toUpperCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [alertas]);

  const unacknowledgedCount = alertas.length;

  return { alertas, loading, unacknowledgedCount, countByFornecedor, acknowledgeAlerta, refetch: fetchAlertas };
}
