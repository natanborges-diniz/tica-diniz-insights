import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import SalesDashboard from "./pages/SalesDashboard";
import StockDashboard from "./pages/StockDashboard";
import SalesFamilyDashboard from "./pages/SalesFamilyDashboard";
import OsDashboard from "./pages/OsDashboard";
import FinanceiroDashboard from "./pages/FinanceiroDashboard";
import FinanceiroDreDashboard from "./pages/FinanceiroDreDashboard";
import FluxoCaixaDashboard from "./pages/FluxoCaixaDashboard";
import InteligenciaVendasDashboard from "./pages/InteligenciaVendasDashboard";
import MetasConfigDashboard from "./pages/MetasConfigDashboard";
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
            <Route path="/estoque" element={<StockDashboard />} />
            
            {/* Monitor */}
            <Route path="/os" element={<OsDashboard />} />
            
            {/* Financeiro */}
            <Route path="/financeiro" element={<FinanceiroDashboard />} />
            <Route path="/financeiro/dre" element={<FinanceiroDreDashboard />} />
            <Route path="/financeiro/fluxo-caixa" element={<FluxoCaixaDashboard />} />
            
            {/* Config */}
            <Route path="/config/metas" element={<MetasConfigDashboard />} />
          </Route>
          
          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
