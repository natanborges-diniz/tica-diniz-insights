// src/components/zeiss-pedido/ZeissFormatoAroSelector.tsx
// Visual selector for Zeiss frame shapes (formatoAro) using official reference images
// Includes editable text input so user can correct the code if API rejects it

import React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const ZEISS_FORMATOS: { code: string; label: string; file: string }[] = [
  { code: "vis01", label: "vis01", file: "VIS01.png" },
  { code: "vis02", label: "vis02", file: "VIS02.png" },
  { code: "vis03", label: "vis03", file: "VIS03.png" },
  { code: "vis04", label: "vis04", file: "VIS04.png" },
  { code: "vis05", label: "vis05", file: "VIS05.png" },
  { code: "vis06", label: "vis06", file: "VIS06.png" },
  { code: "vis07", label: "vis07", file: "VIS07.png" },
  { code: "vis08", label: "vis08", file: "VIS08.png" },
  { code: "vis09", label: "vis09", file: "VIS09.png" },
  { code: "vis10", label: "vis10", file: "VIS10.png" },
  { code: "vis11", label: "vis11", file: "VIS11.png" },
  { code: "vis12", label: "vis12", file: "VIS12.png" },
  { code: "vis13", label: "vis13", file: "VIS13.png" },
  { code: "vis14", label: "vis14", file: "VIS14.png" },
  { code: "vis15", label: "vis15", file: "VIS15.png" },
  { code: "6OP", label: "6OP", file: "6OP.png" },
  { code: "1RA", label: "1RA", file: "1RA.png" },
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
