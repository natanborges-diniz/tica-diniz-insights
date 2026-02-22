// src/components/ui/bridge-status-banner.tsx
// Reusable banner that warns user when Bridge is down/degraded

import React from "react";
import { AlertTriangle, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BridgeHealth } from "@/hooks/useBridgeStatus";

interface BridgeStatusBannerProps {
  health: BridgeHealth;
  isCircuitOpen: boolean;
  errorMessage?: string | null;
  lastCheckedAt?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}

export const BridgeStatusBanner: React.FC<BridgeStatusBannerProps> = ({
  health,
  isCircuitOpen,
  errorMessage,
  lastCheckedAt,
  onRetry,
  retrying,
}) => {
  if (health === "up" && !isCircuitOpen) return null;

  const isDown = health === "down" || health === "timeout";
  const isDegraded = health === "degraded";
  const formattedTime = lastCheckedAt
    ? new Date(lastCheckedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${
      isDown
        ? "bg-destructive/10 border-destructive/30"
        : isDegraded
        ? "bg-warning-soft border-warning-muted"
        : isCircuitOpen
        ? "bg-warning-soft border-warning-muted"
        : "bg-muted border-border"
    }`}>
      {isDown ? (
        <WifiOff className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-warning" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isDown ? "text-destructive" : "text-warning-foreground"}`}>
          {isDown
            ? "Conexão com o servidor de dados indisponível"
            : isDegraded
            ? "Serviço online, mas sem conexão com o banco Firebird"
            : "Conexão instável — requisições pausadas temporariamente"
          }
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {errorMessage || "O sistema está sem conexão com o banco de dados do ERP."}
          {formattedTime && ` • Último check: ${formattedTime}`}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Verifique o status em <strong>Admin → Bridge Health</strong>.
          {isCircuitOpen && " Novas tentativas serão permitidas em breve."}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying} className="shrink-0">
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Verificando…' : 'Tentar'}
        </Button>
      )}
    </div>
  );
};
