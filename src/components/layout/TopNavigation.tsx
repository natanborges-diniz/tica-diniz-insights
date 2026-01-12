import { useNavigate } from "react-router-dom";
import { BarChart3, Package, ClipboardList, Wallet, Settings, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModuleKey } from "./AppLayout";

interface TopNavigationProps {
  activeModule: ModuleKey;
  onModuleChange: (module: ModuleKey) => void;
}

const modules: { key: ModuleKey; label: string; icon: React.ElementType; defaultPath: string }[] = [
  { key: "vendas", label: "Vendas", icon: BarChart3, defaultPath: "/vendas/metas" },
  { key: "estoque", label: "Estoque", icon: Package, defaultPath: "/estoque" },
  { key: "monitor", label: "Monitor", icon: ClipboardList, defaultPath: "/os" },
  { key: "financeiro", label: "Financeiro", icon: Wallet, defaultPath: "/financeiro" },
  { key: "config", label: "Configurações", icon: Settings, defaultPath: "/config/metas" },
];

export function TopNavigation({ activeModule, onModuleChange }: TopNavigationProps) {
  const navigate = useNavigate();

  const handleModuleClick = (module: typeof modules[0]) => {
    onModuleChange(module.key);
    navigate(module.defaultPath);
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
      </div>
    </header>
  );
}
