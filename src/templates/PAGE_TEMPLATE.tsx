/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  TEMPLATE: Nova Página com DataTable                        ║
 * ║  Copie este arquivo e renomeie para sua nova página.        ║
 * ║  Substitua os TODOs e remova este bloco.                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Checklist obrigatório antes de PR:
 * [ ] Todas as cores usam tokens semânticos (success/warning/danger/info/chart-N)
 * [ ] Overlays usam BaseDialog ou BaseSheet (nunca Dialog/Sheet direto)
 * [ ] DataTable com emptyState, errorState, sortableKeys validados
 * [ ] Mobile: coluna essencial sempre visível, demais mobileVisible: false
 * [ ] onRowClick com suporte a teclado (Enter/Space)
 * [ ] ActionBar + useDirtyGuard em telas de edição
 * [ ] Export via DataTableToolbar com dataset filtrado completo
 * [ ] Breadcrumbs registrados no AppBreadcrumbs.tsx
 * [ ] aria-sort, aria-label, foco visível
 */

import React, { useState, useCallback } from "react";
import { DataTable, DataTableColumn, QueryState } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { BaseSheet } from "@/components/system/BaseSheet";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

// TODO: Definir o tipo dos dados
interface RowData {
  id: string;
  nome: string;
  valor: number;
  status: "ativo" | "inativo";
}

// TODO: Definir colunas
const columns: DataTableColumn<RowData>[] = [
  {
    key: "nome",
    header: "Nome",
    sortable: true,
    // Coluna essencial: sempre visível no mobile
  },
  {
    key: "valor",
    header: "Valor",
    sortable: true,
    align: "right",
    mobileVisible: false,
    cell: (row) => `R$ ${row.valor.toLocaleString("pt-BR")}`,
  },
  {
    key: "status",
    header: "Status",
    mobileVisible: false,
    cell: (row) => (
      <Badge
        variant="outline"
        className={
          row.status === "ativo"
            ? "bg-success-soft text-success border-success-muted"
            : "bg-muted text-muted-foreground"
        }
      >
        {row.status}
      </Badge>
    ),
  },
];

export default function TemplatePage() {
  // TODO: Substituir por hook real (useApiQuery, etc.)
  const data: RowData[] = [];
  const loading = false;
  const error: Error | null = null;

  const [queryState, setQueryState] = useState<QueryState>({
    page: 1,
    pageSize: 20,
    sort: null,
    search: "",
  });

  const [selectedRow, setSelectedRow] = useState<RowData | null>(null);

  const handleRowClick = useCallback((row: RowData) => {
    setSelectedRow(row);
  }, []);

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={data}
        mode="client"
        queryState={queryState}
        onQueryChange={setQueryState}
        rowKey={(row) => row.id}
        loading={loading}
        onRowClick={handleRowClick}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p>Nenhum registro encontrado.</p>
          </div>
        }
        errorState={
          error ? (
            <div className="flex flex-col items-center gap-2 py-8 text-danger">
              <AlertCircle className="h-8 w-8" />
              <p>Erro ao carregar dados: {error.message}</p>
            </div>
          ) : undefined
        }
        toolbar={
          <DataTableToolbar
            exportOptions={{
              data,
              columns: columns.map((c) => ({ key: c.key, header: c.header })),
              filename: "template-export",
            }}
          />
        }
      />

      {/* Detalhe via Sheet */}
      <BaseSheet
        open={!!selectedRow}
        onOpenChange={(open) => !open && setSelectedRow(null)}
        title={selectedRow?.nome ?? ""}
        description="Detalhes do registro"
      >
        {selectedRow && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Valor</p>
              <p className="text-lg font-bold">
                R$ {selectedRow.valor.toLocaleString("pt-BR")}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge
                variant="outline"
                className={
                  selectedRow.status === "ativo"
                    ? "bg-success-soft text-success border-success-muted"
                    : "bg-muted text-muted-foreground"
                }
              >
                {selectedRow.status}
              </Badge>
            </div>
          </div>
        )}
      </BaseSheet>
    </div>
  );
}
