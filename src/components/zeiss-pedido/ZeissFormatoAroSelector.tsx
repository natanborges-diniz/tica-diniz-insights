// src/components/zeiss-pedido/ZeissFormatoAroSelector.tsx
// Visual selector for Zeiss frame shapes (formatoAro) — mirrors Hoya's UX pattern

import React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * Zeiss frame shape codes and their SVG path data.
 * Based on the official MaisZeiss shape reference.
 */
const ZEISS_FORMATOS: { code: string; label: string; path: string }[] = [
  { code: "VIS01", label: "VIS01", path: "M12 8 Q12 6, 16 5 Q22 4, 28 5 Q34 6, 36 10 Q38 14, 36 20 Q36 26, 30 30 Q24 33, 18 32 Q12 31, 10 26 Q8 22, 8 16 Q8 10, 12 8Z" },
  { code: "VIS02", label: "VIS02", path: "M10 10 Q10 6, 16 5 Q24 4, 32 6 Q38 8, 38 14 Q38 22, 34 28 Q28 33, 20 33 Q12 33, 8 26 Q6 20, 8 14 Q8 10, 10 10Z" },
  { code: "VIS03", label: "VIS03", path: "M10 12 Q10 6, 18 5 Q26 4, 34 6 Q40 10, 38 18 Q36 26, 30 31 Q22 34, 14 32 Q8 28, 6 22 Q6 16, 10 12Z" },
  { code: "VIS04", label: "VIS04", path: "M8 14 Q8 8, 14 5 Q22 3, 30 5 Q38 8, 40 14 Q40 22, 38 28 Q32 33, 24 34 Q14 34, 8 28 Q6 22, 8 14Z" },
  { code: "VIS05", label: "VIS05", path: "M8 12 Q10 6, 18 4 Q26 3, 34 5 Q40 8, 42 16 Q42 24, 38 30 Q30 34, 22 35 Q14 34, 8 28 Q4 22, 6 16 Q6 12, 8 12Z" },
  { code: "VIS06", label: "VIS06", path: "M10 14 Q12 8, 20 5 Q28 4, 36 7 Q42 12, 42 20 Q40 28, 34 32 Q26 34, 18 33 Q10 30, 6 24 Q4 18, 8 14 Q8 14, 10 14Z" },
  { code: "VIS07", label: "VIS07", path: "M6 16 Q8 8, 16 5 Q26 3, 36 6 Q44 12, 42 20 Q40 28, 34 33 Q24 36, 14 34 Q6 28, 4 22 Q4 18, 6 16Z" },
  { code: "VIS08", label: "VIS08", path: "M14 8 Q14 5, 20 4 Q28 4, 34 6 Q38 10, 38 18 Q36 26, 30 32 Q22 34, 14 32 Q8 28, 8 20 Q10 12, 14 8Z" },
  { code: "VIS09", label: "VIS09", path: "M12 10 Q14 6, 22 4 Q30 4, 36 8 Q40 14, 40 22 Q36 30, 28 34 Q18 36, 10 30 Q6 24, 6 16 Q8 12, 12 10Z" },
  { code: "VIS10", label: "VIS10", path: "M10 14 Q12 8, 20 6 Q28 6, 36 8 Q40 14, 40 22 Q38 28, 32 32 Q24 34, 16 34 Q8 30, 6 24 Q6 18, 10 14Z" },
  { code: "VIS11", label: "VIS11", path: "M12 12 Q16 6, 24 5 Q32 6, 36 10 Q38 16, 38 24 Q34 30, 26 33 Q18 34, 12 30 Q8 24, 8 18 Q8 14, 12 12Z" },
  { code: "VIS12", label: "VIS12", path: "M14 10 Q18 6, 24 5 Q32 6, 38 10 Q40 18, 38 26 Q32 32, 24 34 Q16 34, 10 28 Q6 22, 8 16 Q10 12, 14 10Z" },
  { code: "VIS13", label: "VIS13", path: "M8 16 Q10 10, 18 6 Q28 4, 38 8 Q42 14, 42 22 Q38 30, 28 34 Q18 36, 8 30 Q4 24, 4 18 Q6 16, 8 16Z" },
  { code: "VIS14", label: "VIS14", path: "M10 16 Q14 8, 24 6 Q34 6, 40 12 Q42 20, 40 28 Q34 33, 24 34 Q14 33, 8 28 Q6 22, 6 16 Q8 14, 10 16Z" },
  { code: "VIS15", label: "VIS15", path: "M16 8 Q16 6, 20 5 Q28 5, 32 6 Q36 10, 36 16 Q36 24, 32 30 Q26 34, 18 34 Q12 30, 10 24 Q10 16, 14 10 Q14 8, 16 8Z" },
  { code: "60P", label: "60P", path: "M14 10 Q18 6, 24 4 Q32 6, 36 12 Q38 18, 36 26 Q30 32, 22 34 Q14 32, 10 26 Q8 18, 10 12 Q12 10, 14 10Z" },
  { code: "1 RA", label: "1 RA", path: "M8 14 Q10 8, 18 5 Q28 4, 36 8 Q42 14, 42 22 Q38 30, 30 34 Q20 36, 12 32 Q6 26, 4 20 Q6 14, 8 14Z" },
];

interface Props {
  value: string;
  onChange: (code: string) => void;
}

const ZeissFormatoAroSelector: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase text-muted-foreground">Formato do Aro</Label>
      <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-9 gap-1.5">
        {ZEISS_FORMATOS.map((f) => (
          <button
            key={f.code}
            type="button"
            onClick={() => onChange(value === f.code ? "" : f.code)}
            className={cn(
              "relative flex flex-col items-center justify-center rounded-md border p-1.5 transition-all hover:border-primary/50 cursor-pointer aspect-square",
              value === f.code
                ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                : "border-border bg-background"
            )}
            title={f.label}
          >
            <svg
              viewBox="0 0 48 40"
              className={cn(
                "w-full h-auto",
                value === f.code ? "text-primary" : "text-muted-foreground/40"
              )}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="0.5"
            >
              <path d={f.path} fillOpacity={value === f.code ? 0.15 : 0.08} />
              <path d={f.path} fill="none" strokeWidth={value === f.code ? 1.5 : 0.8} />
            </svg>
            <span className={cn(
              "text-[9px] font-mono leading-none mt-0.5",
              value === f.code ? "text-primary font-semibold" : "text-muted-foreground"
            )}>
              {f.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ZeissFormatoAroSelector;
