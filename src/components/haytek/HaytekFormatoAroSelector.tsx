// src/components/haytek/HaytekFormatoAroSelector.tsx
// Visual selector for Haytek frame shapes (modelImage) using official reference images

import React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const HAYTEK_FORMATOS: { code: string; label: string; file: string }[] = [
  { code: "001", label: "001", file: "01.jpg" },
  { code: "002", label: "002", file: "02.jpg" },
  { code: "003", label: "003", file: "03.jpg" },
  { code: "004", label: "004", file: "04.jpg" },
  { code: "005", label: "005", file: "05.jpg" },
  { code: "006", label: "006", file: "06.jpg" },
  { code: "007", label: "007", file: "07.jpg" },
  { code: "008", label: "008", file: "08.jpg" },
  { code: "009", label: "009", file: "09.jpg" },
  { code: "010", label: "010", file: "10.jpg" },
  { code: "011", label: "011", file: "11.jpg" },
  { code: "012", label: "012", file: "12.jpg" },
];

interface Props {
  value: string;
  onChange: (code: string) => void;
}

const HaytekFormatoAroSelector: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase text-muted-foreground">Formato do Aro (modelImage)</Label>
      <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-9 gap-1.5">
        {HAYTEK_FORMATOS.map((f) => (
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
              src={`/images/haytek-armacao/${f.file}`}
              alt={f.label}
              className="w-full h-full object-contain"
              loading="lazy"
            />
            <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-background/80 text-muted-foreground">
              {f.label}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Código (ex: 001, 012)"
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

export default HaytekFormatoAroSelector;
