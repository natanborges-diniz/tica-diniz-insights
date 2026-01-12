import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnaliseFamiliaVendedor } from '@/services/vendasService';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { LayoutGrid } from 'lucide-react';
import { formatters, ExportColumn } from '@/utils/exportData';

interface SalesFamilyTableProps {
  dados: AnaliseFamiliaVendedor[];
}

const exportColumns: ExportColumn[] = [
  { key: 'empresa', header: 'Empresa' },
  { key: 'vendedor', header: 'Vendedor' },
  { key: 'familia', header: 'Família' },
  { key: 'qtdTransacao', header: 'Transações', format: formatters.number },
  { key: 'qtdProdutos', header: 'Produtos', format: formatters.number },
  { key: 'totalVendido', header: 'Total Vendido', format: formatters.currency },
  { key: 'ticketMedio', header: 'Ticket Médio', format: formatters.currency },
];

export function SalesFamilyTable({ dados }: SalesFamilyTableProps) {
  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  
  // Prepara dados com ticket médio calculado para exportação
  const dadosExport = dados.map(item => ({
    ...item,
    ticketMedio: item.qtdTransacao > 0 ? item.totalVendido / item.qtdTransacao : 0,
  }));
  
  return (
    <Card>
      <CardHeader>
        <DataTableToolbar
          exportOptions={{
            filename: `vendas_familia_${new Date().toISOString().split('T')[0]}`,
            title: 'Análise de Vendas por Família',
            columns: exportColumns,
            data: dadosExport,
          }}
        >
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Detalhamento por Família
          </CardTitle>
        </DataTableToolbar>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Família</TableHead>
                <TableHead className="text-right">Transações</TableHead>
                <TableHead className="text-right">Produtos</TableHead>
                <TableHead className="text-right">Total Vendido</TableHead>
                <TableHead className="text-right">Ticket Médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhum dado encontrado
                  </TableCell>
                </TableRow>
              ) : (
                dados.map((item, index) => {
                  const ticketMedio = item.qtdTransacao > 0 ? item.totalVendido / item.qtdTransacao : 0;
                  return (
                    <TableRow key={`${item.codEmpresa}-${item.codVendedor}-${item.familia}-${index}`}>
                      <TableCell className="font-medium">{item.empresa}</TableCell>
                      <TableCell>{item.vendedor}</TableCell>
                      <TableCell>{item.familia}</TableCell>
                      <TableCell className="text-right">{item.qtdTransacao.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-right">{item.qtdProdutos.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.totalVendido)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(ticketMedio)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
