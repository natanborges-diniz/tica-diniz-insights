// src/components/sales-dashboard/SalesRowDetailSheet.tsx
// Sheet reutilizável para detalhes de linha em tabelas de vendas

import { BaseSheet } from "@/components/system/BaseSheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface DetailField {
  label: string;
  value: string | number | React.ReactNode;
}

interface SalesRowDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  fields: DetailField[];
  /** Extra content below fields */
  children?: React.ReactNode;
}

function formatAutoValue(value: string | number | React.ReactNode): React.ReactNode {
  if (typeof value === "number") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }
  return value;
}

export function SalesRowDetailSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  badge,
  fields,
  children,
}: SalesRowDetailSheetProps) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={subtitle}
      headerExtra={badge}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f, i) => (
            <div key={i} className={i === 0 ? "col-span-2" : ""}>
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="text-sm font-medium">{formatAutoValue(f.value)}</p>
            </div>
          ))}
        </div>
        {children && (
          <>
            <Separator />
            {children}
          </>
        )}
      </div>
    </BaseSheet>
  );
}
