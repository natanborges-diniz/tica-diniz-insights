import { useState, useMemo } from "react";
import { LojaInteligencia } from "@/hooks/useInteligenciaVendas";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy } from "lucide-react";
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

interface InteligenciaLojasTableProps {
  ranking: LojaInteligencia[];
  compact?: boolean;
}

function getMedalha(posicao: number) {
  if (posicao === 1) return <Trophy className="h-5 w-5 text-chart-4" />;
  if (posicao === 2) return <Trophy className="h-5 w-5 text-neutral-400" />;
  if (posicao === 3) return <Trophy className="h-5 w-5 text-chart-3" />;
  return <span className="text-muted-foreground">{posicao}º</span>;
}

function getStatusBadge(status?: LojaInteligencia['status'], percentual?: number) {
  if (percentual === undefined) return <Badge variant="outline">Sem meta</Badge>;

  switch (status) {
    case 'ACIMA_MEDIA':
      return <Badge className="bg-success-soft text-success border-success-muted" variant="outline">✓ {percentual.toFixed(0)}%</Badge>;
    case 'NO_RITMO':
      return <Badge className="bg-info-soft text-info border-info-muted" variant="outline">{percentual.toFixed(0)}%</Badge>;
    case 'EM_RISCO':
      return <Badge className="bg-warning-soft text-warning border-warning-muted" variant="outline">{percentual.toFixed(0)}%</Badge>;
    case 'CRITICO':
      return <Badge variant="destructive">{percentual.toFixed(0)}%</Badge>;
    default:
      return <Badge variant="outline">{percentual.toFixed(0)}%</Badge>;
  }
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function InteligenciaLojasTable({ ranking, compact = false }: InteligenciaLojasTableProps) {
  const [queryState, setQueryState] = useState<QueryState>({
    page: 1, pageSize: 20, sort: { field: 'posicao', direction: 'asc' }, search: '',
  });
  const [detailRow, setDetailRow] = useState<LojaInteligencia | null>(null);

  // Compact mode stays as simple table (used in Top 5 cards)
  if (compact) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Loja</TableHead>
            <TableHead className="text-right">Vendas</TableHead>
            <TableHead className="text-center">Meta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranking.map((loja) => (
            <TableRow key={loja.codEmpresa}>
              <TableCell className="font-medium">{getMedalha(loja.posicao)}</TableCell>
              <TableCell className="font-medium truncate max-w-32">{loja.empresa}</TableCell>
              <TableCell className="text-right text-success font-semibold">
                {formatCurrency(loja.totalVendidoSemCreditos)}
              </TableCell>
              <TableCell className="text-center">
                {getStatusBadge(loja.status, loja.percentualMeta)}
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
  const columns: DataTableColumn<LojaInteligencia>[] = [
    {
      key: 'posicao', header: '#', sortable: true, align: 'center', mobileVisible: true,
      cell: (row) => getMedalha(row.posicao),
      maxWidth: '60px',
    },
    {
      key: 'empresa', header: 'Loja', sortable: true, mobileVisible: true,
      cell: (row) => <span className="font-medium">{row.empresa}</span>,
    },
    {
      key: 'totalVendidoSemCreditos', header: 'Vendas Válidas', sortable: true, align: 'right', mobileVisible: true,
      cell: (row) => <span className="font-semibold text-success">{formatCurrency(row.totalVendidoSemCreditos)}</span>,
    },
    {
      key: 'ticketMedio', header: 'Ticket Médio', sortable: true, align: 'right', mobileVisible: false,
      cell: (row) => formatCurrency(row.ticketMedio),
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
    {
      key: 'status', header: 'Status', align: 'center', mobileVisible: false,
      cell: (row) => getStatusBadge(row.status, row.percentualMeta),
    },
    {
      key: 'diasUteisRestantes', header: 'Dias Rest.', align: 'right', mobileVisible: false,
      cell: (row) => row.diasUteisRestantes !== undefined ? (
        <span className={row.diasUteisRestantes <= 5 ? "text-danger font-medium" : ""}>
          {row.diasUteisRestantes}
        </span>
      ) : '-',
    },
    {
      key: 'percentualMeta', header: 'Progresso', mobileVisible: false,
      cell: (row) => row.percentualMeta !== undefined ? (
        <Progress value={Math.min(row.percentualMeta, 100)} className="h-2 w-24" />
      ) : null,
    },
  ];

  const detailFields = detailRow ? [
    { label: 'Loja', value: detailRow.empresa },
    { label: 'Vendas Válidas', value: detailRow.totalVendidoSemCreditos },
    { label: 'Total Vendido', value: detailRow.totalVendido },
    { label: 'Ticket Médio', value: detailRow.ticketMedio },
    { label: 'Qtd Transações', value: detailRow.qtdTransacoes.toLocaleString('pt-BR') },
    { label: '% Desconto', value: `${detailRow.percentualDesconto.toFixed(1)}%` },
    { label: '% Meta', value: detailRow.percentualMeta !== undefined ? `${detailRow.percentualMeta.toFixed(1)}%` : 'Sem meta' },
    { label: 'Dias Úteis Restantes', value: detailRow.diasUteisRestantes ?? '-' },
  ] : [];

  return (
    <>
      <DataTable
        columns={columns}
        data={ranking}
        mode="client"
        queryState={queryState}
        onQueryChange={setQueryState}
        rowKey={(row) => String(row.codEmpresa)}
        emptyState={<EmptyState title="Nenhum dado disponível" description='Clique em "Carregar Dados" para buscar.' />}
        rowClassName={(row) => row.posicao <= 3 ? "bg-muted/30" : ""}
        onRowClick={(row) => setDetailRow(row)}
      />

      <SalesRowDetailSheet
        open={!!detailRow}
        onOpenChange={(open) => !open && setDetailRow(null)}
        title={detailRow?.empresa || ''}
        subtitle="Detalhes da Loja"
        badge={detailRow ? getStatusBadge(detailRow.status, detailRow.percentualMeta) : undefined}
        fields={detailFields}
      />
    </>
  );
}
