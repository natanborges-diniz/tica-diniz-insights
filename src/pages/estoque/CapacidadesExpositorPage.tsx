import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionBar } from "@/components/system/ActionBar";
import { useDirtyGuard } from "@/components/system/dirty/useDirtyGuard";
import { LoadingState, ErrorState } from "@/components/system/states";
import { toastPatterns } from "@/lib/toastPatterns";
import { Package } from "lucide-react";

interface CapacidadeRow {
  id: string;
  cod_empresa: number;
  capacidade_total: number;
  percentual_solar: number;
}

const NOMES_LOJAS: Record<number, string> = {
  1: "DINIZ PRIMITIVA I",
  2: "DINIZ PRIMITIVA II",
  4: "DINIZ CARAPICUIBA",
  6: "DINIZ UNIAO",
  9: "DINIZ ANTONIO AGU",
  13: "DINIZ SUPER",
  14: "DINIZ JANDIRA",
  15: "DINIZ ITAPEVI",
  16: "DINIZ BARUERI",
  17: "DINIZ STO ANTONIO",
  18: "DINIZ SUPER SHOPPING",
};

export default function CapacidadesExpositorPage() {
  const { isDirty, setDirty, setClean } = useDirtyGuard();
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [rows, setRows] = useState<CapacidadeRow[]>([]);
  const [original, setOriginal] = useState<CapacidadeRow[]>([]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["capacidade_expositor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capacidade_expositor")
        .select("id, cod_empresa, capacidade_total, percentual_solar")
        .order("cod_empresa");
      if (error) throw error;
      return data as CapacidadeRow[];
    },
  });

  useEffect(() => {
    if (data) {
      setRows(data.map((r) => ({ ...r })));
      setOriginal(data.map((r) => ({ ...r })));
      setClean();
    }
  }, [data, setClean]);

  const update = (id: string, field: "capacidade_total" | "percentual_solar", value: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setDirty();
  };

  const changedRows = useMemo(() => {
    const origMap = new Map(original.map((r) => [r.id, r]));
    return rows.filter((r) => {
      const o = origMap.get(r.id);
      return !o || o.capacidade_total !== r.capacidade_total || o.percentual_solar !== r.percentual_solar;
    });
  }, [rows, original]);

  const hasInvalid = rows.some(
    (r) =>
      !Number.isFinite(r.capacidade_total) ||
      r.capacidade_total < 0 ||
      r.percentual_solar < 0 ||
      r.percentual_solar > 100,
  );

  const handleSave = async () => {
    if (hasInvalid) {
      toastPatterns.warning("Valores inválidos", "Capacidade ≥ 0 e Solar entre 0 e 100.");
      return;
    }
    setStatus("loading");
    try {
      for (const r of changedRows) {
        const { error } = await supabase
          .from("capacidade_expositor")
          .update({
            capacidade_total: r.capacidade_total,
            percentual_solar: r.percentual_solar,
          })
          .eq("id", r.id);
        if (error) throw error;
      }
      setStatus("success");
      toastPatterns.saved("Capacidades");
      setClean();
      await refetch();
      setTimeout(() => setStatus("idle"), 1500);
    } catch (e: any) {
      setStatus("idle");
      toastPatterns.error("Falha ao salvar", e?.message ?? "Tente novamente.");
    }
  };

  const handleCancel = () => {
    setRows(original.map((r) => ({ ...r })));
    setClean();
  };

  if (isLoading) return <LoadingState message="Carregando capacidades..." variant="page" />;
  if (isError) return <ErrorState description="Não foi possível carregar." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 pb-20">
      <header className="flex items-center gap-3">
        <div className="rounded-md bg-brand-soft p-2 text-primary">
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CAPACIDADE DO EXPOSITOR</h1>
          <p className="text-sm text-muted-foreground">
            Defina a capacidade total de armações por loja e o percentual destinado a Solar. RX e Solar são calculados automaticamente.
          </p>
        </div>
      </header>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Cód.</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead className="w-[160px] text-right">Capacidade Total</TableHead>
              <TableHead className="w-[140px] text-right">% Solar</TableHead>
              <TableHead className="w-[120px] text-right text-muted-foreground">RX</TableHead>
              <TableHead className="w-[120px] text-right text-muted-foreground">Solar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const origMap = new Map(original.map((o) => [o.id, o]));
              const o = origMap.get(r.id);
              const isChanged =
                o && (o.capacidade_total !== r.capacidade_total || o.percentual_solar !== r.percentual_solar);
              const solar = Math.round((r.capacidade_total * r.percentual_solar) / 100);
              const rx = r.capacidade_total - solar;
              const invalidPct = r.percentual_solar < 0 || r.percentual_solar > 100;
              const invalidTot = !Number.isFinite(r.capacidade_total) || r.capacidade_total < 0;

              return (
                <TableRow key={r.id} className={isChanged ? "bg-warning-soft/40" : ""}>
                  <TableCell className="font-mono text-sm">{r.cod_empresa}</TableCell>
                  <TableCell className="font-medium">
                    {NOMES_LOJAS[r.cod_empresa] ?? `EMPRESA ${r.cod_empresa}`}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      value={r.capacidade_total}
                      onChange={(e) => update(r.id, "capacidade_total", parseInt(e.target.value || "0", 10))}
                      className={`h-9 text-right ${invalidTot ? "border-danger" : ""}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={r.percentual_solar}
                      onChange={(e) => update(r.id, "percentual_solar", parseInt(e.target.value || "0", 10))}
                      className={`h-9 text-right ${invalidPct ? "border-danger" : ""}`}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{rx.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{solar.toLocaleString("pt-BR")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ActionBar
        visible={isDirty}
        status={status}
        saveDisabled={hasInvalid || changedRows.length === 0}
        onSave={handleSave}
        onCancel={handleCancel}
      >
        <span>
          {changedRows.length} {changedRows.length === 1 ? "linha alterada" : "linhas alteradas"}
        </span>
      </ActionBar>
    </div>
  );
}
