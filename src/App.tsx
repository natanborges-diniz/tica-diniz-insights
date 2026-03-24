import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import ModuleGuard from "@/components/auth/ModuleGuard";
import LoginPage from "@/components/auth/LoginPage";
import { AppLayout } from "@/components/layout/AppLayout";
import HomePage from "./pages/HomePage";
import SalesDashboard from "./pages/SalesDashboard";
import VisaoEstoquePage from "./pages/estoque/VisaoEstoquePage";
import OQueFazerPage from "./pages/estoque/OQueFazerPage";
import AnaliseOTBPage from "./pages/estoque/AnaliseOTBPage";
import SalesFamilyDashboard from "./pages/SalesFamilyDashboard";
import OsDashboard from "./pages/OsDashboard";
import PedidoFornecedorPage from "./pages/PedidoFornecedorPage";
import HoyaTrackingPage from "./pages/HoyaTrackingPage";
import PedidoZeissPage from "./pages/PedidoZeissPage";
import ZeissTrackingPage from "./pages/ZeissTrackingPage";
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
import FinanceiroClassificacaoPage from "./pages/FinanceiroClassificacaoPage";
import FinanceiroOverviewPage from "./pages/FinanceiroOverviewPage";
import InteligenciaVendasDashboard from "./pages/InteligenciaVendasDashboard";
import MetasConfigDashboard from "./pages/MetasConfigDashboard";
import CentralIADashboard from "./pages/CentralIADashboard";
import AdminUsuariosPage from "./pages/AdminUsuariosPage";
import AdminSyncPage from "./pages/AdminSyncPage";
import AdminHealthPage from "./pages/AdminHealthPage";
import AdminPedidosAuditoriaPage from "./pages/AdminPedidosAuditoriaPage";
import AdminHoyaConfigPage from "./pages/AdminHoyaConfigPage";
import AdminFornecedoresPage from "./pages/AdminFornecedoresPage";
import AdminBtgValidacaoPage from "./pages/AdminBtgValidacaoPage";
import AdminAdquirentesPage from "./pages/AdminAdquirentesPage";
import SystemPlayground from "./pages/_SystemPlayground";
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
                  <Route path="/estoque" element={<VisaoEstoquePage />} />
                  <Route path="/estoque/acoes" element={<OQueFazerPage />} />
                  <Route path="/estoque/otb" element={<AnaliseOTBPage />} />
                </Route>

                {/* Monitor */}
                <Route element={<ModuleGuard module="monitor" />}>
                  <Route path="/os" element={<OsDashboard />} />
                  <Route path="/os/pedido" element={<PedidoFornecedorPage />} />
                  <Route path="/os/tracking" element={<HoyaTrackingPage />} />
                  <Route path="/os/pedido-zeiss" element={<PedidoZeissPage />} />
                  <Route path="/os/tracking-zeiss" element={<ZeissTrackingPage />} />
                </Route>

                {/* Financeiro */}
                <Route element={<ModuleGuard module="financeiro" />}>
                  <Route path="/financeiro" element={<Navigate to="/financeiro/overview" replace />} />
                  <Route path="/financeiro/overview" element={<FinanceiroOverviewPage />} />
                  <Route path="/financeiro/hub" element={<FinanceiroHubPage />} />
                  <Route path="/financeiro/cartoes" element={<ConciliacaoCartoesPage />} />
                  <Route path="/financeiro/links-pagamento" element={<PaymentLinksPage />} />
                  <Route path="/financeiro/classificacao" element={<FinanceiroClassificacaoPage />} />
                  <Route path="/financeiro/dre" element={<FinanceiroDreDashboard />} />
                  <Route path="/financeiro/fluxo-caixa" element={<FluxoCaixaDashboard />} />
                  <Route path="/financeiro/banking/extrato" element={<BankingExtratoDashboard />} />
                  <Route path="/financeiro/banking/pagamentos" element={<BankingPagamentosDashboard />} />
                  <Route path="/financeiro/banking/cobrancas" element={<BankingCobrancasDashboard />} />
                  <Route path="/financeiro/banking/dda" element={<BankingDdaDashboard />} />
                </Route>

                {/* Config */}
                <Route element={<ModuleGuard module="config" />}>
                  <Route path="/config/metas" element={<MetasConfigDashboard />} />
                </Route>

                {/* Admin */}
                <Route path="/admin/usuarios" element={<AdminUsuariosPage />} />
                <Route path="/admin/sync" element={<AdminSyncPage />} />
                <Route path="/admin/health" element={<AdminHealthPage />} />
                <Route path="/admin/pedidos" element={<AdminPedidosAuditoriaPage />} />
                <Route path="/admin/hoya-config" element={<AdminHoyaConfigPage />} />
                <Route path="/admin/fornecedores" element={<AdminFornecedoresPage />} />
                <Route path="/admin/btg-validacao" element={<AdminBtgValidacaoPage />} />
                <Route path="/admin/adquirentes" element={<AdminAdquirentesPage />} />

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
