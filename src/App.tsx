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
import FinanceiroDashboard from "./pages/FinanceiroDashboard";
import FinanceiroDreDashboard from "./pages/FinanceiroDreDashboard";
import FluxoCaixaDashboard from "./pages/FluxoCaixaDashboard";
import BankingExtratoDashboard from "./pages/BankingExtratoDashboard";
import InteligenciaVendasDashboard from "./pages/InteligenciaVendasDashboard";
import MetasConfigDashboard from "./pages/MetasConfigDashboard";
import CentralIADashboard from "./pages/CentralIADashboard";
import AdminUsuariosPage from "./pages/AdminUsuariosPage";
import AdminSyncPage from "./pages/AdminSyncPage";
import AdminHealthPage from "./pages/AdminHealthPage";
import AdminPedidosAuditoriaPage from "./pages/AdminPedidosAuditoriaPage";
import AdminHoyaConfigPage from "./pages/AdminHoyaConfigPage";
import AdminFornecedoresPage from "./pages/AdminFornecedoresPage";
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
                </Route>

                {/* Financeiro */}
                <Route element={<ModuleGuard module="financeiro" />}>
                  <Route path="/financeiro" element={<FinanceiroDashboard />} />
                  <Route path="/financeiro/dre" element={<FinanceiroDreDashboard />} />
                  <Route path="/financeiro/fluxo-caixa" element={<FluxoCaixaDashboard />} />
                  <Route path="/financeiro/banking/extrato" element={<BankingExtratoDashboard />} />
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
