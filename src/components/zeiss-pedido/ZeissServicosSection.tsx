// src/components/zeiss-pedido/ZeissServicosSection.tsx
// Seção de serviços (tratamentos) e cores para pedido Zeiss

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Paintbrush, Wrench, Lock } from "lucide-react";
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

const ZeissServicosSection: React.FC<Props> = ({
  familia, codEmpresa, selectedServicos, onServicosChange, selectedCor, onCorChange,
  autoSelectBlueguard = false,
}) => {
  const [servicos, setServicos] = useState<ZeissServico[]>([]);
  const [cores, setCores] = useState<ZeissCor[]>([]);
  const [loadingServicos, setLoadingServicos] = useState(false);
  const [loadingCores, setLoadingCores] = useState(false);

  useEffect(() => {
    console.log("[ZeissServicos] familia:", familia, "codEmpresa:", codEmpresa);
    if (!familia || !codEmpresa) {
      setServicos([]);
      setCores([]);
      return;
    }

    // Fetch services by product (returns codes) + full catalog (returns names) + colors
    setLoadingServicos(true);
    setLoadingCores(true);

    // Fetch product services and full catalog in parallel to cross-reference names
    Promise.all([
      listarServicosPorProdutoZeiss(familia, codEmpresa),
      listarServicosZeiss(codEmpresa).catch(() => []),  // fallback if catalog fails
    ])
      .then(([productServicos, allServicos]) => {
        const codes = Array.isArray(productServicos) ? productServicos : [];
        // Build name map from full catalog
        const nameMap: Record<string, string> = {};
        if (Array.isArray(allServicos)) {
          allServicos.forEach((s: any) => {
            const cod = s.cod || s.codigo || s.c || "";
            const nome = s.nome || s.n || s.descricao || "";
            if (cod) nameMap[String(cod)] = nome;
          });
        }
        setServicos(codes.map((s: any) => {
          const cod = typeof s === "string" ? s : (s.cod || s.codigo || s.c || s.codigo_servico || "");
          return { cod, nome: nameMap[String(cod)] || `Serviço ${cod}`, descr: "" };
        }).filter((s: ZeissServico) => s.cod));
      })
      .catch((err) => console.warn("[ZeissServicos] Error loading services:", err))
      .finally(() => setLoadingServicos(false));

    listarCoresZeiss(familia)
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        // API returns {codigo_cor_sao, farb} objects
        setCores(arr.map((c: any) => ({
          cod: c.codigo_cor_sao || c.cod || c.codigo || c.c || "",
          nome: c.farb || c.nome || c.n || c.descricao || "",
        })).filter((c: ZeissCor) => c.cod));
      })
      .catch((err) => console.warn("[ZeissServicos] Error loading colors:", err))
      .finally(() => setLoadingCores(false));
  }, [familia, codEmpresa]);

  // ── Detect BlueGuard service from loaded catalog (works regardless of code) ──
  const blueguardCod = useMemo(
    () => servicos.find(s => /BLUE\s*GUARD/i.test(s.nome))?.cod ?? null,
    [servicos]
  );
  const corBloqueia = Boolean(selectedCor && selectedCor !== "none");

  // ── Auto-marca BlueGuard em lente surfaçada; remove obrigatoriamente se houver coloração ──
  useEffect(() => {
    if (!blueguardCod) return;
    const marcado = selectedServicos.includes(blueguardCod);
    if (corBloqueia && marcado) {
      onServicosChange(selectedServicos.filter(c => c !== blueguardCod));
    } else if (!corBloqueia && autoSelectBlueguard && !marcado) {
      onServicosChange([...selectedServicos, blueguardCod]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blueguardCod, corBloqueia, autoSelectBlueguard]);

  const toggleServico = (cod: string) => {
    // Não permite alternar BlueGuard manualmente quando há coloração
    if (cod === blueguardCod && corBloqueia) return;
    onServicosChange(
      selectedServicos.includes(cod)
        ? selectedServicos.filter(s => s !== cod)
        : [...selectedServicos, cod]
    );
  };

  if (!familia) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wrench className="h-4 w-4" /> Serviços & Cores
          {(loadingServicos || loadingCores) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Serviços (tratamentos) */}
        {servicos.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Tratamentos disponíveis</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {servicos.map(s => {
                const isBlueguard = s.cod === blueguardCod;
                const disabled = isBlueguard && corBloqueia;
                return (
                  <label
                    key={s.cod}
                    className={`flex items-start gap-2 rounded-md border border-border/60 p-2.5 transition-colors ${
                      disabled ? "opacity-60 cursor-not-allowed bg-muted/40" : "cursor-pointer hover:bg-accent/50"
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
                        <span className="text-sm font-medium truncate">{s.nome}</span>
                        {isBlueguard && !corBloqueia && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Padrão Zeiss</Badge>
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
                {cores.map(c => (
                  <SelectItem key={c.cod} value={c.cod}>
                    {c.cod} — {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ZeissServicosSection;
