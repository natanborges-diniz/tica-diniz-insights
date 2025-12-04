import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AnaliseEstoqueAcao } from '@/services/firebirdBridge';

interface StockTableProps {
  dados: AnaliseEstoqueAcao[];
}

export function StockTable({ dados }: StockTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Grife</TableHead>
            <TableHead>Cód. Barras</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right">Qtde Estoque</TableHead>
            <TableHead className="text-right">Dias Estoque</TableHead>
            <TableHead>Ação Sugerida</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dados.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                Nenhum dado encontrado
              </TableCell>
            </TableRow>
          ) : (
            dados.map((item, index) => (
              <TableRow key={`${item.CODIGO_BARRA}-${index}`}>
                <TableCell className="font-medium">{item.EMPRESA}</TableCell>
                <TableCell>{item.NOME_FORNECEDOR}</TableCell>
                <TableCell>{item.GRIFE}</TableCell>
                <TableCell>{item.CODIGO_BARRA}</TableCell>
                <TableCell className="max-w-[200px] truncate">{item.DESCRICAO_PRODUTO}</TableCell>
                <TableCell className="text-right">{item.QUANTIDADE_ESTOQUE?.toLocaleString('pt-BR')}</TableCell>
                <TableCell className="text-right">{item.DIAS_ESTOQUE}</TableCell>
                <TableCell>{item.ACAO_SUGERIDA}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
