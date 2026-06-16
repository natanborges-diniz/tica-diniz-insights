import { PivotTable, PivotColumn } from '@/components/ui/pivot-table';
import { AnaliseFamiliaVendedor } from '@/services/vendasService';
import { LayoutGrid } from 'lucide-react';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { formatters } from '@/utils/exportData';

interface SalesFamilyTableProps {
  dados: AnaliseFamiliaVendedor[];
}

const formatCurrency = (v: number) =>
  v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—';

const formatNumber = (v: number) =>
  v?.toLocaleString('pt-BR') ?? '—';

const columns: PivotColumn<AnaliseFamiliaVendedor>[] = [
  { key: 'empresa', header: 'Empresa', type: 'dimension' },
  { key: 'vendedor', header: 'Vendedor', type: 'dimension' },
  { key: 'familia', header: 'Família', type: 'dimension' },
  { key: 'fornecedor', header: 'Fornecedor', type: 'dimension' },
  { key: 'qtdTransacao', header: 'Transações', type: 'measure', format: formatNumber, aggregate: 'sum' },
  { key: 'qtdProdutos', header: 'Qtd.', type: 'measure', format: formatNumber, aggregate: 'sum' },
  { key: 'totalVendido', header: 'Total Vendido', type: 'measure', format: formatCurrency, aggregate: 'sum' },
];

const exportColumns = [
  { key: 'empresa', header: 'Empresa' },
  { key: 'vendedor', header: 'Vendedor' },
  { key: 'familia', header: 'Família' },
  { key: 'fornecedor', header: 'Fornecedor' },
  { key: 'qtdTransacao', header: 'Transações', format: formatters.number },
  { key: 'qtdProdutos', header: 'Produtos', format: formatters.number },
  { key: 'totalVendido', header: 'Total Vendido', format: formatters.currency },
];

export function SalesFamilyTable({ dados }: SalesFamilyTableProps) {
  const hoje = new Date().toISOString().split('T')[0];
  return (
    <div className="space-y-3">
      <DataTableToolbar
        exportOptions={{
          filename: `vendas-familia-${hoje}`,
          title: 'Vendas por Família e Vendedor',
          columns: exportColumns,
          data: dados,
        }}
      />
      <PivotTable
        data={dados}
        columns={columns}
        defaultGroupBy={['empresa', 'familia']}
        title="Detalhamento por Família"
        icon={<LayoutGrid className="h-5 w-5" />}
        emptyMessage="Nenhum dado encontrado"
      />
    </div>
  );
}
