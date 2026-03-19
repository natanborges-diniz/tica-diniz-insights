// src/components/zeiss-pedido/ZeissFormatoAroSelector.tsx
// Visual selector for Zeiss frame shapes (formatoAro) using official reference images
// Includes editable text input so user can correct the code if API rejects it

import React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const ZEISS_FORMATOS: { code: string; label: string; file: string }[] = [
  { code: "VIS01", label: "VIS01", file: "VIS01.png" },
  { code: "VIS02", label: "VIS02", file: "VIS02.png" },
  { code: "VIS03", label: "VIS03", file: "VIS03.png" },
  { code: "VIS04", label: "VIS04", file: "VIS04.png" },
  { code: "VIS05", label: "VIS05", file: "VIS05.png" },
  { code: "VIS06", label: "VIS06", file: "VIS06.png" },
  { code: "VIS07", label: "VIS07", file: "VIS07.png" },
  { code: "VIS08", label: "VIS08", file: "VIS08.png" },
  { code: "VIS09", label: "VIS09", file: "VIS09.png" },
  { code: "VIS10", label: "VIS10", file: "VIS10.png" },
  { code: "VIS11", label: "VIS11", file: "VIS11.png" },
  { code: "VIS12", label: "VIS12", file: "VIS12.png" },
  { code: "VIS13", label: "VIS13", file: "VIS13.png" },
  { code: "VIS14", label: "VIS14", file: "VIS14.png" },
  { code: "VIS15", label: "VIS15", file: "VIS15.png" },
  { code: "60P", label: "60P", file: "60P.png" },
  { code: "1 RA", label: "1 RA", file: "1RA.png" },
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
              "relative flex flex-col items-center justify-center rounded-md border p-1 transition-all hover:border-primary/50 cursor-pointer aspect-square overflow-hidden",
              value === f.code
                ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                : "border-border bg-background"
            )}
            title={f.label}
          >
            <img
              src={`/images/formato-aro/${f.file}`}
              alt={f.label}
              className="w-full h-full object-contain"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Código do formato (ex: VIS01, 60P)"
          className="h-7 text-xs max-w-[200px]"
        />
        {value && (
          <span className="text-[10px] text-muted-foreground">
            Código enviado: <strong>{value}</strong>
          </span>
        )}
      </div>
    </div>
  );
};

export default ZeissFormatoAroSelector;
