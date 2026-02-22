import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  className?: string;
  /** "inline" for within cards, "page" for full-page */
  variant?: "inline" | "page";
}

export function LoadingState({
  message = "Carregando...",
  className,
  variant = "inline",
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "page" ? "min-h-[50vh]" : "py-12 px-4",
        className
      )}
      role="status"
      aria-busy="true"
      aria-label={message}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
