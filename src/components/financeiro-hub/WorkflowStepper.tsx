import { CheckCircle2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  number: number;
  title: string;
  description: string;
  status: "completed" | "active" | "pending";
  count?: number;
}

interface WorkflowStepperProps {
  steps: Step[];
  onStepClick?: (stepNumber: number) => void;
  activeStepNumber?: number;
}

export function WorkflowStepper({ steps, onStepClick, activeStepNumber }: WorkflowStepperProps) {
  const isClickable = !!onStepClick;

  const StepCircle = ({ step, size = "md" }: { step: Step; size?: "sm" | "md" }) => {
    const dim = size === "sm" ? "w-8 h-8" : "w-9 h-9";
    const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
    const isSelected = activeStepNumber === step.number;
    return (
      <div
        className={cn(
          dim, "rounded-full flex items-center justify-center text-sm font-bold transition-colors shrink-0",
          step.status === "completed" && "bg-primary text-primary-foreground",
          step.status === "active" && "bg-primary/15 text-primary ring-2 ring-primary",
          step.status === "pending" && "bg-muted text-muted-foreground",
          isSelected && step.status !== "active" && "ring-2 ring-primary/50",
        )}
      >
        {step.status === "completed" ? <CheckCircle2 className={iconSize} /> : step.number}
      </div>
    );
  };

  return (
    <div className="bg-card border rounded-xl p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Fluxo de Pagamento — Passo a Passo
      </p>
      {/* Desktop: horizontal */}
      <div className="hidden sm:flex items-start gap-0">
        {steps.map((step, i) => (
          <div key={step.number} className="flex items-start flex-1 min-w-0">
            <button
              type="button"
              className={cn(
                "flex flex-col items-center text-center flex-1 min-w-0 rounded-lg py-1 transition-colors",
                isClickable && "cursor-pointer hover:bg-muted/50",
                !isClickable && "cursor-default",
              )}
              onClick={() => onStepClick?.(step.number)}
            >
              <StepCircle step={step} />
              <p className={cn(
                "text-xs font-semibold mt-1.5 leading-tight",
                step.status === "active" ? "text-primary" : "text-foreground",
              )}>
                {step.title}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight px-1">
                {step.description}
              </p>
              {step.count !== undefined && step.count > 0 && (
                <span className={cn(
                  "mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
                  step.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}>
                  {step.count}
                </span>
              )}
            </button>
            {i < steps.length - 1 && (
              <ArrowRight className={cn(
                "h-4 w-4 mt-2.5 shrink-0 mx-1",
                step.status === "completed" ? "text-primary" : "text-muted-foreground/40",
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Mobile: vertical layout */}
      <div className="flex sm:hidden flex-col gap-3">
        {steps.map((step) => (
          <button
            key={step.number}
            type="button"
            className={cn(
              "flex items-start gap-3 rounded-lg p-1.5 transition-colors text-left",
              isClickable && "cursor-pointer hover:bg-muted/50",
              !isClickable && "cursor-default",
            )}
            onClick={() => onStepClick?.(step.number)}
          >
            <StepCircle step={step} size="sm" />
            <div className="min-w-0 flex-1">
              <p className={cn("text-xs font-semibold", step.status === "active" ? "text-primary" : "text-foreground")}>
                {step.title}
                {step.count !== undefined && step.count > 0 && (
                  <span className={cn(
                    "ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    step.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}>
                    {step.count}
                  </span>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{step.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
