// src/components/system/SearchField.tsx
// Campo de pesquisa padrão das telas: ícone à esquerda, limpar à direita.
//
// Existe para que "pesquisar" tenha a mesma aparência e o mesmo comportamento em
// qualquer módulo — inclusive o atalho Esc para limpar sem tirar a mão do teclado.

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Rótulo acima do campo (opcional — combina com as barras de filtro). */
  label?: string;
  className?: string;
  /** Quantidade de resultados, mostrada ao lado quando há termo. */
  resultados?: number;
}

export function SearchField({
  value,
  onChange,
  placeholder = "Pesquisar...",
  label,
  className,
  resultados,
}: SearchFieldProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {label && <label className="text-xs text-muted-foreground">{label}</label>}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && value) {
              e.preventDefault();
              onChange("");
            }
          }}
          placeholder={placeholder}
          aria-label={label || placeholder}
          className="h-9 pl-8 pr-8"
        />
        {value && (
          <button
            type="button"
            aria-label="Limpar pesquisa"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {value && resultados !== undefined && (
        <p className="text-[11px] text-muted-foreground">
          {resultados === 0 ? "nenhum resultado" : `${resultados} resultado(s)`}
        </p>
      )}
    </div>
  );
}
