import { useLocation } from "react-router-dom";
import { 
  TrendingUp, BarChart3, Layers, 
  Package, ClipboardList, Wallet, FileText, ArrowLeftRight,
  Target, Users, Brain, Eye, RefreshCw, Activity, Truck, FlaskConical,
  AlertTriangle, Landmark, CreditCard, Receipt, FileSearch, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";
import { usePedidoAlertas } from "@/hooks/usePedidoAlertas";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ModuleKey } from "./AppLayout";

interface AppSidebarProps {
  activeModule: ModuleKey;
}

interface MenuItem {
  title: string;
  url: string;
  icon: React.ElementType;
  disabled?: boolean;
}

interface MenuSection {
  label: string;
  items: MenuItem[];
}

const moduleMenus: Record<ModuleKey, MenuSection[]> = {
  vendas: [
    {
      label: "Análises",
      items: [
        { title: "Dashboard de Vendas", url: "/vendas", icon: BarChart3 },
        { title: "Vendas por Família", url: "/vendas/familia", icon: Layers },
      ],
    },
    {
      label: "Inteligência",
      items: [
        { title: "Inteligência de Vendas", url: "/vendas/inteligencia", icon: TrendingUp },
      ],
    },
  ],
  estoque: [
    {
      label: "Gestão de Estoque",
      items: [
        { title: "Visão Estoque", url: "/estoque", icon: Package },
        { title: "O que Fazer?", url: "/estoque/acoes", icon: ClipboardList },
        { title: "Análise OTB", url: "/estoque/otb", icon: Layers },
      ],
    },
  ],
  monitor: [
    {
      label: "Acompanhamento",
      items: [
        { title: "Tracking Hoya", url: "/os/tracking", icon: Truck },
        { title: "Tracking Zeiss", url: "/os/tracking-zeiss", icon: Package },
      ],
    },
  ],
  financeiro: [
    {
      label: "Análises",
      items: [
        { title: "Parcelas a Receber", url: "/financeiro", icon: Wallet },
        { title: "DRE", url: "/financeiro/dre", icon: FileText },
        { title: "Fluxo de Caixa", url: "/financeiro/fluxo-caixa", icon: ArrowLeftRight },
      ],
    },
    {
      label: "Banking BTG",
      items: [
        { title: "Pagamentos", url: "/financeiro/banking/pagamentos", icon: CreditCard },
        { title: "Cobranças / Boletos", url: "/financeiro/banking/cobrancas", icon: Receipt },
        { title: "Conciliação DDA", url: "/financeiro/banking/dda", icon: FileSearch },
        { title: "Extrato e Batimento", url: "/financeiro/banking/extrato", icon: Landmark },
      ],
    },
  ],
  ia: [
    {
      label: "Inteligência Artificial",
      items: [
        { title: "Central de IA", url: "/ia", icon: Brain },
      ],
    },
  ],
  config: [
    {
      label: "Configurações",
      items: [
        { title: "Metas e Calendário", url: "/config/metas", icon: Target },
        { title: "Usuários", url: "/admin/usuarios", icon: Users },
        { title: "Fornecedores", url: "/admin/fornecedores", icon: FlaskConical },
        { title: "Sync & Reprocessamento", url: "/admin/sync", icon: RefreshCw },
        { title: "Bridge Health", url: "/admin/health", icon: Activity },
        { title: "Validação BTG", url: "/admin/btg-validacao", icon: Shield },
      ],
    },
  ],
};

export function AppSidebar({ activeModule }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const sections = moduleMenus[activeModule] || [];
  const { unacknowledgedCount } = usePedidoAlertas();

  // Hide sidebar entirely for modules with no menu items
  if (sections.length === 0 || sections.every(s => s.items.length === 0)) {
    return null;
  }

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent className="pt-2">
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            {!collapsed && (
              <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive = location.pathname === item.url;
                  
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        disabled={item.disabled}
                        tooltip={collapsed ? item.title : undefined}
                      >
                        {item.disabled ? (
                          <span className="flex items-center gap-3 opacity-50 cursor-not-allowed">
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!collapsed && (
                              <span className="truncate">
                                {item.title}
                                <span className="ml-2 text-xs text-muted-foreground">(em breve)</span>
                              </span>
                            )}
                          </span>
                        ) : (
                          <NavLink
                            to={item.url}
                            className={cn(
                              "flex items-center gap-3 transition-colors duration-150 relative",
                              isActive && "border-l-2 border-primary pl-[10px]"
                            )}
                            activeClassName="bg-brand-soft text-primary font-medium"
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!collapsed && <span className="truncate">{item.title}</span>}
                            {/* Notification badge for Tracking Hoya */}
                            {item.url === "/os/tracking" && unacknowledgedCount > 0 && (
                              <span className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold animate-pulse">
                                {unacknowledgedCount > 9 ? "9+" : unacknowledgedCount}
                              </span>
                            )}
                          </NavLink>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
