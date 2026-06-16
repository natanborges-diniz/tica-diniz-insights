import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserEmpresas } from '@/hooks/useUserEmpresas';
import { useDefaultEmpresa } from '@/hooks/useDefaultEmpresa';
import { useAnaliseVendasFamilia } from '@/hooks/useAnaliseVendasFamilia';
import { SalesFamilyFilters } from '@/components/sales-family/SalesFamilyFilters';
import { SalesFamilyKPICards } from '@/components/sales-family/SalesFamilyKPICards';
import { SalesFamilyChart } from '@/components/sales-family/SalesFamilyChart';
import { SalesFamilyTable } from '@/components/sales-family/SalesFamilyTable';
import { exportSalesFamilyReport } from '@/utils/exportSalesFamilyReport';
import { toast } from 'sonner';

// Helper para obter o primeiro dia do mês atual
function getFirstDayOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

// Helper para obter a data de hoje
function getToday(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

export default function SalesFamilyDashboard() {
  // Estado de empresa — default do profile
  const { codEmpresa: profileEmpresa } = useDefaultEmpresa();
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<number | null>(null);

  const { empresas, isLoading: loadingEmpresas, error: errorEmpresas, canSeeAll } = useUserEmpresas();

  // Selecionar empresa do profile quando disponível
  const [dataInicio, setDataInicio] = useState(getFirstDayOfMonth);
  const [dataFim, setDataFim] = useState(getToday);

  // Estados de filtros internos
  const [filtroVendedor, setFiltroVendedor] = useState('TODOS');
  const [filtroFamilia, setFiltroFamilia] = useState('TODAS');
  const [filtroFornecedor, setFiltroFornecedor] = useState('TODOS');
  const [filtroBuscaTexto, setFiltroBuscaTexto] = useState('');

  // Selecionar empresa do profile (ou primeira disponível como fallback)
  useEffect(() => {
    if (!loadingEmpresas && !errorEmpresas && empresas.length > 0 && selectedEmpresaId === null) {
      // Prefere empresa do profile
      const profileMatch = profileEmpresa ? empresas.find(e => e.codEmpresa === profileEmpresa) : null;
      setSelectedEmpresaId(profileMatch ? profileMatch.codEmpresa : empresas[0].codEmpresa);
    }
  }, [empresas, loadingEmpresas, errorEmpresas, selectedEmpresaId, profileEmpresa]);

  // Limpar filtros ao trocar de empresa ou datas
  useEffect(() => {
    setFiltroVendedor('TODOS');
    setFiltroFamilia('TODAS');
    setFiltroFornecedor('TODOS');
    setFiltroBuscaTexto('');
  }, [selectedEmpresaId, dataInicio, dataFim]);

  // Hook de dados
  const { data, isLoading, error } = useAnaliseVendasFamilia({
    dataInicio,
    dataFim,
    empresa: selectedEmpresaId,
  });

  // Dados filtrados
  const filteredData = useMemo(() => {
    let result = data;

    if (filtroVendedor !== 'TODOS') {
      result = result.filter(item => item.vendedor === filtroVendedor);
    }

    if (filtroFamilia !== 'TODAS') {
      result = result.filter(item => item.familia === filtroFamilia);
    }

    if (filtroFornecedor !== 'TODOS') {
      result = result.filter(item => item.fornecedor === filtroFornecedor);
    }

    if (filtroBuscaTexto.trim()) {
      const termo = filtroBuscaTexto.toLowerCase();
      result = result.filter(
        item =>
          item.empresa?.toLowerCase().includes(termo) ||
          item.vendedor?.toLowerCase().includes(termo) ||
          item.familia?.toLowerCase().includes(termo) ||
          item.fornecedor?.toLowerCase().includes(termo)
      );
    }

    return result;
  }, [data, filtroVendedor, filtroFamilia, filtroFornecedor, filtroBuscaTexto]);

  // Ref do gráfico para captura no PDF
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleExportFullReport = async () => {
    try {
      setGeneratingPdf(true);
      const empresaNome =
        selectedEmpresaId === null
          ? 'Todas as Empresas'
          : empresas.find(e => e.codEmpresa === selectedEmpresaId)?.nome ?? '—';

      const faturamento = filteredData.reduce((a, i) => a + (i.totalVendido || 0), 0);
      const vendas = filteredData.reduce((a, i) => a + (i.qtdTransacao || 0), 0);
      const pecas = filteredData.reduce((a, i) => a + (i.qtdProdutos || 0), 0);

      await exportSalesFamilyReport({
        filename: `relatorio-vendas-familia-${new Date().toISOString().split('T')[0]}`,
        title: 'Relatório de Vendas por Família e Vendedor',
        subtitle: `${empresaNome} • ${dataInicio} a ${dataFim}`,
        filters: {
          empresa: empresaNome,
          dataInicio,
          dataFim,
          vendedor: filtroVendedor === 'TODOS' ? 'Todos' : filtroVendedor,
          familia: filtroFamilia === 'TODAS' ? 'Todas' : filtroFamilia,
          fornecedor: filtroFornecedor === 'TODOS' ? 'Todos' : filtroFornecedor,
          busca: filtroBuscaTexto,
        },
        kpis: {
          faturamento,
          vendas,
          pecas,
          ticketMedio: vendas > 0 ? faturamento / vendas : 0,
        },
        rows: filteredData,
        chartElement: chartRef.current,
      });
      toast.success('Relatório PDF gerado com sucesso');
    } catch (err) {
      console.error(err);
      toast.error('Falha ao gerar o relatório PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2 flex-1">
              <Users className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Vendas por Família e Vendedor</h1>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleExportFullReport}
              disabled={generatingPdf || isLoading || filteredData.length === 0}
            >
              <FileDown className="h-4 w-4 mr-2" />
              {generatingPdf ? 'Gerando…' : 'Relatório PDF'}
            </Button>
          </div>
        </div>
      </header>


      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Loading Empresas */}
        {loadingEmpresas && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Carregando empresas...</p>
            </div>
          </div>
        )}

        {/* Erro ao carregar empresas */}
        {errorEmpresas && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive font-medium">Erro ao carregar lista de empresas</p>
              <p className="text-sm text-muted-foreground mt-1">{errorEmpresas}</p>
            </CardContent>
          </Card>
        )}

        {/* Conteúdo quando empresas carregadas */}
        {!loadingEmpresas && !errorEmpresas && empresas.length > 0 && (
          <>
            {/* Filtros */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Filtros</CardTitle>
              </CardHeader>
              <CardContent>
                <SalesFamilyFilters
                  empresas={empresas}
                  selectedEmpresaId={selectedEmpresaId}
                  onEmpresaChange={setSelectedEmpresaId}
                  canSeeAll={canSeeAll}
                  dataInicio={dataInicio}
                  dataFim={dataFim}
                  onDataInicioChange={setDataInicio}
                  onDataFimChange={setDataFim}
                  dados={data}
                  filtroVendedor={filtroVendedor}
                  setFiltroVendedor={setFiltroVendedor}
                  filtroFamilia={filtroFamilia}
                  setFiltroFamilia={setFiltroFamilia}
                  filtroFornecedor={filtroFornecedor}
                  setFiltroFornecedor={setFiltroFornecedor}
                  filtroBuscaTexto={filtroBuscaTexto}
                  setFiltroBuscaTexto={setFiltroBuscaTexto}
                />
              </CardContent>
            </Card>

            {/* Loading Dados */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Carregando dados de vendas...</p>
                </div>
              </div>
            )}

            {/* Erro Dados */}
            {error && (
              <Card className="border-destructive">
                <CardContent className="pt-6">
                  <p className="text-destructive font-medium">Erro ao carregar dados</p>
                  <p className="text-sm text-muted-foreground mt-1">{error}</p>
                </CardContent>
              </Card>
            )}

            {/* Conteúdo quando dados carregados */}
            {!isLoading && !error && (
              <>
                <SalesFamilyKPICards dados={filteredData} />
                <SalesFamilyChart dados={filteredData} />
                <Card>
                  <CardHeader>
                    <CardTitle>Detalhamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SalesFamilyTable dados={filteredData} />
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}

        {/* Sem empresas */}
        {!loadingEmpresas && !errorEmpresas && empresas.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">Nenhuma empresa encontrada</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
