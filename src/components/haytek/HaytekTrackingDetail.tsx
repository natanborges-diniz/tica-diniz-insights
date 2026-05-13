// src/components/haytek/HaytekTrackingDetail.tsx
// Visualização estruturada da resposta da API Haytek (consulta avulsa + status ao vivo).

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, Package, Clock, Truck, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { HaytekOrderTracking } from "@/services/haytekService";

function statusBadge(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (s.includes("entreg")) return { color: "bg-success-soft text-success border-success-muted", icon: CheckCircle2 };
  if (s.includes("faturad")) return { color: "bg-info-soft text-info border-info-muted", icon: Package };
  if (s.includes("produc") || s.includes("process") || s.includes("confirmado")) return { color: "bg-warning-soft text-warning border-warning-muted", icon: Clock };
  if (s.includes("cancel") || s.includes("erro")) return { color: "bg-danger-soft text-danger border-danger-muted", icon: XCircle };
  if (s.includes("transit") || s.includes("enviad")) return { color: "bg-chart-5/15 text-chart-5 border-chart-5/30", icon: Truck };
  return { color: "bg-muted text-muted-foreground", icon: Clock };
}

function fmtDate(d: unknown): string {
  if (!d || typeof d !== "string") return "—";
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return d; }
}

function get<T = unknown>(obj: any, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k] as T;
  }
  return undefined;
}

interface Props {
  /** Resposta ao vivo da Haytek */
  tracking: HaytekOrderTracking;
  /** Payload original enviado (opcional) — usado para detectar serviços agregados pela Haytek */
  sentPayload?: any;
  /** Título exibido no topo */
  title?: string;
}

