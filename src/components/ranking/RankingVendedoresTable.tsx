import { RankingVendedor } from "@/hooks/useRankingVendedores";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface RankingVendedoresTableProps {
  ranking: RankingVendedor[];
}

function getMedalha(posicao: number) {
  if (posicao === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (posicao === 2) return <Trophy className="h-5 w-5 text-gray-400" />;
  if (posicao === 3) return <Trophy className="h-5 w-5 text-amber-600" />;
  return <span className="text-muted-foreground">{posicao}º</span>;
}

function getComparativoIcon(valor: number) {
  if (valor > 5) return <TrendingUp className="h-4 w-4 text-green-500 inline ml-1" />;
  if (valor < -5) return <TrendingDown className="h-4 w-4 text-red-500 inline ml-1" />;
  return <Minus className="h-4 w-4 text-muted-foreground inline ml-1" />;
}

function getMetaBadge(percentual: number | undefined) {
  if (percentual === undefined) return <Badge variant="outline">Sem meta</Badge>;
  if (percentual >= 100) return <Badge className="bg-green-500">✓ {percentual.toFixed(0)}%</Badge>;
  if (percentual >= 80) return <Badge className="bg-yellow-500">{percentual.toFixed(0)}%</Badge>;
  return <Badge variant="destructive">{percentual.toFixed(0)}%</Badge>;
}

export function RankingVendedoresTable({ ranking }: RankingVendedoresTableProps) {
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

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
            <TableHead className="text-center">Meta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranking.map((vendedor) => (
            <TableRow key={`${vendedor.codEmpresa}-${vendedor.vendedor}`} className={vendedor.posicao <= 3 ? "bg-muted/30" : ""}>
              <TableCell className="text-center font-medium">
                {getMedalha(vendedor.posicao)}
              </TableCell>
              <TableCell className="font-medium">{vendedor.vendedor}</TableCell>
              <TableCell>
                <Badge variant="outline">{vendedor.empresa}</Badge>
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(vendedor.totalVendido)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(vendedor.ticketMedio)}
              </TableCell>
              <TableCell className="text-right">
                <span className={vendedor.comparativoMediaLoja && vendedor.comparativoMediaLoja > 0 ? "text-green-600" : vendedor.comparativoMediaLoja && vendedor.comparativoMediaLoja < 0 ? "text-red-600" : ""}>
                  {vendedor.comparativoMediaLoja !== undefined 
                    ? `${vendedor.comparativoMediaLoja > 0 ? '+' : ''}${vendedor.comparativoMediaLoja.toFixed(1)}%`
                    : '-'
                  }
                </span>
                {vendedor.comparativoMediaLoja !== undefined && getComparativoIcon(vendedor.comparativoMediaLoja)}
              </TableCell>
              <TableCell className="text-right">{vendedor.qtdTransacoes.toLocaleString('pt-BR')}</TableCell>
              <TableCell className="text-center">
                {getMetaBadge(vendedor.percentualMeta)}
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
