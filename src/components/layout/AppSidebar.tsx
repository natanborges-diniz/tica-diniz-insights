import { useLocation } from "react-router-dom";
import { 
  TrendingUp, Store, Trophy, BarChart3, Layers, 
  Package, ClipboardList, Wallet, FileText, ArrowLeftRight,
  Target, Calendar, Users
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
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
      label: "Inteligência",
      items: [
        { title: "Acompanhamento de Metas", url: "/vendas/metas", icon: TrendingUp },
        { title: "Ranking de Lojas", url: "/ranking-lojas", icon: Store },
        { title: "Ranking de Vendedores", url: "/ranking-vendedores", icon: Trophy },
      ],
    },
    {
      label: "Análises",
      items: [
        { title: "Dashboard de Vendas", url: "/vendas", icon: BarChart3 },
        { title: "Vendas por Família", url: "/vendas-familia", icon: Layers },
      ],
    },
  ],
  estoque: [
    {
      label: "Análises",
      items: [
        { title: "Painel de Estoque", url: "/estoque", icon: Package },
      ],
    },
  ],
  monitor: [
    {
      label: "Operações",
      items: [
        { title: "Monitor de OS", url: "/os", icon: ClipboardList },
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
  ],
  config: [
    {
      label: "Configurações",
      items: [
        { title: "Metas e Calendário", url: "/config/metas", icon: Target },
        { title: "Usuários", url: "/config/usuarios", icon: Users, disabled: true },
      ],
    },
  ],
};

export function AppSidebar({ activeModule }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const sections = moduleMenus[activeModule] || [];

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent className="pt-2">
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            {!collapsed && (
              <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
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
                            className="flex items-center gap-3"
                            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!collapsed && <span className="truncate">{item.title}</span>}
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
