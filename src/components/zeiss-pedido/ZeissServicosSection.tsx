// src/components/zeiss-pedido/ZeissServicosSection.tsx
// Seção de serviços (tratamentos) e cores para pedido Zeiss

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Paintbrush, Wrench } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { listarServicosPorProdutoZeiss, listarCoresZeiss } from "@/services/zeissService";

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
}

const ZeissServicosSection: React.FC<Props> = ({
  familia, codEmpresa, selectedServicos, onServicosChange, selectedCor, onCorChange,
}) => {
  const [servicos, setServicos] = useState<ZeissServico[]>([]);
  const [cores, setCores] = useState<ZeissCor[]>([]);
  const [loadingServicos, setLoadingServicos] = useState(false);
  const [loadingCores, setLoadingCores] = useState(false);

  useEffect(() => {
    if (!familia || !codEmpresa) {
      setServicos([]);
      setCores([]);
      return;
    }

    // Fetch services and colors in parallel
    setLoadingServicos(true);
    setLoadingCores(true);

    listarServicosPorProdutoZeiss(familia, codEmpresa)
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setServicos(arr.map((s: any) => ({
          cod: s.cod || s.codigo || s.c || "",
          nome: s.nome || s.n || s.descricao || "",
          descr: s.descr || s.d || "",
        })).filter((s: ZeissServico) => s.cod));
      })
      .catch((err) => console.warn("[ZeissServicos] Error loading services:", err))
      .finally(() => setLoadingServicos(false));

    listarCoresZeiss(familia)
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setCores(arr.map((c: any) => ({
          cod: c.cod || c.codigo || c.c || "",
          nome: c.nome || c.n || c.descricao || "",
        })).filter((c: ZeissCor) => c.cod));
      })
      .catch((err) => console.warn("[ZeissServicos] Error loading colors:", err))
      .finally(() => setLoadingCores(false));
  }, [familia, codEmpresa]);

  const toggleServico = (cod: string) => {
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
              {servicos.map(s => (
                <label
                  key={s.cod}
                  className="flex items-start gap-2 rounded-md border border-border/60 p-2.5 cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedServicos.includes(s.cod)}
                    onCheckedChange={() => toggleServico(s.cod)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="font-mono text-[10px] shrink-0">{s.cod}</Badge>
                      <span className="text-sm font-medium truncate">{s.nome}</span>
                    </div>
                    {s.descr && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.descr}</p>}
                  </div>
                </label>
              ))}
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
