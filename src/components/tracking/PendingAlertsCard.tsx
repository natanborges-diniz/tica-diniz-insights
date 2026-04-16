// src/components/tracking/PendingAlertsCard.tsx
// Shared component to display pending order alerts with "Ciente" button

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import type { PedidoAlerta } from "@/hooks/usePedidoAlertas";

interface PendingAlertsCardProps {
  alertas: PedidoAlerta[];
  onAcknowledge: (alertaId: string) => Promise<boolean | undefined>;
}

export function PendingAlertsCard({ alertas, onAcknowledge }: PendingAlertsCardProps) {
  const [acknowledgingIds, setAcknowledgingIds] = useState<Set<string>>(new Set());

  if (alertas.length === 0) return null;

  const handleAck = async (alertaId: string) => {
    setAcknowledgingIds(prev => new Set(prev).add(alertaId));
    const ok = await onAcknowledge(alertaId);
    if (ok) {
      toast({ title: "Ciência registrada", description: "O alerta foi marcado como verificado." });
    }
    setAcknowledgingIds(prev => { const s = new Set(prev); s.delete(alertaId); return s; });
  };

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {alertas.length} {alertas.length === 1 ? "alerta pendente" : "alertas pendentes"}
        </div>
        <div className="space-y-1.5">
          {alertas.map(a => {
            const isAcking = acknowledgingIds.has(a.id);
            const pedidoLabel = a.numero_pedido ? `Pedido #${a.numero_pedido}` : `ID ${a.pedido_fornecedor_id.slice(0, 8)}`;
            const osLabel = a.cod_os ? ` · OS ${a.cod_os}` : "";
            let dateStr = "";
            try { dateStr = format(new Date(a.created_at), "dd/MM HH:mm", { locale: ptBR }); } catch { dateStr = a.created_at; }

            return (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-destructive/20 bg-background px-3 py-2 text-xs">
                <span>
                  <span className="font-medium">{pedidoLabel}{osLabel}</span>
                  <span className="text-muted-foreground"> · {a.status_detectado} · {dateStr}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs border-destructive/30 hover:bg-destructive/10"
                  disabled={isAcking}
                  onClick={() => handleAck(a.id)}
                >
                  {isAcking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Ciente
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
