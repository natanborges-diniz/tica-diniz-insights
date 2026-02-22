import { useLocation, Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface BreadcrumbEntry {
  label: string;
  path?: string;
}

const routeMap: Record<string, BreadcrumbEntry[]> = {
  "/home": [],
  "/vendas": [{ label: "Vendas" }],
  "/vendas/familia": [{ label: "Vendas", path: "/vendas" }, { label: "Família" }],
  "/vendas/inteligencia": [{ label: "Vendas", path: "/vendas" }, { label: "Inteligência" }],
  "/estoque": [{ label: "Estoque" }],
  "/estoque/acoes": [{ label: "Estoque", path: "/estoque" }, { label: "O que Fazer?" }],
  "/estoque/otb": [{ label: "Estoque", path: "/estoque" }, { label: "Análise OTB" }],
  "/os": [{ label: "Monitor" }],
  "/os/pedido": [{ label: "Monitor", path: "/os" }, { label: "Pedido Fornecedor" }],
  "/os/tracking": [{ label: "Monitor", path: "/os" }, { label: "Tracking Hoya" }],
  "/financeiro": [{ label: "Financeiro" }],
  "/financeiro/dre": [{ label: "Financeiro", path: "/financeiro" }, { label: "DRE" }],
  "/financeiro/fluxo-caixa": [{ label: "Financeiro", path: "/financeiro" }, { label: "Fluxo de Caixa" }],
  "/ia": [{ label: "Central IA" }],
  "/config/metas": [{ label: "Configurações", path: "/config/metas" }, { label: "Metas e Calendário" }],
  "/admin/usuarios": [{ label: "Configurações", path: "/config/metas" }, { label: "Usuários" }],
  "/admin/fornecedores": [{ label: "Configurações", path: "/config/metas" }, { label: "Fornecedores" }],
  "/admin/sync": [{ label: "Configurações", path: "/config/metas" }, { label: "Sync & Reprocessamento" }],
  "/admin/health": [{ label: "Configurações", path: "/config/metas" }, { label: "Bridge Health" }],
  "/admin/pedidos": [{ label: "Configurações", path: "/config/metas" }, { label: "Auditoria de Pedidos" }],
  "/admin/hoya-config": [{ label: "Configurações", path: "/config/metas" }, { label: "Config Hoya" }],
};

export function AppBreadcrumbs() {
  const { pathname } = useLocation();
  const crumbs = routeMap[pathname];

  // Don't render for home or single-level routes
  if (!crumbs || crumbs.length <= 1) return null;

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <BreadcrumbItem key={crumb.label}>
              {isLast ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <>
                  <BreadcrumbLink asChild>
                    <Link to={crumb.path!}>{crumb.label}</Link>
                  </BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
