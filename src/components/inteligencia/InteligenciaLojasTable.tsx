import { LojaInteligencia } from "@/hooks/useInteligenciaVendas";
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
import { Trophy } from "lucide-react";

interface InteligenciaLojasTableProps {
  ranking: LojaInteligencia[];
  compact?: boolean;
}

function getMedalha(posicao: number) {
  if (posicao === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (posicao === 2) return <Trophy className="h-5 w-5 text-gray-400" />;
  if (posicao === 3) return <Trophy className="h-5 w-5 text-amber-600" />;
  return <span className="text-muted-foreground">{posicao}º</span>;
}

function getStatusBadge(status?: LojaInteligencia['status'], percentual?: number) {
  if (percentual === undefined) return <Badge variant="outline">Sem meta</Badge>;
  
  switch (status) {
    case 'ACIMA_MEDIA':
      return <Badge className="bg-emerald-500">✓ {percentual.toFixed(0)}%</Badge>;
    case 'NO_RITMO':
      return <Badge className="bg-blue-500">{percentual.toFixed(0)}%</Badge>;
    case 'EM_RISCO':
      return <Badge className="bg-yellow-500">{percentual.toFixed(0)}%</Badge>;
    case 'CRITICO':
      return <Badge variant="destructive">{percentual.toFixed(0)}%</Badge>;
    default:
      return <Badge variant="outline">{percentual.toFixed(0)}%</Badge>;
  }
}

export function InteligenciaLojasTable({ ranking, compact = false }: InteligenciaLojasTableProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

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
              <TableCell className="text-right text-emerald-600 font-semibold">
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

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16 text-center">#</TableHead>
            <TableHead>Loja</TableHead>
            <TableHead className="text-right">Vendas Válidas</TableHead>
            <TableHead className="text-right">Ticket Médio</TableHead>
            <TableHead className="text-right">Qtd Vendas</TableHead>
            <TableHead className="text-right">% Desconto</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-right">Dias Rest.</TableHead>
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
              <TableCell className="text-right font-semibold text-emerald-600">
                {formatCurrency(loja.totalVendidoSemCreditos)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(loja.ticketMedio)}
              </TableCell>
              <TableCell className="text-right">{loja.qtdTransacoes.toLocaleString('pt-BR')}</TableCell>
              <TableCell className="text-right">
                <span className={loja.percentualDesconto > 15 ? "text-destructive" : ""}>
                  {loja.percentualDesconto.toFixed(1)}%
                </span>
              </TableCell>
              <TableCell className="text-center">
                {getStatusBadge(loja.status, loja.percentualMeta)}
              </TableCell>
              <TableCell className="text-right text-sm">
                {loja.diasUteisRestantes !== undefined ? (
                  <span className={loja.diasUteisRestantes <= 5 ? "text-destructive font-medium" : ""}>
                    {loja.diasUteisRestantes}
                  </span>
                ) : '-'}
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
              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                Nenhum dado disponível. Clique em "Carregar Dados" para buscar.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
