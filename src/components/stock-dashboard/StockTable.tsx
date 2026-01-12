import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnaliseEstoqueAcao } from '@/services/estoqueService';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { Package } from 'lucide-react';
import { formatters, ExportColumn } from '@/utils/exportData';

interface StockTableProps {
  dados: AnaliseEstoqueAcao[];
}

const exportColumns: ExportColumn[] = [
  { key: 'empresa', header: 'Empresa' },
  { key: 'fornecedor', header: 'Fornecedor' },
  { key: 'marca', header: 'Marca' },
  { key: 'codigoBarra', header: 'Cód. Barras' },
  { key: 'descricao', header: 'Descrição' },
  { key: 'quantidadeEstoque', header: 'Qtde Estoque', format: formatters.number },
  { key: 'diasEstoque', header: 'Dias Estoque', format: formatters.number },
  { key: 'acaoSugerida', header: 'Ação Sugerida' },
];

export function StockTable({ dados }: StockTableProps) {
  return (
    <Card>
      <CardHeader>
        <DataTableToolbar
          exportOptions={{
            filename: `estoque_${new Date().toISOString().split('T')[0]}`,
            title: 'Análise de Estoque',
            columns: exportColumns,
            data: dados,
          }}
        >
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Detalhamento do Estoque
          </CardTitle>
        </DataTableToolbar>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Cód. Barras</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Qtde Estoque</TableHead>
                <TableHead className="text-right">Dias Estoque</TableHead>
                <TableHead>Ação Sugerida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Nenhum dado encontrado
                  </TableCell>
                </TableRow>
              ) : (
                dados.map((item, index) => (
                  <TableRow key={`${item.codigoBarra}-${index}`}>
                    <TableCell className="font-medium">{item.empresa}</TableCell>
                    <TableCell>{item.fornecedor}</TableCell>
                    <TableCell>{item.marca}</TableCell>
                    <TableCell>{item.codigoBarra}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{item.descricao}</TableCell>
                    <TableCell className="text-right">{item.quantidadeEstoque?.toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-right">{item.diasEstoque}</TableCell>
                    <TableCell>{item.acaoSugerida}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
