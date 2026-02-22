import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn, QueryState } from '@/components/ui/data-table';
import { SalesRowDetailSheet } from './SalesRowDetailSheet';
import { ResumoLoja } from '@/hooks/useVendasDashboard';
import { EmptyState } from '@/components/system/states';

interface StoreTableProps {
  dados: ResumoLoja[];
  isLoading: boolean;
  usarVendasSemCreditos?: boolean;
}

const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const formatPercent = (v: number) => `${v.toFixed(2)}%`;

export function StoreTable({ dados, isLoading, usarVendasSemCreditos = true }: StoreTableProps) {
  const [queryState, setQueryState] = useState<QueryState>({
    page: 1, pageSize: 20,
    sort: { field: usarVendasSemCreditos ? 'totalVendidoSemCreditos' : 'totalVendido', direction: 'desc' },
    search: '',
  });
  const [detailRow, setDetailRow] = useState<ResumoLoja | null>(null);

  const columns: DataTableColumn<ResumoLoja>[] = useMemo(() => [
    {
      key: 'empresa', header: 'Loja', sortable: true, mobileVisible: true,
      cell: (row, idx) => {
        // Calculate rank based on current sort
        const sorted = [...dados].sort((a, b) =>
          usarVendasSemCreditos
            ? b.totalVendidoSemCreditos - a.totalVendidoSemCreditos
            : b.totalVendido - a.totalVendido
        );
        const rank = sorted.findIndex(d => d.empresa === row.empresa) + 1;
        return <span className="font-medium"><span className="text-muted-foreground mr-2">#{rank}</span>{row.empresa}</span>;
      },
    },
    {
      key: 'totalVendidoSemCreditos', header: 'Vendas s/ Créditos', sortable: true, align: 'right' as const, mobileVisible: true,
      headerClassName: usarVendasSemCreditos ? 'bg-primary/10 font-bold' : '',
      cellClassName: usarVendasSemCreditos ? 'font-bold text-success bg-primary/5' : '',
      cell: (row) => formatCurrency(row.totalVendidoSemCreditos),
    },
    {
      key: 'ticketMedio', header: 'Ticket Médio', sortable: true, align: 'right' as const, mobileVisible: false,
      cell: (row) => formatCurrency(row.ticketMedio),
    },
    {
      key: 'percentualDesconto', header: '% Desc.', sortable: true, align: 'right' as const, mobileVisible: false,
      cell: (row) => <span className="text-warning">{formatPercent(row.percentualDesconto)}</span>,
    },
    {
      key: 'totalDevolucoes', header: 'Devoluções', sortable: true, align: 'right' as const, mobileVisible: false,
      cell: (row) => <span className="text-danger">{formatCurrency(row.totalDevolucoes)}</span>,
    },
  ], [usarVendasSemCreditos, dados]);

  const detailFields = detailRow ? [
    { label: 'Loja', value: detailRow.empresa },
    { label: 'Vendas s/ Créditos', value: detailRow.totalVendidoSemCreditos },
    { label: 'Total Vendido', value: detailRow.totalVendido },
    { label: 'Total Bruto', value: detailRow.totalBruto },
    { label: 'Total Desconto', value: detailRow.totalDesconto },
    { label: '% Desconto', value: formatPercent(detailRow.percentualDesconto) },
    { label: 'Ticket Médio', value: detailRow.ticketMedio },
    { label: 'Qtd Transações', value: detailRow.qtdTransacao.toLocaleString('pt-BR') },
    { label: 'Devoluções', value: detailRow.totalDevolucoes },
    { label: 'Créditos', value: detailRow.totalCreditos },
  ] : [];

  return (
    <Card>
      <CardHeader><CardTitle>Ranking por Loja</CardTitle></CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={dados}
          mode="client"
          queryState={queryState}
          onQueryChange={setQueryState}
          rowKey={(row) => row.empresa}
          loading={isLoading}
          emptyState={<EmptyState title="Sem dados no período" description="Ajuste os filtros ou selecione outro período." />}
          onRowClick={(row) => setDetailRow(row)}
        />
      </CardContent>

      <SalesRowDetailSheet
        open={!!detailRow}
        onOpenChange={(open) => !open && setDetailRow(null)}
        title={detailRow?.empresa || ''}
        subtitle="Detalhes da Loja"
        fields={detailFields}
      />
    </Card>
  );
}
