import { useNavigate } from "react-router-dom";
import { BarChart3, Package, ClipboardList, Wallet, Settings, Database, Brain, LogOut, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import type { ModuleKey } from "./AppLayout";

interface TopNavigationProps {
  activeModule: ModuleKey;
  onModuleChange: (module: ModuleKey) => void;
}

const allModules: { key: ModuleKey; label: string; icon: React.ElementType; defaultPath: string }[] = [
  { key: "vendas", label: "Vendas", icon: BarChart3, defaultPath: "/vendas" },
  { key: "estoque", label: "Estoque", icon: Package, defaultPath: "/estoque" },
  { key: "monitor", label: "Monitor", icon: ClipboardList, defaultPath: "/os" },
  { key: "financeiro", label: "Financeiro", icon: Wallet, defaultPath: "/financeiro" },
  { key: "ia", label: "Central IA", icon: Brain, defaultPath: "/ia" },
  { key: "config", label: "Configurações", icon: Settings, defaultPath: "/config/metas" },
];

export function TopNavigation({ activeModule, onModuleChange }: TopNavigationProps) {
  const navigate = useNavigate();
  const { profile, isAdmin, signOut } = useAuth();
  const { hasAccess } = useModulePermissions();

  const modules = allModules.filter(m => hasAccess(m.key));

  const handleModuleClick = (module: typeof allModules[0]) => {
    onModuleChange(module.key);
    navigate(module.defaultPath);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-4">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <span className="font-semibold text-sm hidden sm:inline">Sistema de Gestão</span>
        </div>

        {/* Module Tabs */}
        <nav className="flex items-center gap-1">
          {modules.map((module) => {
            const Icon = module.icon;
            const isActive = activeModule === module.key;

            return (
              <button
                key={module.key}
                onClick={() => handleModuleClick(module)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{module.label}</span>
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSignOut} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
