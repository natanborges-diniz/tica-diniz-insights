import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import ModuleGuard from "@/components/auth/ModuleGuard";
import AdminGuard from "@/components/auth/AdminGuard";
import LoginPage from "@/components/auth/LoginPage";
import { AppLayout } from "@/components/layout/AppLayout";
import HomePage from "./pages/HomePage";
import SalesDashboard from "./pages/SalesDashboard";
import VisaoEstoquePage from "./pages/estoque/VisaoEstoquePage";
import AnaliseOTBPage from "./pages/estoque/AnaliseOTBPage";
import CapacidadesExpositorPage from "./pages/estoque/CapacidadesExpositorPage";
import PlanoMensalPage from "./pages/estoque/PlanoMensalPage";
import PlanoHistoricoPage from "./pages/estoque/PlanoHistoricoPage";
import { EstoqueErrorBoundary } from "@/components/estoque/EstoqueErrorBoundary";
import SalesFamilyDashboard from "./pages/SalesFamilyDashboard";
import OsDashboard from "./pages/OsDashboard";
import PedidoFornecedorPage from "./pages/PedidoFornecedorPage";
import HoyaTrackingPage from "./pages/HoyaTrackingPage";
import PedidoZeissPage from "./pages/PedidoZeissPage";
import PedidoHaytekPage from "./pages/PedidoHaytekPage";
import ZeissTrackingPage from "./pages/ZeissTrackingPage";
import HaytekTrackingPage from "./pages/HaytekTrackingPage";
import FinanceiroDashboard from "./pages/FinanceiroDashboard";
import FinanceiroDreDashboard from "./pages/FinanceiroDreDashboard";
import FluxoCaixaDashboard from "./pages/FluxoCaixaDashboard";
import BankingExtratoDashboard from "./pages/BankingExtratoDashboard";
import BankingPagamentosDashboard from "./pages/BankingPagamentosDashboard";
import BankingCobrancasDashboard from "./pages/BankingCobrancasDashboard";
import BankingDdaDashboard from "./pages/BankingDdaDashboard";
import FinanceiroHubPage from "./pages/FinanceiroHubPage";
import ConciliacaoCartoesPage from "./pages/ConciliacaoCartoesPage";
import PaymentLinksPage from "./pages/PaymentLinksPage";
import CarteiraRecebiveisPage from "./pages/CarteiraRecebiveisPage";

