// src/components/zeiss-pedido/ZeissServicosSection.tsx
// Seção de serviços (tratamentos) e cores para pedido Zeiss

import React, { useEffect, useMemo, useRef, useState } from "react";
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
}

// Padrões aceitos para identificar o tratamento BlueGuard no catálogo Zeiss.
// Lista fechada para evitar falso-positivo com "Blue Protect" (produto diferente).
const BLUEGUARD_PATTERNS: RegExp[] = [
  /BLUE\s*GUARD/i,
  /BLUEGUARD/i,
  /\bBG\s*DV\b/i,
  /DURAVISION\s+BLUE/i,
];

const isBlueguardName = (text: string | undefined | null): boolean => {
  if (!text) return false;
  return BLUEGUARD_PATTERNS.some((re) => re.test(text));
};

const ZeissServicosSection: React.FC<Props> = ({
  familia, codEmpresa, selectedServicos, onServicosChange, selectedCor, onCorChange,
  autoSelectBlueguard = false,
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

  // ── Detect BlueGuard (busca nome + descr, padrões múltiplos) ──
  const blueguardCod = useMemo(
    () => servicos.find((s) => isBlueguardName(s.nome) || isBlueguardName(s.descr))?.cod ?? null,
    [servicos],
  );
  const corBloqueia = Boolean(selectedCor && selectedCor !== "none");

  // ── Auto-marca BlueGuard em lente surfaçada; remove se houver coloração ──
  useEffect(() => {
    if (!blueguardCod) return;
    const marcado = selectedServicos.includes(blueguardCod);
    if (corBloqueia && marcado) {
      onServicosChange(selectedServicos.filter((c) => c !== blueguardCod));
    } else if (!corBloqueia && autoSelectBlueguard && !marcado) {
      onServicosChange([...selectedServicos, blueguardCod]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blueguardCod, corBloqueia, autoSelectBlueguard, servicos.length]);

  const toggleServico = (cod: string) => {
    if (cod === blueguardCod && corBloqueia) return;
    onServicosChange(
      selectedServicos.includes(cod)
        ? selectedServicos.filter((s) => s !== cod)
        : [...selectedServicos, cod]
    );
  };

  if (!familia) return null;

  // ── Status do BlueGuard (faixa explícita acima da lista) ──
  const blueguardMarcado = blueguardCod ? selectedServicos.includes(blueguardCod) : false;
  type StatusVariant = "ok" | "warn" | "danger";
  let statusVariant: StatusVariant | null = null;
  let statusIcon: React.ReactNode = null;
  let statusText: string = "";
  if (autoSelectBlueguard) {
    if (blueguardCod && blueguardMarcado && !corBloqueia) {
      statusVariant = "ok";
      statusIcon = <ShieldCheck className="h-4 w-4" />;
      statusText = "BlueGuard incluído (padrão Zeiss para lentes surfaçadas).";
    } else if (blueguardCod && corBloqueia) {
      statusVariant = "warn";
      statusIcon = <Lock className="h-4 w-4" />;
      statusText = "BlueGuard removido — incompatível com a coloração selecionada. Para reativar, escolha 'Sem coloração'.";
    } else if (!blueguardCod && !loadingServicos) {
      statusVariant = "danger";
      statusIcon = <AlertTriangle className="h-4 w-4" />;
      statusText = "Atenção: BlueGuard não foi encontrado no catálogo desta família. Verifique manualmente antes de enviar o pedido.";
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
                const isBlueguard = s.cod === blueguardCod;
                const disabled = isBlueguard && corBloqueia;
                const highlight = isBlueguard && !corBloqueia;
                return (
                  <label
                    key={s.cod}
                    className={`flex items-start gap-2 rounded-md border p-2.5 transition-colors ${
                      disabled
                        ? "opacity-60 cursor-not-allowed bg-muted/40 border-border/60"
                        : highlight
                          ? "cursor-pointer hover:bg-accent/50 border-emerald-500/50 bg-emerald-500/5"
                          : "cursor-pointer hover:bg-accent/50 border-border/60"
                    }`}
                  >
                    <Checkbox
                      checked={selectedServicos.includes(s.cod)}
                      onCheckedChange={() => toggleServico(s.cod)}
                      disabled={disabled}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="font-mono text-[10px] shrink-0">{s.cod}</Badge>
                        <span className={`text-sm font-medium truncate ${disabled ? "line-through" : ""}`}>
                          {s.nome}
                        </span>
                        {isBlueguard && !corBloqueia && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                            <ShieldCheck className="h-2.5 w-2.5" /> Padrão Zeiss
                          </Badge>
                        )}
                        {disabled && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-1 border-amber-500/50 text-amber-700 dark:text-amber-400">
                            <Lock className="h-2.5 w-2.5" /> Indisponível com coloração
                          </Badge>
                        )}
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
            {autoSelectBlueguard && blueguardCod && (
              <p className="text-[11px] text-muted-foreground italic">
                Coloração ativa remove BlueGuard automaticamente (regra Zeiss).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ZeissServicosSection;
