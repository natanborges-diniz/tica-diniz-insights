import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionBar } from "@/components/system/ActionBar";
import { useDirtyGuard } from "@/components/system/dirty/useDirtyGuard";
import { LoadingState, ErrorState } from "@/components/system/states";
import { toastPatterns } from "@/lib/toastPatterns";
import { Package, Trash2, Plus } from "lucide-react";
import { calcularCapacidadePorCategoria } from "@/lib/estoque/capacidade";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BaseDialog } from "@/components/system/BaseDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CapacidadeRow {
  id: string;
  cod_empresa: number;
  capacidade_total: number;
  percentual_solar: number;
  mix_minimo: number | null;
}

interface MarcaConfigRow {
  id: string;
  cod_empresa: number;
  marca: string;
  pct_solar: number | null;
  estrategica: boolean;
  recem_introduzida: boolean;
  created_at: string;
  updated_at: string;
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

const LOJA_OPTIONS = Object.entries(NOMES_LOJAS).map(([cod, nome]) => ({
  value: Number(cod),
  label: nome,
}));

interface AddMarcaForm {
  cod_empresa: number;
  marca: string;
  pct_solar: string;
  estrategica: boolean;
  recem_introduzida: boolean;
}

const FORM_DEFAULT: AddMarcaForm = {
  cod_empresa: LOJA_OPTIONS[0].value,
  marca: "",
  pct_solar: "",
  estrategica: false,
  recem_introduzida: false,
};

export default function CapacidadesExpositorPage() {
  const { isDirty, setDirty, setClean } = useDirtyGuard();
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [rows, setRows] = useState<CapacidadeRow[]>([]);
  const [original, setOriginal] = useState<CapacidadeRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AddMarcaForm>(FORM_DEFAULT);

  const queryClient = useQueryClient();

  // Tab 1: Capacidade do Expositor
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["capacidade_expositor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capacidade_expositor")
        .select("id, cod_empresa, capacidade_total, percentual_solar, mix_minimo")
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

  const update = (
    id: string,
    field: "capacidade_total" | "percentual_solar" | "mix_minimo",
    value: number | null,
  ) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setDirty();
  };

  const changedRows = useMemo(() => {
    const origMap = new Map(original.map((r) => [r.id, r]));
    return rows.filter((r) => {
      const o = origMap.get(r.id);
      return (
        !o ||
        o.capacidade_total !== r.capacidade_total ||
        o.percentual_solar !== r.percentual_solar ||
        o.mix_minimo !== r.mix_minimo
      );
    });
  }, [rows, original]);

  const hasInvalid = rows.some(
    (r) =>
      !Number.isFinite(r.capacidade_total) ||
      r.capacidade_total < 0 ||
      r.percentual_solar < 0 ||
      r.percentual_solar > 100 ||
      (r.mix_minimo !== null && (!Number.isFinite(r.mix_minimo) || r.mix_minimo < 0)),
  );

