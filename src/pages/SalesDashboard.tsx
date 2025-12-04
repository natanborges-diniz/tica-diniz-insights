import { useState, useEffect } from 'react';
import { format, startOfMonth } from 'date-fns';
import { SalesDashboardLayout } from '@/components/sales-dashboard/SalesDashboardLayout';
import { SalesFilters } from '@/components/sales-dashboard/SalesFilters';
import { SalesKPICards } from '@/components/sales-dashboard/SalesKPICards';
import { SellerChart } from '@/components/sales-dashboard/SellerChart';
import { SalesTable } from '@/components/sales-dashboard/SalesTable';
import { PaymentMethodsTable } from '@/components/sales-dashboard/PaymentMethodsTable';
import { PaymentMethodsChart } from '@/components/sales-dashboard/PaymentMethodsChart';
import { useResumoVendas } from '@/hooks/useResumoVendas';
import { useResumoFormasPagamento } from '@/hooks/useResumoFormasPagamento';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export default function SalesDashboard() {
  // Datas padrão: primeiro dia do mês atual até hoje
  const hoje = new Date();
  const primeiroDiaMes = startOfMonth(hoje);
  
  const [dataInicio, setDataInicio] = useState(format(primeiroDiaMes, 'yyyy-MM-dd'));
  const [dataFim, setDataFim] = useState(format(hoje, 'yyyy-MM-dd'));
  
  const { dados, isLoading, error, fetchData } = useResumoVendas();
  const { 
    dados: dadosFormasPagamento, 
    isLoading: isLoadingFormas, 
    error: errorFormas, 
    fetchData: fetchFormasPagamento 
  } = useResumoFormasPagamento();

  // Carregar dados ao montar o componente
  useEffect(() => {
    fetchData(dataInicio, dataFim);
    fetchFormasPagamento(dataInicio, dataFim);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    fetchData(dataInicio, dataFim);
    fetchFormasPagamento(dataInicio, dataFim);
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
          isLoading={isLoading || isLoadingFormas}
        />

        {/* Erros */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* KPIs */}
        <SalesKPICards dados={dados} isLoading={isLoading} />

        {/* Gráfico de Vendedores */}
        <SellerChart dados={dados} isLoading={isLoading} />

        {/* Tabela de Vendas */}
        <SalesTable dados={dados} isLoading={isLoading} />

        {/* Seção Formas de Pagamento */}
        {errorFormas && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorFormas}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <PaymentMethodsChart dados={dadosFormasPagamento} isLoading={isLoadingFormas} />
          <PaymentMethodsTable dados={dadosFormasPagamento} isLoading={isLoadingFormas} />
        </div>
      </div>
    </SalesDashboardLayout>
  );
}
