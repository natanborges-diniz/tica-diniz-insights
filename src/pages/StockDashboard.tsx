import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnaliseEstoque } from '@/hooks/useAnaliseEstoque';
import { useEmpresas } from '@/hooks/useEmpresas';
import { StockKPICards } from '@/components/stock-dashboard/StockKPICards';
import { StockTable } from '@/components/stock-dashboard/StockTable';
import { StockActionChart } from '@/components/stock-dashboard/StockActionChart';

export default function StockDashboard() {
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<number | null>(null);
  const { empresas, isLoading: loadingEmpresas, error: errorEmpresas } = useEmpresas();
  const { dados, isLoading, error, fetchData } = useAnaliseEstoque();

  // Selecionar primeira empresa quando carregar a lista
  useEffect(() => {
    if (!loadingEmpresas && !errorEmpresas && empresas.length > 0 && selectedEmpresaId === null) {
      setSelectedEmpresaId(empresas[0].COD_EMPRESA);
    }
  }, [empresas, loadingEmpresas, errorEmpresas, selectedEmpresaId]);

  // Buscar dados de estoque quando empresa selecionada mudar
  useEffect(() => {
    if (selectedEmpresaId !== null) {
      fetchData(selectedEmpresaId);
    }
  }, [selectedEmpresaId, fetchData]);

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
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Painel de Estoque / OTB</h1>
            </div>
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
            {/* Filtro de Loja */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Selecione a Loja</CardTitle>
              </CardHeader>
              <CardContent>
                <select
                  value={selectedEmpresaId ?? ''}
                  onChange={(e) => setSelectedEmpresaId(Number(e.target.value))}
                  className="w-full max-w-xs px-3 py-2 border rounded-md bg-background"
                >
                  {empresas.map((emp) => (
                    <option key={emp.COD_EMPRESA} value={emp.COD_EMPRESA}>
                      {emp.COD_EMPRESA} - {emp.EMPRESA}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>

            {/* Loading Estoque */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Carregando dados de estoque...</p>
                </div>
              </div>
            )}

            {/* Erro Estoque */}
            {error && (
              <Card className="border-destructive">
                <CardContent className="pt-6">
                  <p className="text-destructive font-medium">Erro ao carregar dados de estoque</p>
                  <p className="text-sm text-muted-foreground mt-1">{error}</p>
                </CardContent>
              </Card>
            )}

            {/* Dados de Estoque */}
            {!isLoading && !error && selectedEmpresaId !== null && (
              <>
                <StockKPICards dados={dados} />
                <StockActionChart dados={dados} />
                <Card>
                  <CardHeader>
                    <CardTitle>Detalhamento do Estoque</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <StockTable dados={dados} />
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