  const handleSave = async () => {
    if (hasInvalid) {
      toastPatterns.warning("Valores inválidos", "Capacidade e Mín. do Mix ≥ 0; Solar entre 0 e 100.");
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
            mix_minimo: r.mix_minimo,
          })
          .eq("id", r.id);
        if (error) throw error;
      }
      setStatus("success");
      toastPatterns.saved("Capacidades");
      setClean();
      await refetch();
      setTimeout(() => setStatus("idle"), 1500);
    } catch (e: unknown) {
      setStatus("idle");
      toastPatterns.error("Falha ao salvar", e instanceof Error ? e.message : "Tente novamente.");
    }
  };

  const handleCancel = () => {
    setRows(original.map((r) => ({ ...r })));
    setClean();
  };

  // Tab 2: Marcas por Loja
  const {
    data: marcaRows,
    isLoading: isMarcaLoading,
    isError: isMarcaError,
    refetch: refetchMarca,
  } = useQuery({
    queryKey: ["marca_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marca_config")
        .select("*")
        .order("cod_empresa")
        .order("marca");
      if (error) throw error;
      return data as MarcaConfigRow[];
    },
  });

  const addMarca = useMutation({
    mutationFn: async (payload: Omit<MarcaConfigRow, "id" | "created_at" | "updated_at">) => {
      const { error } = await supabase
        .from("marca_config")
        .upsert(payload, { onConflict: "cod_empresa,marca" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marca_config"] });
      toastPatterns.saved("Override de marca");
      setDialogOpen(false);
      setForm(FORM_DEFAULT);
    },
    onError: (e: Error) => {
      toastPatterns.error("Falha ao salvar", e?.message ?? "Tente novamente.");
    },
  });

  const deleteMarca = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marca_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marca_config"] });
      toastPatterns.saved("Override removido");
    },
    onError: (e: Error) => {
      toastPatterns.error("Falha ao remover", e?.message ?? "Tente novamente.");
    },
  });

  const handleAddSubmit = () => {
    const marca = form.marca.trim();
    if (!marca) {
      toastPatterns.warning("Marca obrigatória", "Informe o nome da marca.");
      return;
    }
    const pct = form.pct_solar === "" ? null : Number(form.pct_solar);
    if (pct !== null && (isNaN(pct) || pct < 0 || pct > 100)) {
      toastPatterns.warning("% Solar inválido", "Valor deve ser entre 0 e 100.");
      return;
    }
    addMarca.mutate({
      cod_empresa: form.cod_empresa,
      marca,
      pct_solar: pct,
      estrategica: form.estrategica,
      recem_introduzida: form.recem_introduzida,
    });
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

      <Tabs defaultValue="capacidade">
        <TabsList>
          <TabsTrigger value="capacidade">Capacidade do Expositor</TabsTrigger>
          <TabsTrigger value="marcas">Marcas por Loja</TabsTrigger>
        </TabsList>

        {/* TAB 1 — Capacidade do Expositor */}
        <TabsContent value="capacidade">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Cód.</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead className="w-[160px] text-right">Capacidade Total</TableHead>
                  <TableHead className="w-[140px] text-right">% Solar</TableHead>
                  <TableHead className="w-[140px] text-right" title="Mínimo de peças por marca. Deixe vazio para usar o padrão do sistema (25).">
                    Mín. do Mix
                  </TableHead>
                  <TableHead className="w-[120px] text-right text-muted-foreground">RX</TableHead>
                  <TableHead className="w-[120px] text-right text-muted-foreground">Solar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const origMap = new Map(original.map((o) => [o.id, o]));
                  const o = origMap.get(r.id);
                  const isChanged =
                    o &&
                    (o.capacidade_total !== r.capacidade_total ||
                      o.percentual_solar !== r.percentual_solar ||
                      o.mix_minimo !== r.mix_minimo);
                  const solar = calcularCapacidadePorCategoria(r, 'AR_SOLAR');
                  const rx = calcularCapacidadePorCategoria(r, 'AR_RX');
                  const invalidPct = r.percentual_solar < 0 || r.percentual_solar > 100;
                  const invalidTot = !Number.isFinite(r.capacidade_total) || r.capacidade_total < 0;
                  const invalidMin =
                    r.mix_minimo !== null && (!Number.isFinite(r.mix_minimo) || r.mix_minimo < 0);

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
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          placeholder="25"
                          value={r.mix_minimo ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            update(r.id, "mix_minimo", raw === "" ? null : parseInt(raw, 10));
                          }}
                          className={`h-9 text-right ${invalidMin ? "border-danger" : ""}`}
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
        </TabsContent>

        {/* TAB 2 — Marcas por Loja */}
        <TabsContent value="marcas">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  setForm(FORM_DEFAULT);
                  setDialogOpen(true);
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar override
              </Button>
            </div>

            {isMarcaLoading && <LoadingState message="Carregando configurações de marca..." variant="inline" />}
            {isMarcaError && (
              <ErrorState description="Não foi possível carregar os overrides." onRetry={() => refetchMarca()} />
            )}

            {!isMarcaLoading && !isMarcaError && (
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loja</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead className="w-[140px] text-right">% Solar (override)</TableHead>
                      <TableHead className="w-[120px] text-center">Flags</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {marcaRows && marcaRows.length > 0 ? (
                      marcaRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {NOMES_LOJAS[r.cod_empresa] ?? `EMPRESA ${r.cod_empresa}`}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{r.marca}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {r.pct_solar !== null ? `${r.pct_solar}%` : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-1 flex-wrap">
                              {r.estrategica && (
                                <Badge variant="outline" className="border-orange-400 text-orange-600">
                                  Estratégica
                                </Badge>
                              )}
                              {r.recem_introduzida && (
                                <Badge variant="outline" className="border-blue-400 text-blue-600">
                                  Nova
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              disabled={deleteMarca.isPending}
                              onClick={() => deleteMarca.mutate(r.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Nenhum override cadastrado. Clique em "Adicionar override" para começar.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Dialog — Adicionar override */}
          <BaseDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title="Adicionar override de marca"
            size="sm"
            footer={
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleAddSubmit} disabled={addMarca.isPending}>
                  {addMarca.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </>
            }
          >
            <div className="grid gap-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="mc-loja">Loja</Label>
                <select
                  id="mc-loja"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.cod_empresa}
                  onChange={(e) => setForm((f) => ({ ...f, cod_empresa: Number(e.target.value) }))}
                >
                  {LOJA_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mc-marca">Marca</Label>
                <Input
                  id="mc-marca"
                  placeholder="ex: RAYBAN"
                  value={form.marca}
                  onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value.toUpperCase() }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mc-pct">% Solar (override)</Label>
                <Input
                  id="mc-pct"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Deixe vazio para herdar o default"
                  value={form.pct_solar}
                  onChange={(e) => setForm((f) => ({ ...f, pct_solar: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="mc-estrategica"
                  checked={form.estrategica}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, estrategica: Boolean(v) }))}
                />
                <Label htmlFor="mc-estrategica" className="cursor-pointer">
                  Estratégica <span className="text-muted-foreground text-xs">(garante o mínimo da loja mesmo abaixo da participação)</span>
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="mc-nova"
                  checked={form.recem_introduzida}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, recem_introduzida: Boolean(v) }))}
                />
                <Label htmlFor="mc-nova" className="cursor-pointer">
                  Recém-introduzida <span className="text-muted-foreground text-xs">(exclui do ranking de descontinuação)</span>
                </Label>
              </div>
            </div>
          </BaseDialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
