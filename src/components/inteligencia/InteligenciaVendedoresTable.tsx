import { useState, useMemo } from "react";
import { VendedorInteligencia } from "@/hooks/useInteligenciaVendas";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { DataTable, DataTableColumn, QueryState } from "@/components/ui/data-table";
import { SalesRowDetailSheet } from "@/components/sales-dashboard/SalesRowDetailSheet";
import { EmptyState } from "@/components/system/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface InteligenciaVendedoresTableProps {
  ranking: VendedorInteligencia[];
  compact?: boolean;
}

function getMedalha(posicao: number) {
  if (posicao === 1) return <Trophy className="h-5 w-5 text-chart-4" />;
  if (posicao === 2) return <Trophy className="h-5 w-5 text-neutral-400" />;
  if (posicao === 3) return <Trophy className="h-5 w-5 text-chart-3" />;
  return <span className="text-muted-foreground">{posicao}º</span>;
}

function getComparativoIcon(valor?: number) {
  if (valor === undefined) return null;
  if (valor > 5) return <TrendingUp className="h-4 w-4 text-success inline ml-1" />;
  if (valor < -5) return <TrendingDown className="h-4 w-4 text-danger inline ml-1" />;
  return <Minus className="h-4 w-4 text-muted-foreground inline ml-1" />;
}

function getComparativoClass(valor?: number) {
  if (!valor) return '';
  if (valor > 0) return 'text-success';
  if (valor < 0) return 'text-danger';
  return '';
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function InteligenciaVendedoresTable({ ranking, compact = false }: InteligenciaVendedoresTableProps) {
  const [queryState, setQueryState] = useState<QueryState>({
    page: 1, pageSize: 20, sort: { field: 'posicao', direction: 'asc' }, search: '',
  });
  const [detailRow, setDetailRow] = useState<VendedorInteligencia | null>(null);

  if (compact) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead className="text-right">Vendas</TableHead>
            <TableHead className="text-right">vs Loja</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranking.map((vendedor, idx) => (
            <TableRow key={`${vendedor.codEmpresa}-${vendedor.vendedor}-${idx}`}>
              <TableCell className="font-medium">{getMedalha(vendedor.posicao)}</TableCell>
              <TableCell className="font-medium truncate max-w-32">{vendedor.vendedor}</TableCell>
              <TableCell className="text-right text-success font-semibold">
                {formatCurrency(vendedor.totalVendidoSemCreditos)}
              </TableCell>
              <TableCell className="text-right">
                <span className={getComparativoClass(vendedor.comparativoMediaLoja)}>
                  {vendedor.comparativoMediaLoja !== undefined
                    ? `${vendedor.comparativoMediaLoja > 0 ? '+' : ''}${vendedor.comparativoMediaLoja.toFixed(0)}%`
                    : '-'
                  }
                </span>
              </TableCell>
            </TableRow>
          ))}
          {ranking.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                Nenhum dado disponível
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  }

  // Full DataTable mode
  const columns: DataTableColumn<VendedorInteligencia>[] = [
    {
      key: 'posicao', header: '#', sortable: true, align: 'center', mobileVisible: true,
      cell: (row) => getMedalha(row.posicao),
      maxWidth: '60px',
    },
    {
      key: 'vendedor', header: 'Vendedor', sortable: true, mobileVisible: true,
      cell: (row) => <span className="font-medium">{row.vendedor}</span>,
    },
    {
      key: 'empresa', header: 'Loja', mobileVisible: true,
      cell: (row) => <Badge variant="outline">{row.empresa}</Badge>,
    },
    {
      key: 'totalVendidoSemCreditos', header: 'Faturamento', sortable: true, align: 'right', mobileVisible: false,
      cell: (row) => <span className="font-semibold text-success">{formatCurrency(row.totalVendidoSemCreditos)}</span>,
    },
    {
      key: 'ticketMedio', header: 'Ticket Médio', sortable: true, align: 'right', mobileVisible: false,
      cell: (row) => formatCurrency(row.ticketMedio),
    },
    {
      key: 'comparativoMediaLoja', header: 'vs Média Loja', sortable: true, align: 'right', mobileVisible: false,
      cell: (row) => (
        <>
          <span className={getComparativoClass(row.comparativoMediaLoja)}>
            {row.comparativoMediaLoja !== undefined
              ? `${row.comparativoMediaLoja > 0 ? '+' : ''}${row.comparativoMediaLoja.toFixed(1)}%`
              : '-'
            }
          </span>
          {getComparativoIcon(row.comparativoMediaLoja)}
        </>
      ),
    },
    {
      key: 'qtdTransacoes', header: 'Qtd Vendas', sortable: true, align: 'right', mobileVisible: false,
      cell: (row) => row.qtdTransacoes.toLocaleString('pt-BR'),
    },
    {
      key: 'percentualDesconto', header: '% Desconto', sortable: true, align: 'right', mobileVisible: false,
      cell: (row) => (
        <span className={row.percentualDesconto > 15 ? "text-danger" : ""}>
          {row.percentualDesconto.toFixed(1)}%
        </span>
      ),
    },
  ];

  const detailFields = detailRow ? [
    { label: 'Vendedor / Loja', value: `${detailRow.vendedor} — ${detailRow.empresa}` },
    { label: 'Faturamento', value: detailRow.totalVendidoSemCreditos },
    { label: 'Total Vendido', value: detailRow.totalVendido },
    { label: 'Ticket Médio', value: detailRow.ticketMedio },
    { label: 'Qtd Transações', value: detailRow.qtdTransacoes.toLocaleString('pt-BR') },
    { label: '% Desconto', value: `${detailRow.percentualDesconto.toFixed(1)}%` },
    { label: 'vs Média Loja', value: detailRow.comparativoMediaLoja !== undefined
      ? `${detailRow.comparativoMediaLoja > 0 ? '+' : ''}${detailRow.comparativoMediaLoja.toFixed(1)}%`
      : '-'
    },
  ] : [];

  return (
    <>
      <DataTable
        columns={columns}
        data={ranking}
        mode="client"
        queryState={queryState}
        onQueryChange={setQueryState}
        rowKey={(row, idx) => `${row.codEmpresa}-${row.vendedor}-${idx}`}
        emptyState={<EmptyState title="Nenhum dado disponível" description='Clique em "Carregar Dados" para buscar.' />}
        rowClassName={(row) => row.posicao <= 3 ? "bg-muted/30" : ""}
        onRowClick={(row) => setDetailRow(row)}
      />

      <SalesRowDetailSheet
        open={!!detailRow}
        onOpenChange={(open) => !open && setDetailRow(null)}
        title={detailRow?.vendedor || ''}
        subtitle={detailRow?.empresa}
        fields={detailFields}
      />
    </>
  );
}
