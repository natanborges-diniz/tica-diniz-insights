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
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
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
