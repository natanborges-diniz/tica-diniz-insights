import React from "react";
import { useNavigate } from "react-router-dom";
import { OsHubRecord } from "@/services/osHubService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BaseSheet } from "@/components/system/BaseSheet";
import { InlineInsight } from "@/components/ia/InlineInsight";
import { useModuleInsights } from "@/hooks/useModuleInsights";
import { Send, Calendar, User, Building2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────
const FORMA_ARO_LABELS: Record<number, string> = {
  1: "Arredondado", 2: "Oval", 3: "Gota", 4: "Retangular arredondado",
  5: "Triangular", 6: "Oval largo", 7: "Redondo", 8: "Oval inclinado",
};

// ── Sub-components ─────────────────────────────────────────

function FormaAroIcon({ codigo }: { codigo: number }) {
  const s = 32;
  const paths: Record<number, string> = {
    1: `M8,5 Q4,5 4,10 L4,${s-10} Q4,${s-5} 8,${s-5} L${s-8},${s-5} Q${s-4},${s-5} ${s-4},${s-10} L${s-4},10 Q${s-4},5 ${s-8},5Z`,
    2: `M${s/2},4 A${s/2-4},${s/2-4} 0 1,1 ${s/2},${s-4} A${s/2-4},${s/2-4} 0 1,1 ${s/2},4Z`,
    3: `M4,8 Q${s/2},2 ${s-4},8 L${s-6},${s-6} Q${s/2},${s-2} 6,${s-6}Z`,
    4: `M8,6 Q5,6 5,9 L5,${s-9} Q5,${s-6} 8,${s-6} L${s-8},${s-6} Q${s-5},${s-6} ${s-5},${s-9} L${s-5},9 Q${s-5},6 ${s-8},6Z`,
    5: `M6,${s-8} Q4,6 ${s/2},4 Q${s-4},6 ${s-6},${s-8} Q${s/2},${s-4} 6,${s-8}Z`,
    6: `M${s/2},5 A${s/2-4},${s/3} 0 1,1 ${s/2},${s-5} A${s/2-4},${s/3} 0 1,1 ${s/2},5Z`,
    7: `M${s/2},4 A${s/2-5},${s/2-5} 0 1,1 ${s/2},${s-4} A${s/2-5},${s/2-5} 0 1,1 ${s/2},4Z`,
    8: `M6,${s/2+2} A${s/2-4},${s/3} 0 1,1 ${s-6},${s/2-2} A${s/2-4},${s/3} 0 1,1 6,${s/2+2}Z`,
  };
  const d = paths[codigo] ?? paths[1];
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="text-foreground" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between text-sm py-1.5 border-b border-border/40">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-3 pb-1">
      {children}
    </h3>
  );
}

function RxGrid({ label, esf, cil, eixo, adicao, dnp, altura }: {
  label: string;
  esf: number | null; cil: number | null; eixo: number | null;
  adicao: number | null; dnp: number | null; altura: number | null;
}) {
  if (!esf && !cil && !eixo) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-cols-3 gap-x-3 gap-y-0">
        <Field label="Esf" value={esf?.toFixed(2)} />
        <Field label="Cil" value={cil?.toFixed(2)} />
        <Field label="Eixo" value={eixo} />
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-0">
        <Field label="Adição" value={adicao?.toFixed(2)} />
        <Field label="DNP" value={dnp} />
        <Field label="Altura" value={altura} />
      </div>
    </div>
  );
}

