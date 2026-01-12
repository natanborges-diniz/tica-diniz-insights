import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TableIcon, Search, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { ResumoEmpresaVendedor } from '@/services/vendasService';

interface SalesTableProps {
  dados: ResumoEmpresaVendedor[];
  isLoading?: boolean;
  limiteDesconto?: number;
  usarVendasSemCreditos?: boolean;
}

type SortField = 'empresaNomeLogico' | 'vendedor' | 'qtdTransacao' | 'qtdProdutos' | 'totalBruto' | 
                 'totalDesconto' | 'percentualDesconto' | 'totalVendido' | 'totalCreditos' |
                 'totalVendidoSemCreditos' | 'ticketMedio';
type SortDirection = 'asc' | 'desc' | null;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function SalesTable({ dados, isLoading, limiteDesconto = 15, usarVendasSemCreditos = true }: SalesTableProps) {
  const [search, setSearch] = useState('');
  const defaultSortField: SortField = usarVendasSemCreditos ? 'totalVendidoSemCreditos' : 'totalVendido';
  const [sortField, setSortField] = useState<SortField>(defaultSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    if (sortDirection === 'asc') return <ArrowUp className="ml-1 h-3 w-3" />;
    if (sortDirection === 'desc') return <ArrowDown className="ml-1 h-3 w-3" />;
    return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
  };

  const filteredAndSortedData = useMemo(() => {
    let filtered = dados;

    // Filtro de busca
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = dados.filter(row => 
        row.empresaNomeLogico?.toLowerCase().includes(searchLower) ||
        row.vendedor?.toLowerCase().includes(searchLower)
      );
    }

    // Ordenação
    if (sortField && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortField as keyof typeof a] ?? 0;
        const bVal = b[sortField as keyof typeof b] ?? 0;
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc' 
            ? aVal.localeCompare(bVal) 
            : bVal.localeCompare(aVal);
        }
        
        return sortDirection === 'asc' 
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      });
    }

    return filtered;
  }, [dados, search, sortField, sortDirection]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TableIcon className="h-5 w-5 text-primary" />
            Ranking de Vendedores
          </CardTitle>
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
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredAndSortedData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Sem dados no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('empresaNomeLogico')}
                  >
                    <div className="flex items-center">
                      Empresa
                      <SortIcon field="empresaNomeLogico" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('vendedor')}
                  >
                    <div className="flex items-center">
                      Vendedor
                      <SortIcon field="vendedor" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('qtdTransacao')}
                  >
                    <div className="flex items-center justify-end">
                      Qtd Trans.
                      <SortIcon field="qtdTransacao" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('totalBruto')}
                  >
                    <div className="flex items-center justify-end">
                      Total Bruto
                      <SortIcon field="totalBruto" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('totalDesconto')}
                  >
                    <div className="flex items-center justify-end">
                      Desconto
                      <SortIcon field="totalDesconto" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('percentualDesconto')}
                  >
                    <div className="flex items-center justify-end">
                      % Desc.
                      <SortIcon field="percentualDesconto" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className={`text-right cursor-pointer hover:bg-muted/50 ${!usarVendasSemCreditos ? 'bg-primary/10' : ''}`}
                    onClick={() => handleSort('totalVendido')}
                  >
                    <div className="flex items-center justify-end">
                      Total Vendido
                      <SortIcon field="totalVendido" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('totalCreditos')}
                  >
                    <div className="flex items-center justify-end">
                      Créditos
                      <SortIcon field="totalCreditos" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('ticketMedio')}
                  >
                    <div className="flex items-center justify-end">
                      Ticket Médio
                      <SortIcon field="ticketMedio" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className={`text-right cursor-pointer hover:bg-muted/50 ${usarVendasSemCreditos ? 'bg-primary/10' : ''}`}
                    onClick={() => handleSort('totalVendidoSemCreditos')}
                  >
                    <div className="flex items-center justify-end">
                      Vendas Válidas
                      <SortIcon field="totalVendidoSemCreditos" />
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    Qualidade
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedData.map((row, index) => (
                  <TableRow key={`${row.empresaCodLogico}-${row.vendedor}-${index}`}>
                    <TableCell className="font-medium">{row.empresaNomeLogico}</TableCell>
                    <TableCell>{row.vendedor}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.qtdTransacao)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.totalBruto)}</TableCell>
                    <TableCell className="text-right text-amber-600">{formatCurrency(row.totalDesconto)}</TableCell>
                    <TableCell className={`text-right ${row.percentualDesconto > limiteDesconto ? 'text-red-600 font-semibold' : 'text-orange-600'}`}>
                      {formatPercent(row.percentualDesconto)}
                    </TableCell>
                    <TableCell className={`text-right ${!usarVendasSemCreditos ? 'font-bold text-emerald-600 bg-primary/5' : ''}`}>
                      {formatCurrency(row.totalVendido)}
                    </TableCell>
                    <TableCell className="text-right text-blue-600">
                      {formatCurrency(row.totalCreditos)}
                    </TableCell>
                    <TableCell className="text-right text-indigo-600">
                      {formatCurrency(row.ticketMedio)}
                    </TableCell>
                    <TableCell className={`text-right ${usarVendasSemCreditos ? 'font-bold text-emerald-600 bg-primary/5' : ''}`}>
                      {formatCurrency(row.totalVendidoSemCreditos)}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.percentualDesconto > limiteDesconto ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Desc {formatPercent(row.percentualDesconto)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-600">
                          <CheckCircle className="h-3 w-3" />
                          OK
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
