import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Package, ClipboardList, Wallet, Settings, Brain } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { BridgeStatusBanner } from "@/components/ui/bridge-status-banner";
import { useBridgeStatus } from "@/hooks/useBridgeStatus";
import { supabase } from "@/integrations/supabase/client";

const modules = [
  {
    key: "vendas",
    label: "Vendas",
    description: "Dashboards de faturamento, formas de pagamento e ranking",
    icon: BarChart3,
    path: "/vendas",
  },
  {
    key: "estoque",
    label: "Estoque",
    description: "Visão geral, ações e análise OTB",
    icon: Package,
    path: "/estoque",
  },
  {
    key: "monitor",
    label: "Monitor OS",
    description: "Acompanhamento de ordens de serviço e pedidos",
    icon: ClipboardList,
    path: "/os",
  },
  {
    key: "financeiro",
    label: "Financeiro",
    description: "Parcelas, DRE e fluxo de caixa",
    icon: Wallet,
    path: "/financeiro",
  },
  {
    key: "ia",
    label: "Central IA",
    description: "Inteligência artificial e insights automáticos",
    icon: Brain,
    path: "/ia",
  },
  {
    key: "config",
    label: "Configurações",
    description: "Metas, calendário e parâmetros do sistema",
    icon: Settings,
    path: "/config/metas",
  },
] as const;

export default function HomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const bridgeStatus = useBridgeStatus();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await supabase.functions.invoke("bridge-health-check");
      await new Promise(r => setTimeout(r, 1500));
      await bridgeStatus.refresh();
    } finally {
      setRetrying(false);
    }
  }, [bridgeStatus]);

  const firstName = profile?.nome?.split(" ")[0] ?? profile?.email?.split("@")[0] ?? "Usuário";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Olá, {firstName} 👋
        </h1>
        <p className="text-muted-foreground">
          Selecione um módulo para começar.
        </p>
      </div>

      {(bridgeStatus.health !== "up" && bridgeStatus.health !== "unknown") && (
        <BridgeStatusBanner
          health={bridgeStatus.health}
          isCircuitOpen={bridgeStatus.isCircuitOpen}
          errorMessage={bridgeStatus.errorMessage}
          lastCheckedAt={bridgeStatus.lastCheckedAt}
          onRetry={handleRetry}
          retrying={retrying}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Card
              key={mod.key}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 group"
              onClick={() => navigate(mod.path)}
            >
              <CardContent className="flex items-start gap-4 p-5">
                <div className="rounded-lg bg-primary/10 p-2.5 group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold leading-none">{mod.label}</p>
                  <p className="text-sm text-muted-foreground">{mod.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
