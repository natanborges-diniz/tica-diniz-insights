import { PivotTable, PivotColumn } from '@/components/ui/pivot-table';
import { AnaliseFamiliaVendedor } from '@/services/vendasService';
import { LayoutGrid } from 'lucide-react';

interface SalesFamilyTableProps {
  dados: AnaliseFamiliaVendedor[];
}

const formatCurrency = (v: number) => 
  v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—';

const formatNumber = (v: number) => 
  v?.toLocaleString('pt-BR') ?? '—';

// Configuração das colunas para a PivotTable
const columns: PivotColumn<AnaliseFamiliaVendedor>[] = [
  // Dimensões (podem ser usadas para agrupar)
  { key: 'empresa', header: 'Empresa', type: 'dimension' },
  { key: 'vendedor', header: 'Vendedor', type: 'dimension' },
  { key: 'familia', header: 'Família', type: 'dimension' },
  { key: 'fornecedor', header: 'Fornecedor', type: 'dimension' },
  
  // Medidas (valores agregados)
  { key: 'qtdTransacao', header: 'Transações', type: 'measure', format: formatNumber, aggregate: 'sum' },
  { key: 'qtdProdutos', header: 'Produtos', type: 'measure', format: formatNumber, aggregate: 'sum' },
  { key: 'totalVendido', header: 'Total Vendido', type: 'measure', format: formatCurrency, aggregate: 'sum' },
];

export function SalesFamilyTable({ dados }: SalesFamilyTableProps) {
  return (
    <PivotTable
      data={dados}
      columns={columns}
      defaultGroupBy={['empresa', 'familia']}
      title="Detalhamento por Família"
      icon={<LayoutGrid className="h-5 w-5" />}
      emptyMessage="Nenhum dado encontrado"
    />
  );
}
