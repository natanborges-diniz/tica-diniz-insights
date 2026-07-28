// src/components/layout/DbFreshnessBanner.tsx
//
// Banner global de frescor dos dados. Aparece no topo quando a copia do
// Firebird no servidor esta desatualizada (ou quando nao foi possivel
// verificar). Some quando esta tudo fresco.

import { AlertTriangle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useDbFreshness } from "@/hooks/useDbFreshness";

function formatBR(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function pluralDias(n: number | null): string {
  if (n == null) return "";
  return `${n} ${n === 1 ? "dia" : "dias"}`;
}

export function DbFreshnessBanner() {
  const { data } = useDbFreshness();

  // Sem resposta ainda, ou tudo fresco -> nao mostra nada.
  if (!data || data.status === "fresh") return null;

  const naoVerificado = data.status === "indisponivel" || data.status === "desconhecido";
  const dataDados = formatBR(data.data_ultima_movimentacao);

  let titulo: string;
  let mensagem: string;

  if (naoVerificado) {
    titulo = "Frescor dos dados não verificado";
    mensagem =
      "Não foi possível confirmar se a cópia do banco no servidor está atualizada. Trate os números com cautela.";
  } else if (data.motivo_stale === "dados_desatualizados") {
    titulo = "Dados possivelmente desatualizados";
    mensagem =
      `A cópia do banco foi reconstruída, mas os dados mais recentes são de ${dataDados}` +
      (data.dados_lag_dias != null ? ` (há ${pluralDias(data.dados_lag_dias)})` : "") +
      ". A fonte do backup no servidor pode estar parada.";
  } else if (data.motivo_stale === "copia_parada") {
    titulo = "Dados desatualizados";
    mensagem =
      `A cópia do banco não é atualizada há ${pluralDias(data.copia_lag_dias)}. ` +
      `O job de atualização no servidor pode estar parado. Últimos dados: ${dataDados}.`;
  } else {
    titulo = "Dados possivelmente desatualizados";
    mensagem = `Os dados podem não estar atualizados. Movimentação mais recente: ${dataDados}.`;
  }

  return (
    <Alert variant={naoVerificado ? "default" : "destructive"} className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{titulo}</AlertTitle>
      <AlertDescription>{mensagem}</AlertDescription>
    </Alert>
  );
}