export const HaytekTrackingDetail: React.FC<Props> = ({ tracking, sentPayload, title }) => {
  const [showRaw, setShowRaw] = useState(false);

  const t = tracking as any;
  const sb = statusBadge(t.status);
  const Icon = sb.icon;

  // Produto/prescrição confirmados — Haytek varia o shape; cobre os mais comuns
  const products = get<any>(t, "products", "product") || {};
  const right = get<any>(products, "right", "od") || {};
  const left = get<any>(products, "left", "oe") || {};
  const frame = get<any>(products, "frame") || {};
  const coloring = get<any>(products, "coloring") || null;
  const corridor = get<any>(products, "corridor");

  // Serviços — detectar agregação pela Haytek
  const services = get<any>(t, "services") || {};
  const apiAssembly = !!services?.assembly;
  const apiRemoteCut = !!services?.remoteCut;
  const sentServices = sentPayload?.services || sentPayload?.pedido?.services || {};
  const sentAssembly = !!sentServices?.assembly;
  const sentRemoteCut = !!sentServices?.remoteCut;

  const servicosInesperados: string[] = [];
  if (apiAssembly && !sentAssembly) servicosInesperados.push("Montagem");
  if (apiRemoteCut && !sentRemoteCut) servicosInesperados.push("Corte remoto");

  const deliveries: any[] = Array.isArray(t.deliveries) ? t.deliveries : [];
  const payment = t.payment;

  return (
    <div className="space-y-3 text-xs">
      {title && (
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span className="font-semibold text-sm">{title}</span>
          {t.status && (
            <Badge variant="outline" className={sb.color + " text-xs"}>{String(t.status)}</Badge>
          )}
        </div>
      )}

      {/* AVISO: serviços adicionados pela Haytek que NÃO foram enviados */}
      {servicosInesperados.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning-soft text-warning p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="text-[11px] space-y-0.5">
            <p className="font-semibold">Serviços incluídos pela Haytek (não enviados pelo nosso pedido)</p>
            <p className="opacity-90">
              Detectado: <span className="font-medium">{servicosInesperados.join(", ")}</span>.
              Esses serviços não saíram do nosso payload — provavelmente estão configurados na conta
              do laboratório na Haytek. Abra chamado anexando este pedido.
            </p>
          </div>
        </div>
      )}

      {/* Identificação */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded border p-2 bg-background">
        <div><span className="text-muted-foreground">Order ID:</span> <span className="font-mono font-medium">{t.orderId ?? "—"}</span></div>
        <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{t.status ?? "—"}</span></div>
        <div><span className="text-muted-foreground">OS:</span> <span className="font-mono">{t.osId ?? sentPayload?.osId ?? "—"}</span></div>
        <div><span className="text-muted-foreground">Paciente:</span> <span className="font-medium">{t.patientName ?? sentPayload?.patientName ?? "—"}</span></div>
      </div>

      {/* Produto confirmado */}
      {(products.productId || products.treatment) && (
        <div className="rounded border p-2 bg-background">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Produto confirmado</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><span className="text-muted-foreground">Produto:</span> <span className="font-mono font-medium">{products.productId ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Tratamento:</span> <span className="font-medium">{products.treatment ?? "—"}</span></div>
            {corridor && <div><span className="text-muted-foreground">Corredor:</span> {corridor}mm</div>}
            {coloring && <div><span className="text-muted-foreground">Coloração:</span> {coloring.color} {coloring.intensityCode}</div>}
          </div>
        </div>
      )}

      {/* Prescrição OD/OE */}
      {(right.spherical || left.spherical) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[{ label: "OD", eye: right }, { label: "OE", eye: left }].map(({ label, eye }) => (
            <div key={label} className="rounded border p-2 bg-background">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">{label} (confirmado)</p>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                <div>ESF: <span className="font-mono">{eye.spherical || "—"}</span></div>
                <div>CIL: <span className="font-mono">{eye.cylindrical || "—"}</span></div>
                <div>EIX: <span className="font-mono">{eye.axis || "—"}</span></div>
                <div>AD: <span className="font-mono">{eye.addition || "—"}</span></div>
                <div>DNP: <span className="font-mono">{eye.ndp || "—"}</span></div>
                <div>ALT: <span className="font-mono">{eye.height || "—"}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Armação */}
      {(frame.code || frame.bridge) && (
        <div className="rounded border p-2 bg-background">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Armação confirmada</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-1 text-[11px]">
            <div>Tipo: <span className="font-medium">{frame.code || "—"}</span></div>
            <div>Material: <span className="font-medium">{frame.material || "—"}</span></div>
            <div>Formato: <span className="font-mono">{frame.modelImage || "—"}</span></div>
            <div>Ponte: <span className="font-mono">{frame.bridge || "—"}</span></div>
            <div>Altura: <span className="font-mono">{frame.height || "—"}</span></div>
            <div>Largura: <span className="font-mono">{frame.width || "—"}</span></div>
          </div>
        </div>
      )}

      {/* Serviços (sempre exibe se houver) */}
      {(apiAssembly || apiRemoteCut) && (
        <div className="rounded border p-2 bg-background">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Serviços</p>
          <div className="flex flex-wrap gap-2 text-[11px]">
            {apiAssembly && (
              <Badge variant="outline" className={sentAssembly ? "" : "bg-warning-soft text-warning border-warning-muted"}>
                Montagem {sentAssembly ? "" : "(adicionada pela Haytek)"}
              </Badge>
            )}
            {apiRemoteCut && (
              <Badge variant="outline" className={sentRemoteCut ? "" : "bg-warning-soft text-warning border-warning-muted"}>
                Corte remoto {sentRemoteCut ? "" : "(adicionado pela Haytek)"}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Entregas */}
      {deliveries.length > 0 && (
        <div className="rounded border p-2 bg-background">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Entregas ({deliveries.length})</p>
          <div className="space-y-1">
            {deliveries.map((d, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] border-l-2 border-border pl-2">
                {d.status && <Badge variant="outline" className={statusBadge(d.status).color + " text-[10px]"}>{d.status}</Badge>}
                {(d.previsao || d.estimatedDate) && <span><span className="text-muted-foreground">Previsão:</span> {fmtDate(d.previsao || d.estimatedDate)}</span>}
                {(d.tracking || d.trackingCode) && <span className="font-mono"><span className="text-muted-foreground">Rastreio:</span> {d.tracking || d.trackingCode}</span>}
                {d.carrier && <span><span className="text-muted-foreground">Transp.:</span> {d.carrier}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagamento */}
      {payment && typeof payment === "object" && (
        <div className="rounded border p-2 bg-background">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Pagamento</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            {(payment as any).status && <div><span className="text-muted-foreground">Status:</span> {(payment as any).status}</div>}
            {(payment as any).total != null && <div><span className="text-muted-foreground">Total:</span> R$ {(payment as any).total}</div>}
            {(payment as any).method && <div><span className="text-muted-foreground">Método:</span> {(payment as any).method}</div>}
          </div>
        </div>
      )}

      {/* JSON bruto (colapsável) */}
      <Separator />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 gap-1 text-[10px] text-muted-foreground"
        onClick={() => setShowRaw(s => !s)}
      >
        {showRaw ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {showRaw ? "Ocultar JSON bruto" : "Ver JSON bruto (debug)"}
      </Button>
      {showRaw && (
        <pre className="text-[10px] bg-muted/50 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-60">
          {JSON.stringify(tracking, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default HaytekTrackingDetail;
