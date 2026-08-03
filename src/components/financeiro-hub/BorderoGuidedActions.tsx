import { FileCheck, Send, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BorderoActionsProps {
  status: string;
  isAdmin: boolean;
  /** Momento em que o borderô entrou em ENVIADO (usamos updated_at). */
  enviadoEm?: string | null;
  /** Data de pagamento do borderô (yyyy-MM-dd). Nulo = pagamento imediato. */
  dataPagamento?: string | null;
  onAprovar: () => void;
  onEnviar: () => void;
  onConfirmar: () => void;
  onCancelar: () => void;
  isPendingAprovar: boolean;
  isPendingEnviar: boolean;
  isPendingConfirmar: boolean;
  isPendingCancelar: boolean;
}

// Os números aqui espelham o WorkflowStepper do topo da página
// (1 Cadastrar · 2 Validar · 3 Preparar Pgto · 4 Montar Borderô ·
//  5 Aprovar e Enviar · 6 Aguardar Banco). Estavam um passo atrás, o que fazia
// o mesmo borderô aparecer como "Passo 5" na linha e "Aguardar Banco" (6) no topo.
const STEP_HINTS: Record<string, { label: string; hint: string; color: string }> = {
  MONTAGEM: {
    label: "Passo 4 — Montar borderô",
    hint: "Revise os lançamentos e envie ao BTG. Itens fora da faixa vão para a Mesa.",
    color: "text-amber-600",
  },
  APROVADO: {
    label: "Passo 5 — Aprovar e enviar",
    hint: "O borderô está aprovado. Clique em 'Enviar BTG' para transmitir os pagamentos ao banco.",
    color: "text-primary",
  },
  ENVIADO: {
    label: "Passo 6 — Aguardar banco",
    hint: "Os pagamentos foram transmitidos e aguardam aprovação no app do BTG. A baixa é registrada automaticamente quando o banco confirma.",
    color: "text-green-600",
  },
};

/** Horas em ENVIADO sem retorno a partir das quais a baixa manual é liberada. */
const HORAS_ATE_BAIXA_MANUAL = 24;

/**
 * A baixa é automática (btg-poll-status consulta o BTG e baixa com valor e data
 * reais). O botão manual existe só como rede de segurança para quando esse
 * retorno não chega — webhook perdido, pagamento que só aparece no extrato.
 *
 * Liberamos apenas quando as duas condições valem:
 *   1. já passou da data de pagamento (um borderô agendado fica legitimamente
 *      em ENVIADO até lá, e nesse caso não há nada de errado);
 *   2. o borderô está em ENVIADO há mais de 24 h.
 *
 * Antes disso o botão fica escondido de propósito: ele grava valor cheio e data
 * de hoje, então clicar cedo registra no DRE uma baixa que ainda não aconteceu.
 */
function liberaBaixaManual(enviadoEm?: string | null, dataPagamento?: string | null): boolean {
  const agora = Date.now();

  if (dataPagamento) {
    const hoje = new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10); // BRT
    if (hoje < dataPagamento) return false; // ainda agendado, aguardando normalmente
  }

  if (!enviadoEm) return true; // sem referência de tempo, não bloqueia o operador
  const horas = (agora - new Date(enviadoEm).getTime()) / 3_600_000;
  return horas >= HORAS_ATE_BAIXA_MANUAL;
}

export function BorderoGuidedActions({
  status, isAdmin, enviadoEm, dataPagamento,
  onAprovar, onEnviar, onConfirmar, onCancelar,
  isPendingAprovar, isPendingEnviar, isPendingConfirmar, isPendingCancelar,
}: BorderoActionsProps) {
  const stepHint = STEP_HINTS[status];
  const mostrarBaixaManual =
    status === "ENVIADO" && isAdmin && liberaBaixaManual(enviadoEm, dataPagamento);

  return (
    <div className="flex items-center gap-2">
      {stepHint && (
        <div className="flex items-center gap-1.5 mr-2">
          <Badge variant="outline" className={`text-[10px] ${stepHint.color} border-current/20`} title={stepHint.hint}>
            {stepHint.label}
          </Badge>
        </div>
      )}

      {status === "MONTAGEM" && (
        <>
          {/* 100% lastreado (verde/azul) envia direto — a aprovação do dinheiro é a
              confirmação do admin no app BTG. Itens fora da faixa/exceção/sem lastro
              são bloqueados pelo backend com orientação para a Mesa. */}
          <Button size="sm" variant="default" onClick={onEnviar} disabled={isPendingEnviar}
            title="Borderô 100% com lastro na faixa envia direto; o admin confirma no app BTG">
            <Send className="h-3.5 w-3.5 mr-1" /> Enviar BTG
          </Button>
          {/* "Verificar" em vez de "Mesa": abre o diagnóstico do próprio
              borderô — o que trava, por quê e o que resolve — com a liberação
              ali mesmo. Mandar o admin para a Mesa o obrigava a achar sozinho,
              no meio de todos os lançamentos da empresa, quais eram os deste
              borderô e o que cada selo significava. */}
          <Button size="sm" variant="outline" onClick={onAprovar} disabled={isPendingAprovar}
            title="Mostra o que impede o envio deste borderô e permite liberar">
            <FileCheck className="h-3.5 w-3.5 mr-1" /> Verificar
          </Button>
        </>
      )}
      {status === "APROVADO" && (
        <Button size="sm" variant="default" onClick={onEnviar} disabled={isPendingEnviar}>
          <Send className="h-3.5 w-3.5 mr-1" /> Enviar BTG
        </Button>
      )}

      {status === "ENVIADO" && !mostrarBaixaManual && (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground"
          title="A baixa entra sozinha quando o BTG confirma, com o valor e a data reais do pagamento.">
          <Clock className="h-3.5 w-3.5" /> Aguardando retorno do banco
        </span>
      )}

      {mostrarBaixaManual && (
        <Button size="sm" variant="outline" onClick={onConfirmar} disabled={isPendingConfirmar}
          title="Exceção: sem retorno do banco há mais de 24 h. Registra a baixa com o valor cheio e a data de hoje — confira o extrato antes.">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Baixa manual
        </Button>
      )}

      {["MONTAGEM", "APROVADO"].includes(status) && (
        <Button size="sm" variant="ghost" onClick={onCancelar} disabled={isPendingCancelar}
          title='Cancelar o borderô: os títulos voltam para "Em Preparo" e podem ser selecionados de novo'>
          <XCircle className="h-3.5 w-3.5 mr-1" /> Desmanchar
        </Button>
      )}
    </div>
  );
}
