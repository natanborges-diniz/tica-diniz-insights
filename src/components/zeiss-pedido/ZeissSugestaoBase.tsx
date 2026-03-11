// src/components/zeiss-pedido/ZeissSugestaoBase.tsx
// Auto-fetch base/diameter suggestions from Zeiss API when product + prescription are ready

import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Target } from "lucide-react";
import { sugestaoBaseZeiss } from "@/services/zeissService";

interface Props {
  familia: string | null;
  codEmpresa: number;
  esferico: string;
  cilindrico: string;
  adicao: string;
  onSugestao: (base: string, diametro: string) => void;
}

interface SugestaoResult {
  base?: string;
  diametro?: string;
}

const ZeissSugestaoBase: React.FC<Props> = ({
  familia, codEmpresa, esferico, cilindrico, adicao, onSugestao,
}) => {
  const [loading, setLoading] = useState(false);
  const [sugestao, setSugestao] = useState<SugestaoResult | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!familia || !codEmpresa || !esferico) {
      setSugestao(null);
      setApplied(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setApplied(false);
      try {
        const data = await sugestaoBaseZeiss(codEmpresa, familia, esferico, cilindrico, adicao);
        const result = data as any;
        // Parse response - Zeiss returns sao.base or similar structure
        const parsed: SugestaoResult = {
          base: result?.sao?.base?.sugestao || result?.base || result?.sugestaobase || null,
          diametro: result?.sao?.base?.diametro || result?.diametro || result?.sugestaodiametro || null,
        };
        if (parsed.base || parsed.diametro) {
          setSugestao(parsed);
          onSugestao(parsed.base || "", parsed.diametro || "");
          setApplied(true);
        } else {
          setSugestao(null);
        }
      } catch (err) {
        console.warn("[ZeissSugestaoBase] Error:", err);
        setSugestao(null);
      } finally {
        setLoading(false);
      }
    }, 800); // Debounce

    return () => clearTimeout(timer);
  }, [familia, codEmpresa, esferico, cilindrico, adicao]);

  if (!familia || (!loading && !sugestao)) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <Target className="h-3.5 w-3.5 text-muted-foreground" />
      {loading ? (
        <span className="text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Calculando base...
        </span>
      ) : sugestao ? (
        <span className="text-muted-foreground flex items-center gap-1.5">
          Sugestão Zeiss:
          {sugestao.base && <Badge variant="secondary" className="text-[10px]">Base {sugestao.base}</Badge>}
          {sugestao.diametro && <Badge variant="secondary" className="text-[10px]">Ø {sugestao.diametro}</Badge>}
          {applied && <Badge className="bg-emerald-600 text-white text-[10px]">Aplicado</Badge>}
        </span>
      ) : null}
    </div>
  );
};

export default ZeissSugestaoBase;
