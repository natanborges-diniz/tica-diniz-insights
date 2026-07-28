// src/components/metas/CortesSemanaDialog.tsx
// Editor dos CORTES SEMANAIS do mês comercial (21→20): o sistema sugere as
// semanas (segunda→domingo), o gestor edita a data de FIM de cada corte — o
// início do corte seguinte é sempre fim+1, mantendo tudo contíguo — e salva.
// Cortes valem para a rede toda (metas_semana_cortes); os dias úteis de cada
// corte continuam por loja.

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { addDaysISO } from "@/lib/recebimentos/semanaComercial";
import { validarCortes, type CorteSemana } from "@/lib/metas/metasSemanais";
import {
  getSemanaCortes,
  salvarSemanaCortes,
  removerSemanaCortes,
} from "@/services/metasSemanaisService";
import { inicioSemanaComercial } from "@/lib/recebimentos/semanaComercial";

function fmtData(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

/** Sugestão automática: semanas seg→dom truncadas no período. */
function sugerirCortes(periodoIni: string, periodoFim: string): CorteSemana[] {
  const cortes: CorteSemana[] = [];
  let inicio = periodoIni;
  while (inicio <= periodoFim) {
    // fim sugerido = domingo da semana comercial do início (ou fim do período)
    const domingo = addDaysISO(inicioSemanaComercial(inicio), 6);
    const fim = domingo > periodoFim ? periodoFim : domingo;
    cortes.push({ semanaInicio: inicio, semanaFim: fim });
    inicio = addDaysISO(fim, 1);
  }
  return cortes;
}

interface CortesSemanaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ano: number;
  mes: number;
  mesLabel: string;
  periodoIni: string;
  periodoFim: string;
  /** Chamado após salvar/remover cortes (para regerar semanas) */
  onChanged: () => void;
}

export function CortesSemanaDialog({
  open, onOpenChange, ano, mes, mesLabel, periodoIni, periodoFim, onChanged,
}: CortesSemanaDialogProps) {
  const [cortes, setCortes] = useState<CorteSemana[]>([]);
  const [manuais, setManuais] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const existentes = await getSemanaCortes(ano, mes);
      if (existentes.length) {
        setCortes(existentes);
        setManuais(true);
      } else {
        setCortes(sugerirCortes(periodoIni, periodoFim));
        setManuais(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar cortes");
    } finally {
      setLoading(false);
    }
  }, [ano, mes, periodoIni, periodoFim]);

  useEffect(() => {
    if (open) carregar();
  }, [open, carregar]);

  // editar o FIM de um corte: os inícios seguintes são reencadeados (fim+1) e
  // cortes que ficarem vazios são absorvidos
  const editarFim = (idx: number, novoFim: string) => {
    if (!novoFim) return;
    const novo: CorteSemana[] = [];
    let inicio = cortes[0].semanaInicio;
    for (let i = 0; i < cortes.length; i++) {
      const fimDesejado = i === idx ? novoFim : cortes[i].semanaFim;
      let fim = fimDesejado;
      if (fim < inicio) fim = inicio; // corte mínimo de 1 dia
      if (fim > periodoFim) fim = periodoFim;
      novo.push({ semanaInicio: inicio, semanaFim: fim });
      inicio = addDaysISO(fim, 1);
      if (inicio > periodoFim) break; // cortes seguintes absorvidos
    }
    // garantir cobertura até o fim do período
    if (novo.length && novo[novo.length - 1].semanaFim < periodoFim) {
      novo[novo.length - 1] = { ...novo[novo.length - 1], semanaFim: periodoFim };
    }
    setCortes(novo);
  };

  const dividirCorte = (idx: number) => {
    const c = cortes[idx];
    if (c.semanaInicio === c.semanaFim) {
      toast.error("Corte de 1 dia não pode ser dividido");
      return;
    }
    // divide ao meio
    const dias =
      (new Date(c.semanaFim + "T12:00:00Z").getTime() -
        new Date(c.semanaInicio + "T12:00:00Z").getTime()) /
      86400000;
    const meio = addDaysISO(c.semanaInicio, Math.floor(dias / 2));
    const novo = [...cortes];
    novo.splice(idx, 1,
      { semanaInicio: c.semanaInicio, semanaFim: meio },
      { semanaInicio: addDaysISO(meio, 1), semanaFim: c.semanaFim }
    );
    setCortes(novo);
  };

  const unirComProximo = (idx: number) => {
    if (idx >= cortes.length - 1) return;
    const novo = [...cortes];
    novo.splice(idx, 2, {
      semanaInicio: cortes[idx].semanaInicio,
      semanaFim: cortes[idx + 1].semanaFim,
    });
    setCortes(novo);
  };

  const erros = validarCortes(cortes, periodoIni, periodoFim);

  const handleSalvar = async () => {
    if (erros.length) {
      toast.error(erros[0]);
      return;
    }
    setSalvando(true);
    try {
      const { avisos } = await salvarSemanaCortes(ano, mes, cortes);
      avisos.forEach((a) => toast.warning(a));
      toast.success(`Cortes de ${mesLabel} salvos — gere as semanas para recalcular as metas`);
      onOpenChange(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar cortes");
    } finally {
      setSalvando(false);
    }
  };

  const handleVoltarSugestao = async () => {
    try {
      await removerSemanaCortes(ano, mes);
      setCortes(sugerirCortes(periodoIni, periodoFim));
      setManuais(false);
      toast.success("Voltou para a sugestão automática (seg→dom)");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover cortes");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Cortes das semanas — {mesLabel} {ano}</DialogTitle>
          <DialogDescription>
            Período comercial {fmtData(periodoIni)} a {fmtData(periodoFim)} (21→20).
            Edite a data de <strong>fim</strong> de cada corte — o início do próximo é sempre o
            dia seguinte. Os cortes valem para todas as lojas.
            {manuais && <Badge className="ml-2">cortes manuais ativos</Badge>}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground text-center py-6">Carregando...</p>
        ) : (
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead className="text-center">Dias</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cortes.map((c, i) => {
                  const dias =
                    Math.round(
                      (new Date(c.semanaFim + "T12:00:00Z").getTime() -
                        new Date(c.semanaInicio + "T12:00:00Z").getTime()) /
                        86400000
                    ) + 1;
                  return (
                    <TableRow key={c.semanaInicio}>
                      <TableCell>{i + 1}ª</TableCell>
                      <TableCell className="text-sm">{fmtData(c.semanaInicio)}</TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          className="w-40"
                          value={c.semanaFim}
                          min={c.semanaInicio}
                          max={periodoFim}
                          onChange={(e) => editarFim(i, e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{dias}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost" size="icon" title="Dividir este corte ao meio"
                          onClick={() => dividirCorte(i)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        {i < cortes.length - 1 && (
                          <Button
                            variant="ghost" size="icon" title="Unir com o próximo corte"
                            onClick={() => unirComProximo(i)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {erros.map((e, i) => (
              <Alert key={i} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{e}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={handleVoltarSugestao}>
            <Sparkles className="h-4 w-4 mr-2" />
            Sugestão automática
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando || !!erros.length}>
            {salvando ? "Salvando..." : "Salvar cortes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