function InfoPill({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toUpperCase();
  const variant = s === "ATRASO" ? "destructive" as const : "secondary" as const;
  const semantic = s === "ATRASO"
    ? "bg-danger-soft text-danger border-danger-muted"
    : s === "NO PRAZO"
    ? "bg-success-soft text-success border-success-muted"
    : "";
  return (
    <Badge variant={variant} className={cn("text-[10px]", semantic)}>
      {status}
    </Badge>
  );
}

// ── Loading skeleton ───────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

interface Props {
  os: OsHubRecord | null;
  onClose: () => void;
}

export const OsHubDetailSheet: React.FC<Props> = ({ os, onClose }) => {
  const navigate = useNavigate();
  const isOpen = !!os;

  const { insights, loading: insightsLoading } = useModuleInsights({
    module: "os",
    selection: os ? { osId: os.codOs, codEmpresa: os.codEmpresa } : undefined,
    enabled: isOpen,
    topN: 1,
  });

  const handleGerarPedido = () => {
    if (!os) return;
    onClose();
    // Pass patient data via URL params as fallback
    const params = new URLSearchParams({
      codOs: String(os.codOs),
      codEmpresa: String(os.codEmpresa),
    });
    if (os.paciente) params.set("paciente", os.paciente);
    if (os.cpf) params.set("cpf", os.cpf);
    if (os.dataNascimento) params.set("dataNascimento", os.dataNascimento);
    navigate(`/os/pedido?${params.toString()}`);
  };

  // Build subtitle from available context
  const subtitle = os
    ? [os.empresa, os.dataEmissao].filter(Boolean).join(" · ")
    : "";

  return (
    <BaseSheet
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={os ? `OS ${os.numeroOs || os.codOs}` : "Ordem de Serviço"}
      description={subtitle}
      size="wide"
      headerExtra={os ? <StatusBadge status={os.statusAtraso} /> : undefined}
      footer={
        os ? (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Fechar
            </Button>
            <Button size="sm" onClick={handleGerarPedido} className="gap-1.5">
              <Send className="h-4 w-4" />
              Gerar Pedido Hoya
            </Button>
          </>
        ) : undefined
      }
    >
      {!os ? (
        <DetailSkeleton />
      ) : (
        <div className="space-y-1">
          {/* ── Inline IA Insight ──────────────────────── */}
          <InlineInsight insight={insights[0] ?? null} loading={insightsLoading} className="mb-2" />

          {/* ── Section 1: Resumo ──────────────────────── */}
          <SectionHeading>Resumo</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <div>
              <Field label="Cliente" value={os.cliente} />
              <Field label="Paciente" value={os.paciente || os.cliente || "—"} />
              <Field label="CPF" value={os.cpf || "—"} />
              <Field label="Nascimento" value={os.dataNascimento ? new Date(os.dataNascimento).toLocaleDateString('pt-BR') : "—"} />
              <Field label="Empresa" value={os.empresa} />
              <Field label="Etapa" value={os.etapa} />
              <Field label="Vendedor" value={os.vendedor || os.usuario} />
            </div>
            <div>
              <Field label="Emissão" value={os.dataEmissao} />
              <Field label="Previsão" value={os.dataPrevisao} />
              <Field label="Entrada" value={os.dataEntrada} />
              <Field label="Saída" value={os.dataSaida} />
              <Field label="Total" value={os.total != null ? `R$ ${os.total.toFixed(2)}` : null} />
            </div>
          </div>

          {/* ── Section 2: Receita ─────────────────────── */}
          <SectionHeading>Prescrição — OD</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <RxGrid
              label="Longe"
              esf={os.odLongeEsf} cil={os.odLongeCil} eixo={os.odLongeEixo}
              adicao={os.odAdicao} dnp={os.odDnp} altura={os.odAltura}
            />
            <RxGrid
              label="Perto"
              esf={os.odPertoEsf} cil={os.odPertoCil} eixo={os.odPertoEixo}
              adicao={null} dnp={os.odDnp} altura={os.odAltura}
            />
          </div>

          <SectionHeading>Prescrição — OE</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <RxGrid
              label="Longe"
              esf={os.oeLongeEsf} cil={os.oeLongeCil} eixo={os.oeLongeEixo}
              adicao={os.oeAdicao} dnp={os.oeDnp} altura={os.oeAltura}
            />
            <RxGrid
              label="Perto"
              esf={os.oePertoEsf} cil={os.oePertoCil} eixo={os.oePertoEixo}
              adicao={null} dnp={os.oeDnp} altura={os.oeAltura}
            />
          </div>

          {/* ── Section 3: Armação ─────────────────────── */}
          {(os.descricaoArmacao || os.codFormatoAro != null || os.ponte || os.aaVertical || os.ta) && (
            <>
              <SectionHeading>Armação</SectionHeading>
              <Field label="Descrição" value={os.descricaoArmacao} />
              <Field label="Referência" value={os.referenciaArmacao} />
              {os.codFormatoAro != null && (
                <div className="flex items-center gap-2 py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground text-sm">Formato do Aro</span>
                  <div className="flex items-center gap-2 ml-auto">
                    <FormaAroIcon codigo={os.codFormatoAro} />
                    <span className="text-xs text-muted-foreground">
                      {FORMA_ARO_LABELS[os.codFormatoAro] ?? `Código ${os.codFormatoAro}`}
                    </span>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-x-3 gap-y-0 text-sm">
                <Field label="Ponte" value={os.ponte} />
                <Field label="Aro (V)" value={os.aaVertical} />
                <Field label="Diâmetro" value={os.diametro} />
              </div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-0 text-sm">
                <Field label="TA" value={os.ta} />
                <Field label="Largura (H)" value={os.caHorizontal} />
                <Field label="MD" value={os.md} />
              </div>
            </>
          )}

          {/* ── Section 4: Lentes ──────────────────────── */}
          {(os.lenteOdDescricao || os.lenteOeDescricao) && (
            <>
              <SectionHeading>Lentes</SectionHeading>
              <Field label="Lente OD" value={os.lenteOdDescricao} />
              <Field label="Lente OE" value={os.lenteOeDescricao} />
            </>
          )}

          {/* ── Section 5: Imagens ─────────────────────── */}
          {(os.urlImagemReceita || os.urlImagemArmacao || os.imagemTracer) && (
            <>
              <SectionHeading>Imagens</SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {os.urlImagemReceita && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Receita</p>
                    <a href={os.urlImagemReceita} target="_blank" rel="noopener noreferrer">
                      <img
                        src={os.urlImagemReceita}
                        alt="Foto da receita"
                        className="rounded border border-border w-full max-h-64 object-contain bg-muted/30"
                        loading="lazy"
                      />
                    </a>
                  </div>
                )}
                {os.urlImagemArmacao && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Armação</p>
                    <a href={os.urlImagemArmacao} target="_blank" rel="noopener noreferrer">
                      <img
                        src={os.urlImagemArmacao}
                        alt="Foto da armação"
                        className="rounded border border-border w-full max-h-64 object-contain bg-muted/30"
                        loading="lazy"
                      />
                    </a>
                  </div>
                )}
                {os.imagemTracer && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Tracer</p>
                    <a href={os.imagemTracer} target="_blank" rel="noopener noreferrer">
                      <img
                        src={os.imagemTracer}
                        alt="Imagem do tracer"
                        className="rounded border border-border w-full max-h-64 object-contain bg-muted/30"
                        loading="lazy"
                      />
                    </a>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Section 6: Observações ─────────────────── */}
          {(os.observacaoOs || os.observacaoLente || os.observacaoPendencia) && (
            <>
              <SectionHeading>Observações</SectionHeading>
              {os.observacaoOs && (
                <div className="mb-2">
                  <p className="text-xs text-muted-foreground mb-1">OS</p>
                  <p className="text-sm bg-muted/50 p-2 rounded">{os.observacaoOs}</p>
                </div>
              )}
              {os.observacaoLente && (
                <div className="mb-2">
                  <p className="text-xs text-muted-foreground mb-1">Lente</p>
                  <p className="text-sm bg-muted/50 p-2 rounded">{os.observacaoLente}</p>
                </div>
              )}
              {os.observacaoPendencia && (
                <div className="mb-2">
                  <p className="text-xs text-muted-foreground mb-1">Pendência</p>
                  <p className="text-sm bg-warning-soft p-2 rounded border border-warning-muted">{os.observacaoPendencia}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </BaseSheet>
  );
};
