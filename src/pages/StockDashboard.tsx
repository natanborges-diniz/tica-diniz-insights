import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnaliseEstoque } from '@/hooks/useAnaliseEstoque';
import { StockKPICards } from '@/components/stock-dashboard/StockKPICards';
import { StockTable } from '@/components/stock-dashboard/StockTable';
import { StockActionChart } from '@/components/stock-dashboard/StockActionChart';

const LOJAS = [
  { cod: '595', nome: 'Diniz Primitiva I' },
  { cod: '597', nome: 'Diniz Primitiva II' },
  { cod: '599', nome: 'Diniz Antônio Agú' },
  { cod: '601', nome: 'Diniz União' },
  { cod: '603', nome: 'Diniz Super' },
  { cod: '605', nome: 'Diniz Carapicuíba' },
  { cod: '607', nome: 'Diniz Itapevi' },
  { cod: '609', nome: 'Diniz Jandira' },
  { cod: '769', nome: 'Diniz Barueri' },
];

export default function StockDashboard() {
  const [codEmpresa, setCodEmpresa] = useState('595');
  const { dados, isLoading, error, fetchData } = useAnaliseEstoque();

  useEffect(() => {
    fetchData(codEmpresa);
  }, [codEmpresa, fetchData]);

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
        {/* Filtro de Loja */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Selecione a Loja</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={codEmpresa}
              onChange={(e) => setCodEmpresa(e.target.value)}
              className="w-full max-w-xs px-3 py-2 border rounded-md bg-background"
            >
              {LOJAS.map((loja) => (
                <option key={loja.cod} value={loja.cod}>
                  {loja.cod} - {loja.nome}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Carregando dados de estoque...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive font-medium">Erro ao carregar dados de estoque</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Conteúdo */}
        {!isLoading && !error && (
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
      </main>
    </div>
  );
}
