import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { BarChart3 } from 'lucide-react';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { KPICards } from '@/components/dashboard/KPICards';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { StoreChart } from '@/components/dashboard/StoreChart';
import { StoreRankingTable } from '@/components/dashboard/StoreRankingTable';
import { 
  useDashboardKPIs, 
  useVendasPorDia, 
  useVendasPorLoja, 
  useLojas 
} from '@/hooks/useDashboardData';

export default function Dashboard() {
  // Filtros - padrão: último mês
  const [dataInicio, setDataInicio] = useState(() => 
    format(subDays(new Date(), 30), 'yyyy-MM-dd')
  );
  const [dataFim, setDataFim] = useState(() => 
    format(new Date(), 'yyyy-MM-dd')
  );
  const [lojaId, setLojaId] = useState<number | undefined>(undefined);

  const filters = { dataInicio, dataFim, lojaId };

  // Queries
  const { data: lojas = [], isLoading: loadingLojas } = useLojas();
  const { data: kpis, isLoading: loadingKPIs, refetch: refetchKPIs } = useDashboardKPIs(filters);
  const { data: vendasPorDia = [], isLoading: loadingDia, refetch: refetchDia } = useVendasPorDia(filters);
  const { data: vendasPorLoja = [], isLoading: loadingLoja, refetch: refetchLoja } = useVendasPorLoja(filters);

  const isLoading = loadingKPIs || loadingDia || loadingLoja;

  const handleRefresh = () => {
    refetchKPIs();
    refetchDia();
    refetchLoja();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Dashboard de Gestão</h1>
              <p className="text-sm text-muted-foreground">
                Visão geral de vendas e performance das lojas
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filtros */}
        <DashboardFilters
          dataInicio={dataInicio}
          dataFim={dataFim}
          lojaId={lojaId}
          lojas={lojas}
          onDataInicioChange={setDataInicio}
          onDataFimChange={setDataFim}
          onLojaChange={setLojaId}
          onRefresh={handleRefresh}
          isLoading={isLoading}
        />

        {/* KPIs */}
        <KPICards
          faturamentoTotal={kpis?.faturamentoTotal || 0}
          quantidadeVendas={kpis?.quantidadeVendas || 0}
          ticketMedio={kpis?.ticketMedio || 0}
          lojasAtivas={kpis?.lojasAtivas || 0}
          isLoading={loadingKPIs}
        />

        {/* Gráficos */}
        <div className="grid gap-6 lg:grid-cols-3">
          <RevenueChart data={vendasPorDia} isLoading={loadingDia} />
          <StoreChart data={vendasPorLoja} isLoading={loadingLoja} />
        </div>

        {/* Tabela de Ranking */}
        <StoreRankingTable data={vendasPorLoja} isLoading={loadingLoja} />
      </main>
    </div>
  );
}
