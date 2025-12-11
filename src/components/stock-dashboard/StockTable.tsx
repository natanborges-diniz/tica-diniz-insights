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
            <TableHead>Marca</TableHead>
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
              <TableRow key={`${item.codigoBarra}-${index}`}>
                <TableCell className="font-medium">{item.empresa}</TableCell>
                <TableCell>{item.fornecedor}</TableCell>
                <TableCell>{item.marca}</TableCell>
                <TableCell>{item.codigoBarra}</TableCell>
                <TableCell className="max-w-[200px] truncate">{item.descricao}</TableCell>
                <TableCell className="text-right">{item.quantidadeEstoque?.toLocaleString('pt-BR')}</TableCell>
                <TableCell className="text-right">{item.diasEstoque}</TableCell>
                <TableCell>{item.acaoSugerida}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
