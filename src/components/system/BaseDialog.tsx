import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DialogSize = "sm" | "md";

const sizeClasses: Record<DialogSize, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
};

interface BaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: DialogSize;
  /** Sticky footer content (buttons) */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function BaseDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  footer,
  children,
  className,
}: BaseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 p-0 max-h-[80vh] transition-all duration-200 ease-out",
          sizeClasses[size],
          className,
        )}
      >
        {/* Fixed header */}
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Optional fixed footer */}
        {footer && (
          <div className="shrink-0 border-t bg-background px-6 py-3 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
