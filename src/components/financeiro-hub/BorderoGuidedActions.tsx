import { Info, FileCheck, Send, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BorderoActionsProps {
  status: string;
  isAdmin: boolean;
  onAprovar: () => void;
  onEnviar: () => void;
  onConfirmar: () => void;
  onCancelar: () => void;
  isPendingAprovar: boolean;
  isPendingEnviar: boolean;
  isPendingConfirmar: boolean;
  isPendingCancelar: boolean;
}

const STEP_HINTS: Record<string, { step: number; label: string; hint: string; color: string }> = {
  MONTAGEM: {
    step: 3,
    label: "Passo 3 — Aprovar borderô",
    hint: "Revise os lançamentos e aprove o borderô para liberar o envio ao banco.",
    color: "text-amber-600",
  },
  APROVADO: {
    step: 4,
    label: "Passo 4 — Enviar ao BTG",
    hint: "O borderô está aprovado. Clique em 'Enviar BTG' para transmitir os pagamentos ao banco.",
    color: "text-primary",
  },
  ENVIADO: {
    step: 5,
    label: "Passo 5 — Confirmar processamento",
    hint: "O lote foi enviado ao banco. Após confirmação de pagamento, clique em 'Confirmar Baixa' para registrar no financeiro.",
    color: "text-green-600",
  },
};

export function BorderoGuidedActions({
  status, isAdmin,
  onAprovar, onEnviar, onConfirmar, onCancelar,
  isPendingAprovar, isPendingEnviar, isPendingConfirmar, isPendingCancelar,
}: BorderoActionsProps) {
  const stepHint = STEP_HINTS[status];

  return (
    <div className="flex items-center gap-2">
      {stepHint && (
        <div className="flex items-center gap-1.5 mr-2">
          <Badge variant="outline" className={`text-[10px] ${stepHint.color} border-current/20`}>
            {stepHint.label}
          </Badge>
        </div>
      )}

      {status === "MONTAGEM" && isAdmin && (
        <Button size="sm" variant="outline" onClick={onAprovar} disabled={isPendingAprovar}>
          <FileCheck className="h-3.5 w-3.5 mr-1" /> Aprovar
        </Button>
      )}
      {status === "APROVADO" && isAdmin && (
        <Button size="sm" variant="default" onClick={onEnviar} disabled={isPendingEnviar}>
          <Send className="h-3.5 w-3.5 mr-1" /> Enviar BTG
        </Button>
      )}
      {status === "ENVIADO" && isAdmin && (
        <Button size="sm" variant="default" onClick={onConfirmar} disabled={isPendingConfirmar}>
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirmar Baixa
        </Button>
      )}
      {["MONTAGEM", "APROVADO"].includes(status) && (
        <Button size="sm" variant="ghost" onClick={onCancelar} disabled={isPendingCancelar}>
          <XCircle className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
