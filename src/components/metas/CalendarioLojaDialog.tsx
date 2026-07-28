// src/components/metas/CalendarioLojaDialog.tsx
// Calendário interativo do período comercial de UMA loja: mostra cada dia como
// útil/fechado (domingo, feriado, exceção) e permite alternar com um clique
// (grava/remova lojas_excecoes) e ligar/desligar abre-domingo/abre-feriado
// (lojas_configuracao). Os dias úteis alimentam a meta diária:
// meta diária = meta mensal ÷ dias úteis do período.

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getFeriados,
  getLojaConfiguracao,
  getLojasExcecoes,
  upsertLojaConfiguracao,
  upsertLojaExcecao,
  deleteLojaExcecao,
} from "@/services/calendarioService";
import type { Feriado, LojaConfiguracao, LojaExcecao } from "@/lib/metas/calendario";

interface DiaInfo {
  data: string; // YYYY-MM-DD
  dia: number;
  diaSemana: number; // 0=dom
  ehDomingo: boolean;
  feriado: Feriado | null;
  excecao: LojaExcecao | null;
  aberto: boolean;
}

interface CalendarioLojaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  codEmpresa: number;
  nomeLoja: string;
  /** Período comercial (datas ISO) */
  dataInicio: string;
  dataFim: string;
  /** Chamado após qualquer alteração salva (para recomputar dias úteis) */
  onChanged: () => void;
}

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function listarDias(inicio: string, fim: string): { data: string; dia: number; diaSemana: number }[] {
  const dias: { data: string; dia: number; diaSemana: number }[] = [];
  const d = new Date(inicio + "T12:00:00Z");
  const end = new Date(fim + "T12:00:00Z");
  while (d <= end) {
    const iso = d.toISOString().split("T")[0];
    dias.push({ data: iso, dia: d.getUTCDate(), diaSemana: d.getUTCDay() });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}

export function CalendarioLojaDialog({
  open, onOpenChange, codEmpresa, nomeLoja, dataInicio, dataFim, onChanged,
}: CalendarioLojaDialogProps) {
  const [config, setConfig] = useState<LojaConfiguracao | null>(null);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [excecoes, setExcecoes] = useState<LojaExcecao[]>([]);
  const [loading, setLoading] = useState(true);
  const [mudou, setMudou] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const ano = Number(dataInicio.slice(0, 4));
      const [cfg, fer, exc] = await Promise.all([
        getLojaConfiguracao(codEmpresa),
        getFeriados(ano),
        getLojasExcecoes(codEmpresa, dataInicio, dataFim),
      ]);
      setConfig(cfg);
      setFeriados(fer);
      setExcecoes(exc);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar calendário");
    } finally {
      setLoading(false);
    }
  }, [codEmpresa, dataInicio, dataFim]);

  useEffect(() => {
    if (open) {
      setMudou(false);
      carregar();
    }
  }, [open, carregar]);

  const dias: DiaInfo[] = useMemo(() => {
    const abreDomingo = config?.abreDomingo ?? false;
    const abreFeriado = config?.abreFeriado ?? false;
    const feriadosMap = new Map<string, Feriado>();
    feriados.forEach((f) => {
      if (f.recorrente) {
        const [, mes, dia] = f.data.split("-");
        // aplica no(s) ano(s) do período
        [dataInicio.slice(0, 4), dataFim.slice(0, 4)].forEach((ano) =>
          feriadosMap.set(`${ano}-${mes}-${dia}`, f)
        );
      } else {
        feriadosMap.set(f.data, f);
      }
    });
    const excMap = new Map(excecoes.map((e) => [e.data, e]));

    return listarDias(dataInicio, dataFim).map((d) => {
      const feriado = feriadosMap.get(d.data) ?? null;
      const excecao = excMap.get(d.data) ?? null;
      const ehDomingo = d.diaSemana === 0;
      let aberto: boolean;
      if (excecao) {
        aberto = excecao.aberto;
      } else {
        aberto = true;
        if (ehDomingo && !abreDomingo) aberto = false;
        if (feriado && !abreFeriado) aberto = false;
      }
      return { ...d, ehDomingo, feriado, excecao, aberto };
    });
  }, [config, feriados, excecoes, dataInicio, dataFim]);

  const diasUteis = dias.filter((d) => d.aberto).length;

  // clique no dia: cria exceção invertendo o estado; se já há exceção, remove-a
  const handleClickDia = async (d: DiaInfo) => {
    try {
      if (d.excecao) {
        await deleteLojaExcecao(d.excecao.id);
        toast.success(`Exceção de ${d.dia} removida — volta à regra padrão`);
      } else {
        await upsertLojaExcecao({
          codEmpresa,
          data: d.data,
          aberto: !d.aberto,
          motivo: d.aberto ? "Fechado (ajuste manual)" : "Aberto (ajuste manual)",
        });
        toast.success(`Dia ${d.dia}: ${d.aberto ? "fechado" : "aberto"} por exceção`);
      }
      setMudou(true);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar dia");
    }
  };

  const handleToggleConfig = async (campo: "abreDomingo" | "abreFeriado", valor: boolean) => {
    const base: Omit<LojaConfiguracao, "id"> = {
      codEmpresa,
      tipoLoja: config?.tipoLoja ?? "RUA",
      abreDomingo: config?.abreDomingo ?? false,
      abreFeriado: config?.abreFeriado ?? false,
      numVendedores: config?.numVendedores ?? 1,
      percentualAceitavel: config?.percentualAceitavel ?? 100,
      [campo]: valor,
    };
    const ok = await upsertLojaConfiguracao(base);
    if (!ok) {
      toast.error("Erro ao salvar configuração da loja");
      return;
    }
    setMudou(true);
    await carregar();
  };

  const fechar = () => {
    onOpenChange(false);
    if (mudou) onChanged();
  };

  // agrupar em linhas de semana (dom..sáb) para renderização
  const primeiraColuna = dias.length ? dias[0].diaSemana : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : fechar())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Calendário — {nomeLoja}</DialogTitle>
          <DialogDescription>
            Período {new Date(dataInicio + "T12:00:00Z").toLocaleDateString("pt-BR")} a{" "}
            {new Date(dataFim + "T12:00:00Z").toLocaleDateString("pt-BR")} ·{" "}
            <strong>{diasUteis} dias úteis</strong>. Clique num dia para abrir/fechar
            (vira exceção); clique de novo para voltar à regra.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={config?.abreDomingo ?? false}
                  onCheckedChange={(v) => handleToggleConfig("abreDomingo", v)}
                />
                Abre aos domingos
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={config?.abreFeriado ?? false}
                  onCheckedChange={(v) => handleToggleConfig("abreFeriado", v)}
                />
                Abre em feriados
              </label>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {DIAS_SEMANA.map((d, i) => (
                <div key={i} className="text-xs font-medium text-muted-foreground py-1">
                  {d}
                </div>
              ))}
              {Array.from({ length: primeiraColuna }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {dias.map((d) => (
                <button
                  key={d.data}
                  type="button"
                  onClick={() => handleClickDia(d)}
                  title={
                    (d.feriado ? `${d.feriado.descricao} · ` : "") +
                    (d.excecao ? "Exceção manual (clique p/ remover)" : d.aberto ? "Dia útil" : "Fechado")
                  }
                  className={[
                    "rounded-md py-1.5 text-sm border transition-colors",
                    d.aberto
                      ? "bg-primary/10 border-primary/30 hover:bg-primary/20"
                      : "bg-muted text-muted-foreground border-transparent hover:bg-muted/70 line-through",
                    d.excecao ? "ring-2 ring-amber-400" : "",
                  ].join(" ")}
                >
                  {d.dia}
                  {d.feriado && <span className="block text-[9px] leading-none">feriado</span>}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-primary/10 border border-primary/30" /> útil
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-muted" /> fechado
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded ring-2 ring-amber-400" /> exceção manual
              </span>
              <Badge variant="outline">{diasUteis} dias úteis no período</Badge>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={fechar}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
