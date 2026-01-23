import { VendedorInteligencia } from "@/hooks/useInteligenciaVendas";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface InteligenciaVendedoresTableProps {
  ranking: VendedorInteligencia[];
  compact?: boolean;
}

function getMedalha(posicao: number) {
  if (posicao === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (posicao === 2) return <Trophy className="h-5 w-5 text-gray-400" />;
  if (posicao === 3) return <Trophy className="h-5 w-5 text-amber-600" />;
  return <span className="text-muted-foreground">{posicao}º</span>;
}

function getComparativoIcon(valor?: number) {
  if (valor === undefined) return null;
  if (valor > 5) return <TrendingUp className="h-4 w-4 text-emerald-500 inline ml-1" />;
  if (valor < -5) return <TrendingDown className="h-4 w-4 text-destructive inline ml-1" />;
  return <Minus className="h-4 w-4 text-muted-foreground inline ml-1" />;
}

export function InteligenciaVendedoresTable({ ranking, compact = false }: InteligenciaVendedoresTableProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

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
              <TableCell className="font-medium truncate max-w-32">
                {vendedor.vendedor}
              </TableCell>
              <TableCell className="text-right text-emerald-600 font-semibold">
                {formatCurrency(vendedor.totalVendidoSemCreditos)}
              </TableCell>
              <TableCell className="text-right">
                <span className={
                  vendedor.comparativoMediaLoja && vendedor.comparativoMediaLoja > 0
                    ? "text-emerald-600"
                    : vendedor.comparativoMediaLoja && vendedor.comparativoMediaLoja < 0
                    ? "text-destructive"
                    : ""
                }>
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

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16 text-center">#</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>Loja</TableHead>
            <TableHead className="text-right">Faturamento</TableHead>
            <TableHead className="text-right">Ticket Médio</TableHead>
            <TableHead className="text-right">vs Média Loja</TableHead>
            <TableHead className="text-right">Qtd Vendas</TableHead>
            <TableHead className="text-right">% Desconto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranking.map((vendedor, idx) => (
            <TableRow 
              key={`${vendedor.codEmpresa}-${vendedor.vendedor}-${idx}`} 
              className={vendedor.posicao <= 3 ? "bg-muted/30" : ""}
            >
              <TableCell className="text-center font-medium">
                {getMedalha(vendedor.posicao)}
              </TableCell>
              <TableCell className="font-medium">{vendedor.vendedor}</TableCell>
              <TableCell>
                <Badge variant="outline">{vendedor.empresa}</Badge>
              </TableCell>
              <TableCell className="text-right font-semibold text-emerald-600">
                {formatCurrency(vendedor.totalVendidoSemCreditos)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(vendedor.ticketMedio)}
              </TableCell>
              <TableCell className="text-right">
                <span className={
                  vendedor.comparativoMediaLoja && vendedor.comparativoMediaLoja > 0
                    ? "text-emerald-600"
                    : vendedor.comparativoMediaLoja && vendedor.comparativoMediaLoja < 0
                    ? "text-destructive"
                    : ""
                }>
                  {vendedor.comparativoMediaLoja !== undefined
                    ? `${vendedor.comparativoMediaLoja > 0 ? '+' : ''}${vendedor.comparativoMediaLoja.toFixed(1)}%`
                    : '-'
                  }
                </span>
                {getComparativoIcon(vendedor.comparativoMediaLoja)}
              </TableCell>
              <TableCell className="text-right">{vendedor.qtdTransacoes.toLocaleString('pt-BR')}</TableCell>
              <TableCell className="text-right">
                <span className={vendedor.percentualDesconto > 15 ? "text-destructive" : ""}>
                  {vendedor.percentualDesconto.toFixed(1)}%
                </span>
              </TableCell>
            </TableRow>
          ))}
          {ranking.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Nenhum dado disponível. Clique em "Carregar Dados" para buscar.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
