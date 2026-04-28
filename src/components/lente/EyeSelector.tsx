// src/components/lente/EyeSelector.tsx
// Seletor binocular/monocular para pedidos de lentes em laboratórios.
// Default = ambos. Pelo menos 1 olho deve permanecer ativo.

import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EyesSelection {
  od: boolean;
  oe: boolean;
}

interface EyeSelectorProps {
  value: EyesSelection;
  onChange: (next: EyesSelection) => void;
  className?: string;
}

export function EyeSelector({ value, onChange, className }: EyeSelectorProps) {
  function toggle(side: "od" | "oe") {
    const next = { ...value, [side]: !value[side] };
    // Garante ao menos 1 olho selecionado
    if (!next.od && !next.oe) return;
    onChange(next);
  }

  const isMonocular = !(value.od && value.oe);

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mr-1">
        Olhos do pedido
      </span>
      <button
        type="button"
        onClick={() => toggle("od")}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors",
          value.od
            ? "bg-blue-500/10 border-blue-500/40 text-blue-700 dark:text-blue-300"
            : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/60",
        )}
        aria-pressed={value.od}
      >
        <Eye className="h-3.5 w-3.5" />
        Olho Direito (OD)
      </button>
      <button
        type="button"
        onClick={() => toggle("oe")}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors",
          value.oe
            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
            : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/60",
        )}
        aria-pressed={value.oe}
      >
        <Eye className="h-3.5 w-3.5" />
        Olho Esquerdo (OE)
      </button>
      {isMonocular && (
        <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-semibold ml-1">
          Pedido monocular — somente {value.od ? "OD" : "OE"}
        </span>
      )}
    </div>
  );
}
