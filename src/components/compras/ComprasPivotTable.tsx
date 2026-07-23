import { PivotTable, PivotColumn, PivotView } from "@/components/ui/pivot-table";
import { ComprasNota } from "@/services/comprasService";
import { ShoppingCart } from "lucide-react";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { formatters } from "@/utils/exportData";

interface Props {
  notas: ComprasNota[];
  onViewChange?: (v: PivotView) => void;
}

const fmtBRL = (v: number) => v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "—";
const fmtInt = (v: number) => v?.toLocaleString("pt-BR") ?? "—";
const fmtDias = (v: number) => `${Math.round(v)}d`;

const columns: PivotColumn<ComprasNota>[] = [
  { key: "fornecedor", header: "Fornecedor", type: "dimension" },
  { key: "empresaNome", header: "Loja", type: "dimension" },
  { key: "mes", header: "Mês", type: "dimension" },
  { key: "conta", header: "Conta contábil", type: "dimension" },
  { key: "formaPagamento", header: "Forma pgto", type: "dimension" },
  { key: "documento", header: "Documento", type: "dimension" },
  { key: "valorTotal", header: "Valor (R$)", type: "measure", format: fmtBRL, aggregate: "sum" },
  { key: "qtdParcelas", header: "Parcelas", type: "measure", format: fmtInt, aggregate: "sum" },
  { key: "prazoMedioDias", header: "Prazo médio", type: "measure", format: fmtDias, aggregate: "avg" },
];

const exportColumns = [
  { key: "fornecedor", header: "Fornecedor" },
  { key: "empresaNome", header: "Loja" },
  { key: "dataEmissao", header: "Emissão", format: formatters.date },
  { key: "documento", header: "Documento" },
  { key: "conta", header: "Conta" },
  { key: "formaPagamento", header: "Forma pgto" },
  { key: "valorTotal", header: "Valor", format: formatters.currency },
  { key: "qtdParcelas", header: "Parcelas", format: formatters.number },
  { key: "prazoMedioDias", header: "Prazo médio (d)", format: formatters.number },
];

export function ComprasPivotTable({ notas, onViewChange }: Props) {
  const hoje = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <strong>Nota</strong>: documento + fornecedor + emissão · <strong>Valor</strong>: soma das parcelas ·
          {" "}<strong>Prazo</strong>: dias entre emissão e vencimento médio
        </p>
        <DataTableToolbar
          exportOptions={{
            filename: `compras-${hoje}`,
            title: "Compras por Fornecedor",
            columns: exportColumns,
            data: notas as unknown as Record<string, any>[],
          }}
        />
      </div>
      <PivotTable
        data={notas}
        columns={columns}
        defaultGroupBy={["fornecedor"]}
        title="Detalhamento de Compras"
        icon={<ShoppingCart className="h-5 w-5" />}
        emptyMessage="Nenhuma compra no período"
        onViewChange={onViewChange}
      />
    </div>
  );
}
