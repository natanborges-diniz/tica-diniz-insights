import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import SalesDashboard from "./pages/SalesDashboard";
import VisaoEstoquePage from "./pages/estoque/VisaoEstoquePage";
import OQueFazerPage from "./pages/estoque/OQueFazerPage";
import AnaliseOTBPage from "./pages/estoque/AnaliseOTBPage";
import SalesFamilyDashboard from "./pages/SalesFamilyDashboard";
import OsDashboard from "./pages/OsDashboard";
import PedidoFornecedorPage from "./pages/PedidoFornecedorPage";

import FinanceiroDashboard from "./pages/FinanceiroDashboard";
import FinanceiroDreDashboard from "./pages/FinanceiroDreDashboard";
import FluxoCaixaDashboard from "./pages/FluxoCaixaDashboard";
import InteligenciaVendasDashboard from "./pages/InteligenciaVendasDashboard";
import MetasConfigDashboard from "./pages/MetasConfigDashboard";
import CentralIADashboard from "./pages/CentralIADashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Redirect root to default page */}
            <Route path="/" element={<Navigate to="/vendas" replace />} />
            
            {/* Vendas */}
            <Route path="/vendas" element={<SalesDashboard />} />
            <Route path="/vendas-familia" element={<SalesFamilyDashboard />} />
            <Route path="/vendas/inteligencia" element={<InteligenciaVendasDashboard />} />
            
            {/* Estoque */}
            <Route path="/estoque" element={<VisaoEstoquePage />} />
            <Route path="/estoque/acoes" element={<OQueFazerPage />} />
            <Route path="/estoque/otb" element={<AnaliseOTBPage />} />
            
            {/* Monitor */}
            <Route path="/os" element={<OsDashboard />} />
            <Route path="/os/pedido" element={<PedidoFornecedorPage />} />
            
            
            {/* Financeiro */}
            <Route path="/financeiro" element={<FinanceiroDashboard />} />
            <Route path="/financeiro/dre" element={<FinanceiroDreDashboard />} />
            <Route path="/financeiro/fluxo-caixa" element={<FluxoCaixaDashboard />} />
            
            {/* Config */}
            <Route path="/config/metas" element={<MetasConfigDashboard />} />
            
            {/* Central de IA */}
            <Route path="/ia" element={<CentralIADashboard />} />
          </Route>
          
          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
