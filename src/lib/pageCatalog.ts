// Catálogo central de páginas para permissões granulares.
// page_key é o identificador persistido em user_page_permissions.
import type { ModuleKey } from "@/components/layout/AppLayout";

export interface PageEntry {
  key: string;
  module: ModuleKey;
  title: string;
  path: string;
}

export const PAGE_CATALOG: PageEntry[] = [
  // Vendas
  { key: "vendas.dashboard", module: "vendas", title: "Dashboard de Vendas", path: "/vendas" },
  { key: "vendas.familia", module: "vendas", title: "Vendas por Família", path: "/vendas/familia" },
  { key: "vendas.inteligencia", module: "vendas", title: "Inteligência de Vendas", path: "/vendas/inteligencia" },
  // Compras
  { key: "compras.fornecedor", module: "compras", title: "Compras por Fornecedor", path: "/compras" },
  // Estoque
  { key: "estoque.visao", module: "estoque", title: "Visão Estoque", path: "/estoque" },
  { key: "estoque.otb", module: "estoque", title: "Plano de Compra", path: "/estoque/otb" },
  { key: "estoque.plano-mensal", module: "estoque", title: "Plano Mensal", path: "/estoque/plano-mensal" },
  { key: "estoque.planos-historico", module: "estoque", title: "Histórico de Planos", path: "/estoque/planos-historico" },
  { key: "estoque.capacidades", module: "estoque", title: "Capacidade Expositor", path: "/estoque/capacidades" },
  // Monitor
  { key: "monitor.tracking-hoya", module: "monitor", title: "Tracking Hoya", path: "/os/tracking" },
  { key: "monitor.tracking-zeiss", module: "monitor", title: "Tracking Zeiss", path: "/os/tracking-zeiss" },
  { key: "monitor.tracking-haytek", module: "monitor", title: "Tracking Haytek", path: "/os/tracking-haytek" },
  // Financeiro
  { key: "financeiro.overview", module: "financeiro", title: "Overview Financeiro", path: "/financeiro/overview" },
  { key: "financeiro.hub", module: "financeiro", title: "Contas a Pagar", path: "/financeiro/hub" },
  { key: "financeiro.cartoes", module: "financeiro", title: "Conciliação Cartões", path: "/financeiro/cartoes" },
  { key: "financeiro.recebiveis", module: "financeiro", title: "Carteira Recebíveis", path: "/financeiro/recebiveis" },
  { key: "financeiro.links-pagamento", module: "financeiro", title: "Links de Pagamento", path: "/financeiro/links-pagamento" },
  { key: "financeiro.plano-contas", module: "financeiro", title: "Plano de Contas", path: "/financeiro/plano-contas" },
  { key: "financeiro.parcelas", module: "financeiro", title: "Parcelas ERP", path: "/financeiro/parcelas" },
  { key: "financeiro.dre", module: "financeiro", title: "DRE", path: "/financeiro/dre" },
  { key: "financeiro.fluxo-caixa", module: "financeiro", title: "Fluxo de Caixa", path: "/financeiro/fluxo-caixa" },
  { key: "financeiro.banking-pagamentos", module: "financeiro", title: "Banking · Pagamentos", path: "/financeiro/banking/pagamentos" },
  { key: "financeiro.banking-cobrancas", module: "financeiro", title: "Banking · Cobranças", path: "/financeiro/banking/cobrancas" },
  { key: "financeiro.banking-dda", module: "financeiro", title: "Banking · DDA", path: "/financeiro/banking/dda" },
  { key: "financeiro.banking-extrato", module: "financeiro", title: "Banking · Extrato", path: "/financeiro/banking/extrato" },
  // IA
  { key: "ia.central", module: "ia", title: "Central de IA", path: "/ia" },
  // Config
  { key: "config.metas", module: "config", title: "Metas e Calendário", path: "/config/metas" },
  { key: "config.usuarios", module: "config", title: "Usuários", path: "/admin/usuarios" },
  { key: "config.fornecedores", module: "config", title: "Fornecedores", path: "/admin/fornecedores" },
  { key: "config.sync", module: "config", title: "Sync & Reprocessamento", path: "/admin/sync" },
  { key: "config.health", module: "config", title: "Bridge Health", path: "/admin/health" },
  { key: "config.btg-validacao", module: "config", title: "Validação BTG", path: "/admin/btg-validacao" },
  { key: "config.adquirentes", module: "config", title: "Adquirentes", path: "/admin/adquirentes" },
];

export const PAGES_BY_MODULE: Record<ModuleKey, PageEntry[]> = PAGE_CATALOG.reduce(
  (acc, p) => {
    (acc[p.module] ||= []).push(p);
    return acc;
  },
  {} as Record<ModuleKey, PageEntry[]>
);

export function findPageByPath(pathname: string): PageEntry | undefined {
  // Match exato primeiro, depois prefixo
  return (
    PAGE_CATALOG.find((p) => p.path === pathname) ||
    PAGE_CATALOG.find((p) => pathname.startsWith(p.path + "/"))
  );
}
