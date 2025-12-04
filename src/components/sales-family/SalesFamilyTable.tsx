import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AnaliseFamiliaVendedor } from '@/services/firebirdBridge';

interface SalesFamilyTableProps {
  dados: AnaliseFamiliaVendedor[];
}

export function SalesFamilyTable({ dados }: SalesFamilyTableProps) {
  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>Família</TableHead>
            <TableHead className="text-right">Transações</TableHead>
            <TableHead className="text-right">Produtos</TableHead>
            <TableHead className="text-right">Total Vendido</TableHead>
            <TableHead className="text-right">Ticket Médio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dados.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Nenhum dado encontrado
              </TableCell>
            </TableRow>
          ) : (
            dados.map((item, index) => {
              const ticketMedio =
                item.QTD_TRANSACAO > 0 ? item.TOTAL_VENDIDO / item.QTD_TRANSACAO : 0;
              return (
                <TableRow key={`${item.COD_EMPRESA}-${item.COD_VENDEDOR}-${item.FAMILIA}-${index}`}>
                  <TableCell className="font-medium">{item.EMPRESA}</TableCell>
                  <TableCell>{item.VENDEDOR}</TableCell>
                  <TableCell>{item.FAMILIA}</TableCell>
                  <TableCell className="text-right">
                    {item.QTD_TRANSACAO.toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.QTD_PRODUTOS.toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(item.TOTAL_VENDIDO)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(ticketMedio)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
