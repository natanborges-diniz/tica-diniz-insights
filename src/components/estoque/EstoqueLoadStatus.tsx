// src/components/estoque/EstoqueLoadStatus.tsx
// Indicador compartilhado que mostra qual loja foi carregada e há quanto tempo.
// Usado em VisaoEstoque, AnaliseOTB e OQueFazer para tornar visível
// que os dados são compartilhados entre as páginas.

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEstoqueStore } from "@/stores/useEstoqueStore";

interface Props {
  empresaNome?: string;
  onRecarregar?: () => void;
  loading?: boolean;
}

function formatarTempoDecorrido(ms: number): string {
  const seg = Math.floor(ms / 1000);
  if (seg < 60) return "agora";
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  return `há ${horas}h`;
}

export function EstoqueLoadStatus({ empresaNome, onRecarregar, loading }: Props) {
  const carregadoEm = useEstoqueStore((s) => s.carregadoEm);
  const empresaCarregada = useEstoqueStore((s) => s.empresaCarregada);
  const filters = useEstoqueStore((s) => s.filters);
  const [, force] = useState(0);

  // Atualiza o "há X min" a cada 30s
  useEffect(() => {
    if (!carregadoEm) return;
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [carregadoEm]);

  if (!carregadoEm || empresaCarregada === null) return null;

  const empresaMudou =
    filters.empresa !== null && String(filters.empresa) !== String(empresaCarregada);

  return (
    <Alert className={empresaMudou ? "border-amber-500/40 bg-amber-500/5" : "bg-primary/5 border-primary/20"}>
      <Info className="h-4 w-4 text-primary" />
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>
          {empresaMudou ? (
            <>
              Loja selecionada mudou. Dados ainda mostram <strong>{empresaNome ?? `empresa ${empresaCarregada}`}</strong>.
              Clique em recarregar para atualizar.
            </>
          ) : (
            <>
              <strong>{empresaNome ?? `Empresa ${empresaCarregada}`}</strong> · dados carregados {formatarTempoDecorrido(Date.now() - carregadoEm)}
              <span className="text-muted-foreground ml-2">(compartilhados entre Visão Estoque e Plano de Compra)</span>
            </>
          )}
        </span>
        {onRecarregar && (
          <Button size="sm" variant="outline" onClick={onRecarregar} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
