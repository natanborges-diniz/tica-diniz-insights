import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AnaliseFamiliaVendedor } from '@/services/vendasService';

interface SalesFamilyTableProps { dados: AnaliseFamiliaVendedor[]; }

export function SalesFamilyTable({ dados }: SalesFamilyTableProps) {
  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Vendedor</TableHead><TableHead>Família</TableHead><TableHead className="text-right">Transações</TableHead><TableHead className="text-right">Produtos</TableHead><TableHead className="text-right">Total Vendido</TableHead><TableHead className="text-right">Ticket Médio</TableHead></TableRow></TableHeader>
        <TableBody>
          {dados.length === 0 ? (<TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum dado encontrado</TableCell></TableRow>) : dados.map((item, index) => {
            const ticketMedio = item.qtdTransacao > 0 ? item.totalVendido / item.qtdTransacao : 0;
            return (<TableRow key={`${item.codEmpresa}-${item.codVendedor}-${item.familia}-${index}`}><TableCell className="font-medium">{item.empresa}</TableCell><TableCell>{item.vendedor}</TableCell><TableCell>{item.familia}</TableCell><TableCell className="text-right">{item.qtdTransacao.toLocaleString('pt-BR')}</TableCell><TableCell className="text-right">{item.qtdProdutos.toLocaleString('pt-BR')}</TableCell><TableCell className="text-right">{formatCurrency(item.totalVendido)}</TableCell><TableCell className="text-right">{formatCurrency(ticketMedio)}</TableCell></TableRow>);
          })}
        </TableBody>
      </Table>
    </div>
  );
}
