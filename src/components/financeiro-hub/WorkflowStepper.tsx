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
}

export function WorkflowStepper({ steps }: WorkflowStepperProps) {
  return (
    <div className="bg-card border rounded-xl p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Fluxo de Pagamento — Passo a Passo
      </p>
      <div className="flex items-start gap-0">
        {steps.map((step, i) => (
          <div key={step.number} className="flex items-start flex-1 min-w-0">
            <div className="flex flex-col items-center text-center flex-1 min-w-0">
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors shrink-0",
                  step.status === "completed" && "bg-primary text-primary-foreground",
                  step.status === "active" && "bg-primary/15 text-primary ring-2 ring-primary",
                  step.status === "pending" && "bg-muted text-muted-foreground",
                )}
              >
                {step.status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  step.number
                )}
              </div>
              <p
                className={cn(
                  "text-xs font-semibold mt-1.5 leading-tight",
                  step.status === "active" ? "text-primary" : "text-foreground",
                )}
              >
                {step.title}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight px-1">
                {step.description}
              </p>
              {step.count !== undefined && step.count > 0 && (
                <span
                  className={cn(
                    "mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
                    step.status === "active"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {step.count}
                </span>
              )}
            </div>
            {i < steps.length - 1 && (
              <ArrowRight
                className={cn(
                  "h-4 w-4 mt-2.5 shrink-0 mx-1",
                  step.status === "completed"
                    ? "text-primary"
                    : "text-muted-foreground/40",
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
