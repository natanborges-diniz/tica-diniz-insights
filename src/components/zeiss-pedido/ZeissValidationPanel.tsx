// src/components/zeiss-pedido/ZeissValidationPanel.tsx
// Displays validation errors/warnings before submission

import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, XCircle } from "lucide-react";
import { ValidationError } from "@/services/zeissValidation";

interface Props {
  errors: ValidationError[];
}

const ZeissValidationPanel: React.FC<Props> = ({ errors }) => {
  if (errors.length === 0) return null;

  const blockingErrors = errors.filter(e => e.severity === "error");
  const warnings = errors.filter(e => e.severity === "warning");

  return (
    <div className="space-y-2">
      {blockingErrors.length > 0 && (
        <Alert className="border-destructive/50 bg-destructive/5">
          <XCircle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-sm space-y-1">
            {blockingErrors.map((e, i) => (
              <p key={i} className="text-destructive">{e.message}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert className="border-amber-300 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm space-y-1">
            {warnings.map((e, i) => (
              <p key={i} className="text-amber-700">{e.message}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ZeissValidationPanel;
