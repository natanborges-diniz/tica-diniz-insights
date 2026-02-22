import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TableIcon, Search, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { DataTable, DataTableColumn, QueryState } from '@/components/ui/data-table';
import { SalesRowDetailSheet } from './SalesRowDetailSheet';
import { ResumoEmpresaVendedor } from '@/services/vendasService';

interface SalesTableProps {
  dados: ResumoEmpresaVendedor[];
  isLoading?: boolean;
  loadingDesconto?: boolean;
  limiteDesconto?: number;
  usarVendasSemCreditos?: boolean;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const formatNumber = (v: number) => new Intl.NumberFormat('pt-BR').format(v);
const formatPercent = (v: number) => `${v.toFixed(2)}%`;

export function SalesTable({
  dados,
  isLoading,
  loadingDesconto,
  limiteDesconto = 15,
  usarVendasSemCreditos = true,
}: SalesTableProps) {
  const [search, setSearch] = useState('');
  const [queryState, setQueryState] = useState<QueryState>({
    page: 1,
    pageSize: 20,
    sort: { field: usarVendasSemCreditos ? 'totalVendidoSemCreditos' : 'totalVendido', direction: 'desc' },
    search: '',
  });
  const [detailRow, setDetailRow] = useState<ResumoEmpresaVendedor | null>(null);

  const temDesconto = dados.some(d => d.totalDesconto > 0 || d.percentualDesconto > 0);

  const filteredData = useMemo(() => {
    if (!search) return dados;
    const s = search.toLowerCase();
    return dados.filter(r =>
      r.empresaNomeLogico?.toLowerCase().includes(s) ||
      r.vendedor?.toLowerCase().includes(s)
    );
  }, [dados, search]);

  const columns: DataTableColumn<ResumoEmpresaVendedor>[] = useMemo(() => [
    {
      key: 'empresaNomeLogico', header: 'Empresa', sortable: true, mobileVisible: true,
      cell: (row) => <span className="font-medium">{row.empresaNomeLogico}</span>,
    },
    {
      key: 'vendedor', header: 'Vendedor', sortable: true, mobileVisible: true,
    },
    {
      key: 'qtdTransacao', header: 'Qtd Trans.', sortable: true, align: 'right' as const, mobileVisible: false,
      cell: (row) => formatNumber(row.qtdTransacao),
    },
    {
      key: 'totalBruto', header: 'Total Bruto', sortable: true, align: 'right' as const, mobileVisible: false,
      cell: (row) => row.totalBruto > 0 ? formatCurrency(row.totalBruto) : (
        loadingDesconto ? <Skeleton className="h-4 w-16 ml-auto" /> : '—'
      ),
    },
    {
      key: 'totalDesconto', header: 'Desconto', sortable: true, align: 'right' as const, mobileVisible: false,
      cell: (row) => row.totalDesconto > 0 ? (
        <span className="text-warning">{formatCurrency(row.totalDesconto)}</span>
      ) : (loadingDesconto ? <Skeleton className="h-4 w-16 ml-auto" /> : '—'),
    },
    {
      key: 'percentualDesconto', header: '% Desc.', sortable: true, align: 'right' as const, mobileVisible: false,
      cell: (row) => row.percentualDesconto > 0 ? (
        <span className={row.percentualDesconto > limiteDesconto ? 'text-danger font-semibold' : 'text-warning'}>
          {formatPercent(row.percentualDesconto)}
        </span>
      ) : (loadingDesconto ? <Skeleton className="h-4 w-12 ml-auto" /> : '—'),
    },
    {
      key: 'totalVendidoSemCreditos', header: 'Vendas Válidas', sortable: true, align: 'right' as const, mobileVisible: true,
      headerClassName: usarVendasSemCreditos ? 'bg-primary/10' : '',
      cellClassName: usarVendasSemCreditos ? 'font-bold text-success bg-primary/5' : '',
      cell: (row) => formatCurrency(row.totalVendidoSemCreditos),
    },
    {
      key: 'totalCreditos', header: 'Créditos', sortable: true, align: 'right' as const, mobileVisible: false,
      cell: (row) => <span className="text-info">{formatCurrency(row.totalCreditos)}</span>,
    },
    {
      key: 'ticketMedio', header: 'Ticket Médio', sortable: true, align: 'right' as const, mobileVisible: false,
      cell: (row) => formatCurrency(row.ticketMedio),
    },
    ...(temDesconto ? [{
      key: 'qualidade' as string, header: 'Qualidade', align: 'center' as const, mobileVisible: false,
      cell: (row: ResumoEmpresaVendedor) => {
        if (row.percentualDesconto > limiteDesconto) {
          return (
            <Badge className="gap-1 bg-danger-soft text-danger border-danger-muted" variant="outline">
              <AlertTriangle className="h-3 w-3" />
              Desc {formatPercent(row.percentualDesconto)}
            </Badge>
          );
        }
        if (row.percentualDesconto > 0) {
          return (
            <Badge className="gap-1 bg-success-soft text-success border-success-muted" variant="outline">
              <CheckCircle className="h-3 w-3" />
              OK
            </Badge>
          );
        }
        return null;
      },
    }] : []),
  ], [usarVendasSemCreditos, loadingDesconto, temDesconto, limiteDesconto]);

  const detailFields = detailRow ? [
    { label: 'Empresa / Vendedor', value: `${detailRow.empresaNomeLogico} — ${detailRow.vendedor}` },
    { label: 'Vendas Válidas', value: detailRow.totalVendidoSemCreditos },
    { label: 'Total Vendido', value: detailRow.totalVendido },
    { label: 'Total Bruto', value: detailRow.totalBruto },
    { label: 'Desconto', value: detailRow.totalDesconto },
    { label: '% Desconto', value: formatPercent(detailRow.percentualDesconto) },
    { label: 'Créditos', value: detailRow.totalCreditos },
    { label: 'Ticket Médio', value: detailRow.ticketMedio },
    { label: 'Qtd Transações', value: formatNumber(detailRow.qtdTransacao) },
  ] : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TableIcon className="h-5 w-5 text-primary" />
              Ranking de Vendedores
            </CardTitle>
            {loadingDesconto && (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Carregando desconto...
              </Badge>
            )}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar empresa ou vendedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={filteredData}
          mode="client"
          queryState={queryState}
          onQueryChange={setQueryState}
          rowKey={(row, idx) => `${row.empresaCodLogico}-${row.vendedor}-${idx}`}
          loading={isLoading}
          emptyMessage="Sem dados no período"
          onRowClick={(row) => setDetailRow(row)}
        />
      </CardContent>

      <SalesRowDetailSheet
        open={!!detailRow}
        onOpenChange={(open) => !open && setDetailRow(null)}
        title={detailRow?.vendedor || ''}
        subtitle={detailRow?.empresaNomeLogico}
        fields={detailFields}
      />
    </Card>
  );
}
