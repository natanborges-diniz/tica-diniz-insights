import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Users, Tag, AlertTriangle, Download, Image, FileText, Loader2 } from 'lucide-react';
import { AnaliseEstoqueAcao } from '@/services/estoqueService';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRef, useState } from 'react';
import { exportToImage, exportVisualToPDF } from '@/utils/exportVisual';
import { toast } from 'sonner';

interface StockKPICardsProps {
  dados: AnaliseEstoqueAcao[];
}

export function StockKPICards({ dados }: StockKPICardsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const totalPecas = dados.reduce((acc, item) => acc + (item.quantidadeEstoque || 0), 0);
  const fornecedoresDistintos = new Set(dados.map(item => item.fornecedor)).size;
  const grifesDistintas = new Set(dados.map(item => item.marca)).size;
  const pecasLiquida = dados
    .filter(item => item.acaoSugerida?.toUpperCase().includes('LIQUIDA'))
    .reduce((acc, item) => acc + (item.quantidadeEstoque || 0), 0);

  const handleExportImage = async () => {
    if (!containerRef.current) return;
    setExporting(true);
    try {
      await exportToImage(containerRef.current, { 
        filename: `kpi_estoque_${new Date().toISOString().split('T')[0]}`, 
        title: 'Resumo do Estoque' 
      });
      toast.success('Imagem exportada com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar imagem');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!containerRef.current) return;
    setExporting(true);
    try {
      await exportVisualToPDF(containerRef.current, { 
        filename: `kpi_estoque_${new Date().toISOString().split('T')[0]}`, 
        title: 'Resumo do Estoque' 
      });
      toast.success('PDF exportado com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Exportar KPIs
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportImage}>
              <Image className="h-4 w-4 mr-2" />
              Exportar Imagem
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportPDF}>
              <FileText className="h-4 w-4 mr-2" />
              Exportar PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      <div ref={containerRef} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 p-1">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total em Estoque</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPecas.toLocaleString('pt-BR')}</div>
            <p className="text-xs text-muted-foreground">peças</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fornecedores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fornecedoresDistintos}</div>
            <p className="text-xs text-muted-foreground">distintos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Marcas</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{grifesDistintas}</div>
            <p className="text-xs text-muted-foreground">distintas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Peças p/ Liquidar</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pecasLiquida.toLocaleString('pt-BR')}</div>
            <p className="text-xs text-muted-foreground">ação sugerida: liquidar</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
