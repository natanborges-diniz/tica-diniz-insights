import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionBarStatus = "idle" | "loading" | "success";

interface ActionBarProps {
  /** Show the bar (typically when dirty=true or status != idle) */
  visible: boolean;
  status?: ActionBarStatus;
  /** Label for save button */
  saveLabel?: string;
  /** Label for discard/cancel button */
  cancelLabel?: string;
  /** Disable save (e.g. validation errors) */
  saveDisabled?: boolean;
  onSave: () => void;
  onCancel: () => void;
  /** Extra content on the left side */
  children?: React.ReactNode;
  className?: string;
}

export function ActionBar({
  visible,
  status = "idle",
  saveLabel = "Salvar",
  cancelLabel = "Descartar",
  saveDisabled = false,
  onSave,
  onCancel,
  children,
  className,
}: ActionBarProps) {
  if (!visible && status === "idle") return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 border-t px-6 py-3",
        "bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80",
        "animate-in slide-in-from-bottom-2 duration-200",
        status === "success" && "border-t-success bg-success-soft/80",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {status === "success" ? (
          <>
            <Check className="h-4 w-4 text-success" />
            <span className="text-success font-medium">Salvo com sucesso</span>
          </>
        ) : (
          children ?? <span>Alterações não salvas</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={status === "loading"}
        >
          {cancelLabel}
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saveDisabled || status === "loading" || status === "success"}
        >
          {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === "success" && <Check className="h-4 w-4" />}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
