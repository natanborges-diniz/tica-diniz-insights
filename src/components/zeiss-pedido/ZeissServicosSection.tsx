// src/components/zeiss-pedido/ZeissServicosSection.tsx
// Seção de serviços (tratamentos) e cores para pedido Zeiss

import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Paintbrush, Wrench, Lock, ShieldCheck, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { listarServicosPorProdutoZeiss, listarCoresZeiss, listarServicosZeiss } from "@/services/zeissService";

export interface ZeissServico {
  cod: string;
  nome: string;
  descr?: string;
}

export interface ZeissCor {
  cod: string;
  nome: string;
}

interface Props {
  familia: string | null;
  codEmpresa: number;
  selectedServicos: string[];
  onServicosChange: (servicos: string[]) => void;
  selectedCor: string;
  onCorChange: (cor: string) => void;
  /** Quando true (lente surfaçada), marca BlueGuard automaticamente e re-marca se a coloração for removida. */
  autoSelectBlueguard?: boolean;
  /** BlueGuard na API Zeiss vem como flag do produto (`luzazul`), não como serviço do catálogo. */
  blueguardAvailable?: boolean;
  blueguardLabel?: string;
}

const ZeissServicosSection: React.FC<Props> = ({
  familia, codEmpresa, selectedServicos, onServicosChange, selectedCor, onCorChange,
  autoSelectBlueguard = false,
  blueguardAvailable = false,
  blueguardLabel = "BlueGuard",
}) => {
  const [servicos, setServicos] = useState<ZeissServico[]>([]);
  const [cores, setCores] = useState<ZeissCor[]>([]);
  const [loadingServicos, setLoadingServicos] = useState(false);
  const [loadingCores, setLoadingCores] = useState(false);
  const loggedFamiliaRef = useRef<string | null>(null);

  useEffect(() => {
    console.log("[ZeissServicos] familia:", familia, "codEmpresa:", codEmpresa);
    if (!familia || !codEmpresa) {
      setServicos([]);
      setCores([]);
      return;
    }

    setLoadingServicos(true);
    setLoadingCores(true);

    Promise.all([
      listarServicosPorProdutoZeiss(familia, codEmpresa),
      listarServicosZeiss(codEmpresa).catch(() => []),
    ])
      .then(([productServicos, allServicos]) => {
        const codes = Array.isArray(productServicos) ? productServicos : [];
        const nameMap: Record<string, string> = {};
        const descrMap: Record<string, string> = {};
        if (Array.isArray(allServicos)) {
          allServicos.forEach((s: any) => {
            const cod = s.cod || s.codigo || s.c || "";
            const nome = s.nome || s.n || s.descricao || "";
            const descr = s.descr || s.descricao || "";
            if (cod) {
              nameMap[String(cod)] = nome;
              descrMap[String(cod)] = descr;
            }
          });
        }
        const mapped = codes
          .map((s: any) => {
            const cod = typeof s === "string" ? s : (s.cod || s.codigo || s.c || s.codigo_servico || "");
            return {
              cod: String(cod),
              nome: nameMap[String(cod)] || `Serviço ${cod}`,
              descr: descrMap[String(cod)] || "",
            };
          })
          .filter((s: ZeissServico) => s.cod);
        setServicos(mapped);

        // Log diagnóstico (uma vez por família) — facilita identificar nomes reais sem mexer no proxy
        if (loggedFamiliaRef.current !== familia) {
          loggedFamiliaRef.current = familia;
          console.info(
            `[ZeissServicos] catálogo família=${familia} (${mapped.length} serviços):`,
            mapped.map((s) => `${s.cod}=${s.nome}`).join(" | "),
          );
        }
      })
      .catch((err) => console.warn("[ZeissServicos] Error loading services:", err))
      .finally(() => setLoadingServicos(false));

    listarCoresZeiss(familia)
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setCores(arr.map((c: any) => ({
          cod: c.codigo_cor_sao || c.cod || c.codigo || c.c || "",
          nome: c.farb || c.nome || c.n || c.descricao || "",
        })).filter((c: ZeissCor) => c.cod));
      })
      .catch((err) => console.warn("[ZeissServicos] Error loading colors:", err))
      .finally(() => setLoadingCores(false));
  }, [familia, codEmpresa]);

  const corBloqueia = Boolean(selectedCor && selectedCor !== "none");
  const blueguardAtivo = autoSelectBlueguard && blueguardAvailable && !corBloqueia;

  // ── BlueGuard é flag do produto (`luzazul`), não código em `servicos` ──
  useEffect(() => {
    if (!corBloqueia) return;
    const serviceLikeBlueguard = servicos.filter((s) => /BLUE\s*GUARD|BLUEGUARD/i.test(`${s.nome} ${s.descr || ""}`)).map((s) => s.cod);
    if (serviceLikeBlueguard.length > 0 && selectedServicos.some((cod) => serviceLikeBlueguard.includes(cod))) {
      onServicosChange(selectedServicos.filter((cod) => !serviceLikeBlueguard.includes(cod)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corBloqueia, servicos.length]);

  const toggleServico = (cod: string) => {
    onServicosChange(
      selectedServicos.includes(cod)
        ? selectedServicos.filter((s) => s !== cod)
        : [...selectedServicos, cod]
    );
  };

  if (!familia) return null;

  // ── Status do BlueGuard (faixa explícita acima da lista) ──
  type StatusVariant = "ok" | "warn" | "danger";
  let statusVariant: StatusVariant | null = null;
  let statusIcon: React.ReactNode = null;
  let statusText: string = "";
  if (autoSelectBlueguard) {
    if (blueguardAtivo) {
      statusVariant = "ok";
      statusIcon = <ShieldCheck className="h-4 w-4" />;
      statusText = `${blueguardLabel} incluído (flag luzazul do produto Zeiss).`;
    } else if (blueguardAvailable && corBloqueia) {
      statusVariant = "warn";
      statusIcon = <Lock className="h-4 w-4" />;
      statusText = `${blueguardLabel} removido — incompatível com a coloração selecionada. Para reativar, escolha 'Sem coloração'.`;
    } else if (!blueguardAvailable) {
      statusVariant = "danger";
      statusIcon = <AlertTriangle className="h-4 w-4" />;
      statusText = "Atenção: o produto selecionado não informa luzazul=true no catálogo Zeiss. Verifique manualmente antes de enviar.";
    }
  }
  const statusClasses: Record<StatusVariant, string> = {
    ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    danger: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wrench className="h-4 w-4" /> Serviços & Cores
          {(loadingServicos || loadingCores) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Faixa de status BlueGuard */}
        {statusVariant && (
          <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${statusClasses[statusVariant]}`}>
            <span className="mt-0.5 shrink-0">{statusIcon}</span>
            <span className="leading-snug">{statusText}</span>
          </div>
        )}

        {/* Serviços (tratamentos) */}
        {servicos.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Tratamentos disponíveis</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {servicos.map((s) => {
                return (
                  <label
                    key={s.cod}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 p-2.5 transition-colors hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={selectedServicos.includes(s.cod)}
                      onCheckedChange={() => toggleServico(s.cod)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="font-mono text-[10px] shrink-0">{s.cod}</Badge>
                        <span className="text-sm font-medium truncate">{s.nome}</span>
                      </div>
                      {s.descr && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.descr}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {!loadingServicos && servicos.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum serviço disponível para esta família.</p>
        )}

        {/* Cores */}
        {cores.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
              <Paintbrush className="h-3 w-3" /> Coloração
            </Label>
            <Select value={selectedCor} onValueChange={onCorChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Sem coloração" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem coloração</SelectItem>
                {cores.map((c) => (
                  <SelectItem key={c.cod} value={c.cod}>
                    {c.cod} — {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {autoSelectBlueguard && blueguardAvailable && (
              <p className="text-[11px] text-muted-foreground italic">
                Coloração ativa envia luzazul=false automaticamente (regra Zeiss).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ZeissServicosSection;
