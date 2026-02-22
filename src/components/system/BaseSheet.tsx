import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type SheetSize = "default" | "wide";

const sizeClasses: Record<SheetSize, string> = {
  default: "sm:max-w-md",
  wide: "sm:max-w-2xl",
};

interface BaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Extra content rendered to the right of the title row (badges, action buttons) */
  headerExtra?: React.ReactNode;
  size?: SheetSize;
  /** Sticky footer content (buttons) */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function BaseSheet({
  open,
  onOpenChange,
  title,
  description,
  headerExtra,
  size = "default",
  footer,
  children,
  className,
}: BaseSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex flex-col p-0",
          sizeClasses[size],
          className,
        )}
      >
        {/* Fixed header */}
        <SheetHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle>{title}</SheetTitle>
              {description && <SheetDescription className="mt-1">{description}</SheetDescription>}
            </div>
            {headerExtra && (
              <div className="flex items-center gap-2 shrink-0">
                {headerExtra}
              </div>
            )}
          </div>
        </SheetHeader>

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
      </SheetContent>
    </Sheet>
  );
}
