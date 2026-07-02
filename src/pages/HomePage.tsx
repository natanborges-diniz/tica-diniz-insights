import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Package, ClipboardList, Wallet, Settings, Brain, Loader2, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { BridgeStatusBanner } from "@/components/ui/bridge-status-banner";
import { useBridgeStatus } from "@/hooks/useBridgeStatus";
import { supabase } from "@/integrations/supabase/client";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { PAGES_BY_MODULE, findPageByPath } from "@/lib/pageCatalog";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { toast } from "sonner";

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
  {
    key: "comunicacao",
    label: "Comunicação",
    description: "CRM, atendimento e comunicação interna",
    icon: MessageSquare,
    path: "__cross_login__",
  },
] as const;

export default function HomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const bridgeStatus = useBridgeStatus();
  const { hasAnyPageInModule, hasPageAccess, isLoading: permLoading } = useModulePermissions();
  const [retrying, setRetrying] = useState(false);
  const [crossLogging, setCrossLogging] = useState(false);

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

  const handleCrossLogin = useCallback(async () => {
    setCrossLogging(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("cross-login", {
        body: { email: profile?.email },
      });
      if (error || !data?.url) {
        toast.error("Não foi possível acessar o módulo de Comunicação.");
        console.error("[cross-login]", error, data);
        return;
      }
      window.open(data.url, "_blank");
    } catch (err) {
      console.error("[cross-login]", err);
      toast.error("Erro ao conectar ao módulo de Comunicação.");
    } finally {
      setCrossLogging(false);
    }
  }, [profile?.email]);

  const handleModuleClick = useCallback((path: string) => {
    if (path === "__cross_login__") {
      handleCrossLogin();
    } else {
      navigate(path);
    }
  }, [navigate, handleCrossLogin]);

  const firstName = profile?.nome?.split(" ")[0] ?? profile?.email?.split("@")[0] ?? "Usuário";

  return (
    <div className="space-y-6">
      <ModuleHeader
        title={`Olá, ${firstName} 👋`}
        subtitle="Selecione um módulo para começar."
        accent={false}
        breadcrumb={false}
      />

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

      {permLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.filter((mod) => mod.key === "comunicacao" || hasAnyPageInModule(mod.key as any)).map((mod) => {
          const Icon = mod.icon;
          // Resolve target path: se path padrão não está liberado, cai na primeira página permitida do módulo
          const resolvedPath = (() => {
            if (mod.path === "__cross_login__") return mod.path;
            const defaultPage = findPageByPath(mod.path);
            if (defaultPage && hasPageAccess(defaultPage.key, mod.key as any)) return mod.path;
            const pages = PAGES_BY_MODULE[mod.key as keyof typeof PAGES_BY_MODULE] || [];
            const first = pages.find(p => hasPageAccess(p.key, mod.key as any));
            return first ? first.path : mod.path;
          })();
          return (
            <Card
              key={mod.key}
              role="button"
              tabIndex={0}
              aria-label={`Abrir módulo ${mod.label}`}
              className={`cursor-pointer hover:shadow-card-hover hover:border-primary/30 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${mod.path === "__cross_login__" && crossLogging ? "opacity-60 pointer-events-none" : ""}`}
              onClick={() => handleModuleClick(resolvedPath)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleModuleClick(resolvedPath);
                }
              }}
            >
              <CardContent className="flex items-start gap-4 p-5">
                <div className="rounded-lg bg-primary/10 p-2.5 group-hover:bg-primary/15 transition-colors duration-150">
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
      )}
    </div>
  );
}
