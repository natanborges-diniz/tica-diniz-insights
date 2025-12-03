import { useState, useEffect } from 'react';
import { format, startOfMonth } from 'date-fns';
import { SalesDashboardLayout } from '@/components/sales-dashboard/SalesDashboardLayout';
import { SalesFilters } from '@/components/sales-dashboard/SalesFilters';
import { SalesKPICards } from '@/components/sales-dashboard/SalesKPICards';
import { SellerChart } from '@/components/sales-dashboard/SellerChart';
import { SalesTable } from '@/components/sales-dashboard/SalesTable';
import { useResumoVendas } from '@/hooks/useResumoVendas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export default function SalesDashboard() {
  // Datas padrão: primeiro dia do mês atual até hoje
  const hoje = new Date();
  const primeiroDiaMes = startOfMonth(hoje);
  
  const [dataInicio, setDataInicio] = useState(format(primeiroDiaMes, 'yyyy-MM-dd'));
  const [dataFim, setDataFim] = useState(format(hoje, 'yyyy-MM-dd'));
  
  const { dados, isLoading, error, fetchData } = useResumoVendas();

  // Carregar dados ao montar o componente
  useEffect(() => {
    fetchData(dataInicio, dataFim);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    fetchData(dataInicio, dataFim);
  };

  return (
    <SalesDashboardLayout>
      <div className="space-y-6">
        {/* Filtros */}
        <SalesFilters
          dataInicio={dataInicio}
          dataFim={dataFim}
          onDataInicioChange={setDataInicio}
          onDataFimChange={setDataFim}
          onRefresh={handleRefresh}
          isLoading={isLoading}
        />

        {/* Erro */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* KPIs */}
        <SalesKPICards dados={dados} isLoading={isLoading} />

        {/* Gráfico */}
        <SellerChart dados={dados} isLoading={isLoading} />

        {/* Tabela */}
        <SalesTable dados={dados} isLoading={isLoading} />
      </div>
    </SalesDashboardLayout>
  );
}
