// src/components/system/LojaSelect.tsx
// Seletor de LOJA padronizado — sempre o primeiro campo de qualquer tela de
// filtro/consulta, com destaque visual para não haver dúvida de qual unidade
// está sendo pesquisada.
//
// Regras:
//  - rótulo fixo "Loja"
//  - ícone de loja + nome em negrito no gatilho
//  - "Todas as lojas" como PRIMEIRA opção quando permitido (canSeeAll)
//  - valor null = todas as lojas

import { Store, Loader2, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useUserEmpresas } from "@/hooks/useUserEmpresas";
import { cn } from "@/lib/utils";

export const TODAS_LOJAS = "TODAS";

interface LojaSelectProps {
  /** null = todas as lojas */
  value: number | null;
  onChange: (codEmpresa: number | null) => void;
  /** Exibe a opção "Todas as lojas" (respeita a permissão do usuário) */
  allowAll?: boolean;
  /** Oculta o rótulo (quando a tela já tem um cabeçalho próprio) */
  hideLabel?: boolean;
  className?: string;
  disabled?: boolean;
}

export function LojaSelect({
  value,
  onChange,
  allowAll = true,
  hideLabel = false,
  className,
  disabled,
}: LojaSelectProps) {
  const { empresas, isLoading, error, canSeeAll } = useUserEmpresas();
  const podeTodas = allowAll && canSeeAll;
  const atual = empresas.find((e) => e.codEmpresa === value);

  return (
    <div className="space-y-1.5">
      {!hideLabel && (
        <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Store className="h-3.5 w-3.5" />
          Loja
        </Label>
      )}
      <Select
        value={value !== null && value !== undefined ? String(value) : TODAS_LOJAS}
        onValueChange={(v) => onChange(v === TODAS_LOJAS ? null : Number(v))}
        disabled={disabled || isLoading}
      >
        <SelectTrigger
          className={cn(
            "w-[260px] h-10 border-primary/40 bg-primary/[0.04] font-semibold",
            className,
          )}
        >
          {isLoading ? (
            <span className="flex items-center gap-2 font-normal">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando lojas...
            </span>
          ) : error ? (
            <span className="flex items-center gap-2 text-destructive font-normal">
              <AlertCircle className="h-4 w-4" /> Erro ao carregar lojas
            </span>
          ) : (
            <span className="flex items-center gap-2 truncate">
              <Store className="h-4 w-4 text-primary shrink-0" />
              <SelectValue placeholder="Selecione a loja">
                {value === null ? "Todas as lojas" : (atual?.nome || `Loja ${value}`)}
              </SelectValue>
            </span>
          )}
        </SelectTrigger>
        <SelectContent>
          {podeTodas && <SelectItem value={TODAS_LOJAS}>Todas as lojas</SelectItem>}
          {empresas.map((e) => (
            <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
              {e.nome || `Loja ${e.codEmpresa}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
