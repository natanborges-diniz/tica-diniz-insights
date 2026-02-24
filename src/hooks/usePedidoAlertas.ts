// src/hooks/usePedidoAlertas.ts
// Hook para monitorar alertas de pedidos com status negativo (cancelado, rejeitado, etc.)

import { useState, useEffect, useCallback } from "react";
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
}

export function usePedidoAlertas() {
  const [alertas, setAlertas] = useState<PedidoAlerta[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlertas = useCallback(async () => {
    const { data, error } = await supabase
      .from("pedido_alertas")
      .select("*")
      .eq("acknowledged", false)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setAlertas(data as unknown as PedidoAlerta[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAlertas();

    // Realtime subscription for instant updates
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

  const unacknowledgedCount = alertas.length;

  return { alertas, loading, unacknowledgedCount, acknowledgeAlerta, refetch: fetchAlertas };
}
