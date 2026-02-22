import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionBar, ActionBarStatus } from "@/components/system/ActionBar";
import { BaseSheet } from "@/components/system/BaseSheet";
import { BaseDialog } from "@/components/system/BaseDialog";
import { useDirtyGuard } from "@/components/system/dirty/useDirtyGuard";

export default function SystemPlayground() {
  // ── ActionBar demo ───────────────────────────
  const [actionStatus, setActionStatus] = useState<ActionBarStatus>("idle");
  const guard = useDirtyGuard();

  const handleSave = useCallback(() => {
    setActionStatus("loading");
    setTimeout(() => {
      setActionStatus("success");
      guard.setClean();
      setTimeout(() => setActionStatus("idle"), 2000);
    }, 1500);
  }, [guard]);

  const handleCancel = useCallback(() => {
    guard.setClean();
    setActionStatus("idle");
  }, [guard]);

  // ── Sheet demo ───────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetGuard = useDirtyGuard();

  // ── Dialog demo ──────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-8 p-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold">System Design Playground</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Fase 0.3 — Componentes base reutilizáveis
        </p>
      </div>

      {/* ── ActionBar ─────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">ActionBar</h2>
        <div className="flex gap-2 flex-wrap">
          <div className="space-y-2 w-72">
            <Label>Edite algo para ativar a barra:</Label>
            <Input
              placeholder="Digite qualquer coisa…"
              onChange={() => { guard.setDirty(); setActionStatus("idle"); }}
            />
          </div>
        </div>
      </section>

      {/* ── BaseSheet ─────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">BaseSheet</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            Abrir Sheet (default)
          </Button>
        </div>

        <BaseSheet
          open={sheetOpen}
          onOpenChange={(o) => {
            if (sheetGuard.guardClose(o)) {
              setSheetOpen(o);
              if (!o) sheetGuard.setClean();
            }
          }}
          title="Detalhe do Item"
          description="Exemplo de sheet com header fixo e body com scroll."
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => {
                if (sheetGuard.guardClose(false)) {
                  setSheetOpen(false);
                  sheetGuard.setClean();
                }
              }}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => setSheetOpen(false)}>
                Confirmar
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Nome do item"
                onChange={() => sheetGuard.setDirty()}
              />
            </div>
            {/* Filler for scroll testing */}
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Label>Campo {i + 2}</Label>
                <Input placeholder={`Valor ${i + 2}`} />
              </div>
            ))}
          </div>
        </BaseSheet>
      </section>

      {/* ── BaseDialog ────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">BaseDialog</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDialogOpen(true)}>
            Abrir Dialog (md)
          </Button>
        </div>

        <BaseDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Criar Novo Registro"
          description="Preencha os campos abaixo."
          size="md"
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => setDialogOpen(false)}>
                Salvar
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Label>Campo {i + 1}</Label>
                <Input placeholder={`Valor ${i + 1}`} />
              </div>
            ))}
          </div>
        </BaseDialog>
      </section>

      {/* ── Tokens showcase ───────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tokens Semânticos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Success", bg: "bg-success-soft", text: "text-success", border: "border-success" },
            { label: "Warning", bg: "bg-warning-soft", text: "text-warning", border: "border-warning" },
            { label: "Danger", bg: "bg-danger-soft", text: "text-danger", border: "border-danger" },
            { label: "Info", bg: "bg-info-soft", text: "text-info", border: "border-info" },
          ].map((t) => (
            <div key={t.label} className={`rounded-lg border p-4 ${t.bg} ${t.border}`}>
              <p className={`text-sm font-semibold ${t.text}`}>{t.label}</p>
              <p className="text-xs text-muted-foreground mt-1">bg-{t.label.toLowerCase()}-soft</p>
            </div>
          ))}
        </div>

        <h3 className="text-sm font-semibold mt-4">Chart Palette</h3>
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div
              key={n}
              className={`w-10 h-10 rounded-md bg-chart-${n} flex items-center justify-center text-xs font-bold text-white`}
              style={{ backgroundColor: `hsl(var(--chart-${n}))` }}
            >
              {n}
            </div>
          ))}
        </div>
      </section>

      {/* ActionBar rendered at bottom */}
      <ActionBar
        visible={guard.isDirty}
        status={actionStatus}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}
