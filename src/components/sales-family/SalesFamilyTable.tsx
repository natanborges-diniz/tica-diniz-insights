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

// Glossário:
// Vendas      = nº de cupons/transações (qtdTransacao)
// Peças       = unidades vendidas        (qtdProdutos)
// Faturamento = receita do período       (totalVendido)
// Registros   = nº de linhas agregadas no grupo (badge automático do pivot)
const columns: PivotColumn<AnaliseFamiliaVendedor>[] = [
  { key: 'empresa', header: 'Empresa', type: 'dimension' },
  { key: 'vendedor', header: 'Vendedor', type: 'dimension' },
  { key: 'familia', header: 'Família', type: 'dimension' },
  { key: 'fornecedor', header: 'Fornecedor', type: 'dimension' },
  { key: 'qtdTransacao', header: 'Vendas', type: 'measure', format: formatNumber, aggregate: 'sum' },
  { key: 'qtdProdutos', header: 'Peças', type: 'measure', format: formatNumber, aggregate: 'sum' },
  { key: 'totalVendido', header: 'Faturamento', type: 'measure', format: formatCurrency, aggregate: 'sum' },
];

const exportColumns = [
  { key: 'empresa', header: 'Empresa' },
  { key: 'vendedor', header: 'Vendedor' },
  { key: 'familia', header: 'Família' },
  { key: 'fornecedor', header: 'Fornecedor' },
  { key: 'qtdTransacao', header: 'Vendas', format: formatters.number },
  { key: 'qtdProdutos', header: 'Peças', format: formatters.number },
  { key: 'totalVendido', header: 'Faturamento', format: formatters.currency },
];

export function SalesFamilyTable({ dados }: SalesFamilyTableProps) {
  const hoje = new Date().toISOString().split('T')[0];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <strong>Vendas</strong>: cupons distintos · <strong>Peças</strong>: unidades vendidas ·
          {' '}<strong>Faturamento</strong>: receita do período
        </p>
        <DataTableToolbar
          exportOptions={{
            filename: `vendas-familia-${hoje}`,
            title: 'Vendas por Família e Vendedor',
            columns: exportColumns,
            data: dados,
          }}
        />
      </div>
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