import FinanceiroOverviewPage from "./pages/FinanceiroOverviewPage";
import InteligenciaVendasDashboard from "./pages/InteligenciaVendasDashboard";
import MetasConfigDashboard from "./pages/MetasConfigDashboard";
import CentralIADashboard from "./pages/CentralIADashboard";
import AdminUsuariosPage from "./pages/AdminUsuariosPage";
import AdminSyncPage from "./pages/AdminSyncPage";
import AdminHealthPage from "./pages/AdminHealthPage";
import AdminPedidosAuditoriaPage from "./pages/AdminPedidosAuditoriaPage";
import AdminHoyaConfigPage from "./pages/AdminHoyaConfigPage";
import AdminHaytekConfigPage from "./pages/AdminHaytekConfigPage";
import AdminFornecedoresPage from "./pages/AdminFornecedoresPage";
import AdminBtgValidacaoPage from "./pages/AdminBtgValidacaoPage";
import AdminAdquirentesPage from "./pages/AdminAdquirentesPage";
import AdminDreConfigPage from "./pages/AdminDreConfigPage";
import SystemPlayground from "./pages/_SystemPlayground";
import CheckoutPage from "./pages/CheckoutPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/pay/:linkId" element={<CheckoutPage />} />

            {/* Protected */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/home" replace />} />
                <Route path="/home" element={<HomePage />} />

                {/* Vendas */}
                <Route element={<ModuleGuard module="vendas" />}>
                  <Route path="/vendas" element={<SalesDashboard />} />
                  <Route path="/vendas/familia" element={<SalesFamilyDashboard />} />
                  <Route path="/vendas-familia" element={<Navigate to="/vendas/familia" replace />} />
                  <Route path="/vendas/inteligencia" element={<InteligenciaVendasDashboard />} />
                </Route>

                {/* Estoque */}
                <Route element={<ModuleGuard module="estoque" />}>
                  <Route path="/estoque" element={<EstoqueErrorBoundary><VisaoEstoquePage /></EstoqueErrorBoundary>} />
                  <Route path="/estoque/otb" element={<EstoqueErrorBoundary><AnaliseOTBPage /></EstoqueErrorBoundary>} />
                  <Route path="/estoque/capacidades" element={<CapacidadesExpositorPage />} />
                  <Route path="/estoque/plano-mensal" element={<PlanoMensalPage />} />
                  <Route path="/estoque/planos-historico" element={<PlanoHistoricoPage />} />
                </Route>

                {/* Monitor */}
                <Route element={<ModuleGuard module="monitor" />}>
                  <Route path="/os" element={<OsDashboard />} />
                  <Route path="/os/pedido" element={<PedidoFornecedorPage />} />
                  <Route path="/os/tracking" element={<HoyaTrackingPage />} />
                  <Route path="/os/pedido-zeiss" element={<PedidoZeissPage />} />
                  <Route path="/os/tracking-zeiss" element={<ZeissTrackingPage />} />
                  <Route path="/os/pedido-haytek" element={<PedidoHaytekPage />} />
                  <Route path="/os/tracking-haytek" element={<HaytekTrackingPage />} />
                </Route>

                {/* Financeiro */}
                <Route element={<ModuleGuard module="financeiro" />}>
                  <Route path="/financeiro" element={<Navigate to="/financeiro/overview" replace />} />
                  <Route path="/financeiro/parcelas" element={<FinanceiroDashboard />} />
                  <Route path="/financeiro/overview" element={<FinanceiroOverviewPage />} />
                  <Route path="/financeiro/hub" element={<FinanceiroHubPage />} />
                  <Route path="/financeiro/cartoes" element={<ConciliacaoCartoesPage />} />
                  <Route path="/financeiro/links-pagamento" element={<PaymentLinksPage />} />
                  <Route path="/financeiro/recebiveis" element={<CarteiraRecebiveisPage />} />
                  <Route path="/financeiro/classificacao" element={<Navigate to="/financeiro/hub" replace />} />
                  <Route path="/financeiro/dre" element={<FinanceiroDreDashboard />} />
                  <Route path="/financeiro/fluxo-caixa" element={<FluxoCaixaDashboard />} />
                  <Route path="/financeiro/plano-contas" element={<AdminDreConfigPage />} />
                  <Route path="/financeiro/banking/extrato" element={<BankingExtratoDashboard />} />
                  <Route path="/financeiro/banking/pagamentos" element={<BankingPagamentosDashboard />} />
                  <Route path="/financeiro/banking/cobrancas" element={<BankingCobrancasDashboard />} />
                  <Route path="/financeiro/banking/dda" element={<BankingDdaDashboard />} />
                </Route>

                {/* Config */}
                <Route element={<ModuleGuard module="config" />}>
                  <Route path="/config/metas" element={<MetasConfigDashboard />} />
                </Route>

                {/* Admin (protegido por role admin) */}
                <Route element={<AdminGuard />}>
                  <Route path="/admin/usuarios" element={<AdminUsuariosPage />} />
                  <Route path="/admin/sync" element={<AdminSyncPage />} />
                  <Route path="/admin/health" element={<AdminHealthPage />} />
                  <Route path="/admin/pedidos" element={<AdminPedidosAuditoriaPage />} />
                  <Route path="/admin/hoya-config" element={<AdminHoyaConfigPage />} />
                  <Route path="/admin/haytek-config" element={<AdminHaytekConfigPage />} />
                  <Route path="/admin/fornecedores" element={<AdminFornecedoresPage />} />
                  <Route path="/admin/btg-validacao" element={<AdminBtgValidacaoPage />} />
                  <Route path="/admin/adquirentes" element={<AdminAdquirentesPage />} />
                </Route>
                {/* Redirect legacy route */}
                <Route path="/admin/dre-config" element={<Navigate to="/financeiro/plano-contas" replace />} />

                {/* Dev playground — system design */}
                <Route path="/dev/playground" element={<SystemPlayground />} />

                {/* Central de IA */}
                <Route element={<ModuleGuard module="ia" />}>
                  <Route path="/ia" element={<CentralIADashboard />} />
                </Route>
              </Route>
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
