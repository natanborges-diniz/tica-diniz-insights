import { RankingLoja } from "@/hooks/useRankingLojas";
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

interface RankingLojasTableProps {
  ranking: RankingLoja[];
}

function getMedalha(posicao: number) {
  if (posicao === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (posicao === 2) return <Trophy className="h-5 w-5 text-gray-400" />;
  if (posicao === 3) return <Trophy className="h-5 w-5 text-amber-600" />;
  return <span className="text-muted-foreground">{posicao}º</span>;
}

function getMetaBadge(percentual: number | undefined) {
  if (percentual === undefined) return <Badge variant="outline">Sem meta</Badge>;
  if (percentual >= 100) return <Badge className="bg-green-500">✓ {percentual.toFixed(0)}%</Badge>;
  if (percentual >= 80) return <Badge className="bg-yellow-500">{percentual.toFixed(0)}%</Badge>;
  return <Badge variant="destructive">{percentual.toFixed(0)}%</Badge>;
}

export function RankingLojasTable({ ranking }: RankingLojasTableProps) {
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16 text-center">#</TableHead>
            <TableHead>Loja</TableHead>
            <TableHead className="text-right">Faturamento</TableHead>
            <TableHead className="text-right">Ticket Médio</TableHead>
            <TableHead className="text-right">Qtd Vendas</TableHead>
            <TableHead className="text-right">% Devolução</TableHead>
            <TableHead className="text-center">Meta</TableHead>
            <TableHead className="w-32">Progresso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranking.map((loja) => (
            <TableRow key={loja.codEmpresa} className={loja.posicao <= 3 ? "bg-muted/30" : ""}>
              <TableCell className="text-center font-medium">
                {getMedalha(loja.posicao)}
              </TableCell>
              <TableCell className="font-medium">{loja.empresa}</TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(loja.totalVendido)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(loja.ticketMedio)}
              </TableCell>
              <TableCell className="text-right">{loja.qtdTransacoes.toLocaleString('pt-BR')}</TableCell>
              <TableCell className="text-right">
                <span className={loja.percentualDevolucao > 5 ? "text-destructive" : ""}>
                  {loja.percentualDevolucao.toFixed(1)}%
                </span>
              </TableCell>
              <TableCell className="text-center">
                {getMetaBadge(loja.percentualMeta)}
              </TableCell>
              <TableCell>
                {loja.percentualMeta !== undefined && (
                  <Progress 
                    value={Math.min(loja.percentualMeta, 100)} 
                    className="h-2"
                  />
                )}
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
