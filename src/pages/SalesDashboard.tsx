import { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth } from 'date-fns';
import { SalesDashboardLayout } from '@/components/sales-dashboard/SalesDashboardLayout';
import { SalesFilters } from '@/components/sales-dashboard/SalesFilters';
import { SalesKPICards } from '@/components/sales-dashboard/SalesKPICards';
import { SellerChart } from '@/components/sales-dashboard/SellerChart';
import { SalesTable } from '@/components/sales-dashboard/SalesTable';
import { StoreChart } from '@/components/sales-dashboard/StoreChart';
import { StoreTable } from '@/components/sales-dashboard/StoreTable';
import { PaymentMethodsTable } from '@/components/sales-dashboard/PaymentMethodsTable';
import { PaymentMethodsChart } from '@/components/sales-dashboard/PaymentMethodsChart';
import { useResumoVendas } from '@/hooks/useResumoVendas';
import { useResumoFormasPagamento } from '@/hooks/useResumoFormasPagamento';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Building2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResumoEmpresaVendedor } from '@/services/firebirdBridge';

type ViewMode = 'loja' | 'vendedor';

interface ResumoLoja {
  EMPRESA: string;
  TOTALORIGINAL: number;
  TOTALVENDIDO: number;
  TICKETMEDIO: number;
  TOTALDEVOLUCAO: number;
  QTDTRANSACAO: number;
  QTDDEVOLUCAO: number;
}

function agruparPorLoja(dados: ResumoEmpresaVendedor[]): ResumoLoja[] {
  const mapa = new Map<string, ResumoLoja>();
  
  dados.forEach(d => {
    const existing = mapa.get(d.EMPRESA);
    if (existing) {
      existing.TOTALORIGINAL += d.TOTALORIGINAL || 0;
      existing.TOTALVENDIDO += d.TOTALVENDIDO || 0;
      existing.TOTALDEVOLUCAO += d.TOTALDEVOLUCAO || 0;
      existing.QTDTRANSACAO += d.QTDTRANSACAO || 0;
      existing.QTDDEVOLUCAO += d.QTDDEVOLUCAO || 0;
    } else {
      mapa.set(d.EMPRESA, {
        EMPRESA: d.EMPRESA,
        TOTALORIGINAL: d.TOTALORIGINAL || 0,
        TOTALVENDIDO: d.TOTALVENDIDO || 0,
        TICKETMEDIO: 0,
        TOTALDEVOLUCAO: d.TOTALDEVOLUCAO || 0,
        QTDTRANSACAO: d.QTDTRANSACAO || 0,
        QTDDEVOLUCAO: d.QTDDEVOLUCAO || 0,
      });
    }
  });

  // Calcular ticket médio
  return Array.from(mapa.values()).map(loja => ({
    ...loja,
    TICKETMEDIO: loja.QTDTRANSACAO > 0 ? loja.TOTALVENDIDO / loja.QTDTRANSACAO : 0,
  }));
}

export default function SalesDashboard() {
  const hoje = new Date();
  const primeiroDiaMes = startOfMonth(hoje);
  
  const [dataInicio, setDataInicio] = useState(format(primeiroDiaMes, 'yyyy-MM-dd'));
  const [dataFim, setDataFim] = useState(format(hoje, 'yyyy-MM-dd'));
  const [viewMode, setViewMode] = useState<ViewMode>('loja');
  
  const { dados, isLoading, error, fetchData } = useResumoVendas();
  const { 
    dados: dadosFormasPagamento, 
    isLoading: isLoadingFormas, 
    error: errorFormas, 
    fetchData: fetchFormasPagamento 
  } = useResumoFormasPagamento();

  const dadosPorLoja = useMemo(() => agruparPorLoja(dados), [dados]);

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

        {/* Toggle de Visão */}
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'loja' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('loja')}
          >
            <Building2 className="h-4 w-4 mr-2" />
            Por Loja
          </Button>
          <Button
            variant={viewMode === 'vendedor' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('vendedor')}
          >
            <Users className="h-4 w-4 mr-2" />
            Por Vendedor
          </Button>
        </div>

        {/* Erros */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* KPIs */}
        <SalesKPICards dados={dados} isLoading={isLoading} />

        {/* Gráfico e Tabela - Condicional por modo */}
        {viewMode === 'loja' ? (
          <>
            <StoreChart dados={dadosPorLoja} isLoading={isLoading} />
            <StoreTable dados={dadosPorLoja} isLoading={isLoading} />
          </>
        ) : (
          <>
            <SellerChart dados={dados} isLoading={isLoading} />
            <SalesTable dados={dados} isLoading={isLoading} />
          </>
        )}

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
