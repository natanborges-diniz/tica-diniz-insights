// src/components/ui/data-table-toolbar.tsx
// Componente reutilizável de toolbar para tabelas com exportação

import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, File } from "lucide-react";
import { ExportOptions, exportToCSV, exportToExcel, exportToPDF } from "@/utils/exportData";

interface DataTableToolbarProps {
  exportOptions: ExportOptions;
  children?: React.ReactNode;
}

export function DataTableToolbar({ exportOptions, children }: DataTableToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap flex-1">
        {children}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => exportToCSV(exportOptions)}>
            <FileText className="h-4 w-4 mr-2" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportToExcel(exportOptions)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportToPDF(exportOptions)}>
            <File className="h-4 w-4 mr-2" />
            PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
