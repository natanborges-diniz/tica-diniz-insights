import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Package, ClipboardList, Wallet, Settings, Brain, LogOut, Shield, ShoppingCart, KeyRound } from "lucide-react";
import logoInfoco from "@/assets/logo-infoco.png";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { usePedidoAlertas } from "@/hooks/usePedidoAlertas";
import { PAGES_BY_MODULE, findPageByPath } from "@/lib/pageCatalog";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import type { ModuleKey } from "./AppLayout";

interface TopNavigationProps {
  activeModule: ModuleKey;
}

const allModules: { key: ModuleKey; label: string; icon: React.ElementType; defaultPath: string }[] = [
  { key: "vendas", label: "Vendas", icon: BarChart3, defaultPath: "/vendas" },
  { key: "compras", label: "Compras", icon: ShoppingCart, defaultPath: "/compras" },
  { key: "estoque", label: "Estoque", icon: Package, defaultPath: "/estoque" },
  { key: "monitor", label: "Monitor", icon: ClipboardList, defaultPath: "/os" },
  { key: "financeiro", label: "Financeiro", icon: Wallet, defaultPath: "/financeiro" },
  { key: "ia", label: "Central IA", icon: Brain, defaultPath: "/ia" },
  { key: "config", label: "Configurações", icon: Settings, defaultPath: "/config/metas" },
];

export function TopNavigation({ activeModule }: TopNavigationProps) {
  const navigate = useNavigate();
  const { profile, isAdmin, signOut } = useAuth();
  const { hasAnyPageInModule, hasPageAccess } = useModulePermissions();
  const { unacknowledgedCount } = usePedidoAlertas();
  const [passwordOpen, setPasswordOpen] = useState(false);

  const modules = allModules.filter(m => hasAnyPageInModule(m.key));

  const handleModuleClick = (module: typeof allModules[0]) => {
    // Se o path padrão não estiver liberado, envia para a primeira página permitida do módulo
    const defaultPage = findPageByPath(module.defaultPath);
    if (defaultPage && hasPageAccess(defaultPage.key, module.key)) {
      navigate(module.defaultPath);
      return;
    }
    const pages = PAGES_BY_MODULE[module.key] || [];
    const first = pages.find(p => hasPageAccess(p.key, module.key));
    navigate(first ? first.path : module.defaultPath);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-surface border-b-2 border-primary">
      <div className="flex h-14 items-center px-4 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-4">
          <button
            onClick={() => navigate("/home")}
            className="flex items-center rounded-lg p-1 hover:bg-muted transition-colors duration-150"
            aria-label="Ir para o início"
          >
            <img src={logoInfoco} alt="InFoco Optical Business" className="h-7 w-auto" />
          </button>
        </div>

        {/* Module Tabs */}
        <nav className="flex items-center gap-1" role="tablist" aria-label="Módulos do sistema">
          {modules.map((module) => {
            const Icon = module.icon;
            const isActive = activeModule === module.key;

            return (
              <button
                key={module.key}
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "true" : undefined}
                onClick={() => handleModuleClick(module)}
                className={cn(
                  "relative flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150",
                  "hover:bg-muted hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{module.label}</span>
                {/* Alert badge for Monitor module */}
                {module.key === "monitor" && unacknowledgedCount > 0 && (
                  <span className="flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold leading-none animate-pulse">
                    {unacknowledgedCount > 9 ? "9+" : unacknowledgedCount}
                  </span>
                )}
                {/* Active underline indicator */}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User area */}
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => navigate("/admin/usuarios")}
            >
              <Shield className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Admin</span>
            </Button>
          )}
          <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[150px]">
            {profile?.email}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPasswordOpen(true)} title="Alterar minha senha">
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSignOut} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </header>
  );
}
