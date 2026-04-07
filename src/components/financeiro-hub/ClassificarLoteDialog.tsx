import { useState } from "react";
import { BaseDialog } from "@/components/system/BaseDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";

interface PlanoContaItem {
  id: string;
  conta_numero: string;
  conta_descricao: string;
  grupo_dre: string;
  categoria: string;
}

interface ClassificarLoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planoContas: PlanoContaItem[];
  selectedCount: number;
  selectedTotal: number;
  onConfirm: (natureza: string, categoria: string, subcategoria: string) => void;
  isPending: boolean;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function ClassificarLoteDialog({
  open, onOpenChange, planoContas, selectedCount, selectedTotal, onConfirm, isPending,
}: ClassificarLoteDialogProps) {
  const [subcategoria, setSubcategoria] = useState("");
  const [natureza, setNatureza] = useState("");
  const [categoria, setCategoria] = useState("");

  const handleContaChange = (val: string) => {
    setSubcategoria(val);
    const conta = planoContas.find(c => c.conta_descricao === val);
    if (conta) {
      setNatureza(conta.grupo_dre);
      setCategoria(conta.categoria);
    }
  };

  const handleConfirm = () => {
    onConfirm(natureza, categoria, subcategoria);
    setSubcategoria("");
    setNatureza("");
    setCategoria("");
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Validar em Lote"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={isPending || !subcategoria}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> Classificar {selectedCount}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
          <p className="text-sm font-medium text-primary">{selectedCount} lançamento(s) selecionado(s)</p>
          <p className="text-xs text-muted-foreground">Total: <strong>{fmtCurrency(selectedTotal)}</strong></p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800">
            A classificação move os lançamentos de <strong>PREVISTO</strong> para <strong>CLASSIFICADO</strong>,
            oficializando-os na agenda de contas a pagar.
          </p>
        </div>
        <div className="space-y-1">
          <Label>Conta *</Label>
          <Select value={subcategoria} onValueChange={handleContaChange}>
            <SelectTrigger><SelectValue placeholder="Selecione a conta do plano de contas" /></SelectTrigger>
            <SelectContent>
              {planoContas.map(c => (
                <SelectItem key={c.id} value={c.conta_descricao}>
                  {c.conta_descricao.toUpperCase()} ({c.conta_numero})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {natureza && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Natureza (DRE)</Label>
              <div className="text-sm px-3 py-2 border rounded-md bg-muted/30 text-muted-foreground">
                {natureza.replace(/_/g, " ")}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <div className="text-sm px-3 py-2 border rounded-md bg-muted/30 text-muted-foreground">
                {categoria.replace(/_/g, " ")}
              </div>
            </div>
          </div>
        )}
      </div>
    </BaseDialog>
  );
}
