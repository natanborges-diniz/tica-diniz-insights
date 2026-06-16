import { useLocation } from "react-router-dom";
import { 
  TrendingUp, BarChart3, Layers, Wallet,
  Package, ClipboardList, FileText, ArrowLeftRight,
  Target, Users, Brain, RefreshCw, Activity, Truck, FlaskConical,
  Landmark, CreditCard, Receipt, FileSearch, Shield, Link2, Settings2,
  ShoppingCart
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
  SidebarRail,
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
  compras: [
    {
      label: "Compras",
      items: [
        { title: "Compras por Fornecedor", url: "/compras", icon: ShoppingCart },
      ],
    },
  ],
  estoque: [
    {
      label: "Gestão de Estoque",
      items: [
        { title: "Visão Estoque", url: "/estoque", icon: Package },
        { title: "Plano de Compra", url: "/estoque/otb", icon: Layers },
        { title: "Plano Mensal", url: "/estoque/plano-mensal", icon: ClipboardList },
        { title: "Histórico de Planos", url: "/estoque/planos-historico", icon: FileText },
        { title: "Capacidade Expositor", url: "/estoque/capacidades", icon: Settings2 },
      ],
    },
  ],
  monitor: [
    {
      label: "Acompanhamento",
      items: [
        { title: "Tracking Hoya", url: "/os/tracking", icon: Truck },
        { title: "Tracking Zeiss", url: "/os/tracking-zeiss", icon: Package },
        { title: "Tracking Haytek", url: "/os/tracking-haytek", icon: Package },
      ],
    },
  ],
  financeiro: [
    {
      label: "Visão Geral",
      items: [
        { title: "Overview Financeiro", url: "/financeiro/overview", icon: Landmark },
      ],
    },
    {
      label: "Hub Financeiro",
      items: [
        { title: "Contas a Pagar", url: "/financeiro/hub", icon: Landmark },
        { title: "Conciliação Cartões", url: "/financeiro/cartoes", icon: CreditCard },
        { title: "Carteira Recebíveis", url: "/financeiro/recebiveis", icon: Wallet },
        { title: "Links de Pagamento", url: "/financeiro/links-pagamento", icon: Link2 },
        { title: "Plano de Contas", url: "/financeiro/plano-contas", icon: Settings2 },
      ],
    },
    {
      label: "Análises",
      items: [
        { title: "Parcelas ERP", url: "/financeiro/parcelas", icon: Wallet },
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
        { title: "Adquirentes", url: "/admin/adquirentes", icon: CreditCard },
      ],
    },
  ],
  comunicacao: [],
};

export function AppSidebar({ activeModule }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const sections = moduleMenus[activeModule] || [];
  const { countByFornecedor } = usePedidoAlertas();

  const getBadgeCount = (url: string): number => {
    if (url === "/os/tracking") return countByFornecedor["HOYA"] || 0;
    if (url === "/os/tracking-zeiss") return countByFornecedor["ZEISS"] || 0;
    if (url === "/os/tracking-haytek") return countByFornecedor["HAYTEK"] || 0;
    return 0;
  };

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
                            {/* Notification badge for tracking pages */}
                            {getBadgeCount(item.url) > 0 && (
                              <span className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold animate-pulse">
                                {getBadgeCount(item.url) > 9 ? "9+" : getBadgeCount(item.url)}
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
      <SidebarRail />
    </Sidebar>
  );
}
