// src/pages/PedidoHaytekPage.tsx
// Tela de criação de pedido Haytek (Dmax) — com matching inteligente + DE/PARA + auto-fill

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { OsHubRecord, fetchSingleOsRecipe } from "@/services/osHubService";
import {
  HaytekProduto,
  HaytekPedidoPayload,
  HaytekPedidoResponse,
  criarPedidoHaytek,
  listarProdutosHaytek,
} from "@/services/haytekService";
import {
  matchHaytekProducts,
  saveHaytekDepara,
  HaytekMatchCandidate,
  HaytekMatchResult,
  haytekScoreLabel,
} from "@/services/haytekMatchingService";
import { resolverPrescricaoCompleta } from "@/utils/prescricaoResolver";
import { registrarPedidoNoCache } from "@/utils/pedidosMapCache";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import HaytekFormatoAroSelector from "@/components/haytek/HaytekFormatoAroSelector";
import {
  ArrowLeft, Send, Eye, Glasses, Package, Loader2, Check, AlertTriangle,
  Search, CheckCircle2, Zap, Sparkles, ChevronDown, ChevronUp, Pencil,
} from "lucide-react";

// ============================================
// HELPERS
// ============================================

const TREATMENTS = [
  { value: "ARA", label: "ARA — Antirreflexo A" },
  { value: "ARV", label: "ARV — Antirreflexo V" },
  { value: "TIN", label: "TIN — Tintura" },
  { value: "ANT", label: "ANT — Antirreflexo" },
  { value: "TRP", label: "TRP — Transitions" },
  { value: "TRS", label: "TRS — Transitions Solar" },
  { value: "APA", label: "APA — Anti-reflexo Premium A" },
  { value: "APV", label: "APV — Anti-reflexo Premium V" },
];

const FRAME_CODES = [
  { value: "3PC", label: "3PC — 3 Peças (Parafuso)" },
  { value: "ARF", label: "ARF — Aro Fechado" },
  { value: "FIN", label: "FIN — Fio de Nylon" },
  { value: "FIA", label: "FIA — Fio de Aço" },
];

const COLORING_COLORS = [
  { value: "CNZ", label: "Cinza" },
  { value: "MAR", label: "Marrom" },
  { value: "VDE", label: "Verde" },
];

const COLORING_INTENSITIES = [
  { value: "D25", label: "Degradê 25%" },
  { value: "D50", label: "Degradê 50%" },
  { value: "D80", label: "Degradê 80%" },
  { value: "T25", label: "Total 25%" },
  { value: "T50", label: "Total 50%" },
  { value: "T80", label: "Total 80%" },
];

const CORRIDORS = [14, 15, 16, 17, 18];

type AutoFillSource = "depara" | "match" | "manual" | null;

function autoFillLabel(source: AutoFillSource) {
  switch (source) {
    case "depara": return { text: "DE/PARA automático", icon: <Zap className="h-3.5 w-3.5" />, color: "text-emerald-700 bg-emerald-500/15 border-emerald-300" };
    case "match": return { text: "Match inteligente", icon: <Sparkles className="h-3.5 w-3.5" />, color: "text-primary bg-primary/10 border-primary/30" };
    case "manual": return { text: "Seleção manual", icon: <Search className="h-3.5 w-3.5" />, color: "text-muted-foreground bg-muted border-border" };
    default: return null;
  }
}

// ============================================
// COMPONENT
// ============================================

const PedidoHaytekPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const codOs = Number(searchParams.get("codOs") || 0);
  const codEmpresa = Number(searchParams.get("codEmpresa") || 0);

  // ── OS Data ──
  const [osData, setOsData] = useState<OsHubRecord | null>(null);
  const [loadingOs, setLoadingOs] = useState(true);

  // ── Produtos catálogo ──
  const [produtos, setProdutos] = useState<HaytekProduto[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(true);

  // ── Selected product ──
  const [produtoSelecionado, setProdutoSelecionado] = useState<HaytekProduto | null>(null);
  const [autoFillSource, setAutoFillSource] = useState<AutoFillSource>(null);
  const [matchResult, setMatchResult] = useState<HaytekMatchResult | null>(null);
  const [showCandidates, setShowCandidates] = useState(false);

  // ── Prescrição OD/OE ──
  const [prescOd, setPrescOd] = useState({ esferico: "", cilindrico: "", eixo: "", adicao: "", dnp: "", altura: "" });
  const [prescOe, setPrescOe] = useState({ esferico: "", cilindrico: "", eixo: "", adicao: "", dnp: "", altura: "" });

  // ── Prisma ──
  const [prismaOd, setPrismaOd] = useState({ hBase: "", hValue: "", vBase: "", vValue: "" });
  const [prismaOe, setPrismaOe] = useState({ hBase: "", hValue: "", vBase: "", vValue: "" });

  // ── Armação ──
  const [frameCode, setFrameCode] = useState("ARF");
  const [frameMaterial, setFrameMaterial] = useState("Acetato");
  const [frameModelImage, setFrameModelImage] = useState("");
  const [frameBridge, setFrameBridge] = useState("");
  const [frameHeight, setFrameHeight] = useState("");
  const [frameWidth, setFrameWidth] = useState("");

  // ── Treatment ──
  const [treatment, setTreatment] = useState("ARA");

  // ── Corridor ──
  const [corridor, setCorridor] = useState<number | null>(null);

  // ── Coloring ──
  const [coloringColor, setColoringColor] = useState("");
  const [coloringIntensity, setColoringIntensity] = useState("");

  // ── Patient / OS ──
  const [paciente, setPaciente] = useState("");
  const [osNumero, setOsNumero] = useState("");

  // ── Confirmation state ──
  const [confirmedPrescription, setConfirmedPrescription] = useState(false);
  const [confirmedFrame, setConfirmedFrame] = useState(false);

  // ── Submission ──
  const [sending, setSending] = useState(false);
  const [resultado, setResultado] = useState<HaytekPedidoResponse | null>(null);
  const [tentativasEnvio, setTentativasEnvio] = useState<string[]>([]);
  const [erroEnvioDetalhado, setErroEnvioDetalhado] = useState<string | null>(null);
  const [haytekStoreId, setHaytekStoreId] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");

  function parsePositiveInt(value: string): number | null {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function resolveFrameConfig() {
    const parsedBridge = parsePositiveInt(frameBridge);
    const parsedHeight = parsePositiveInt(frameHeight);
    const parsedWidth = parsePositiveInt(frameWidth);
    const trimmedModelImage = frameModelImage.trim();

    return {
      code: frameCode || "ARF",
      material: frameMaterial || "Acetato",
      modelImage: trimmedModelImage || "009",
      bridge: parsedBridge ?? 10,
      height: parsedHeight ?? 32,
      width: parsedWidth ?? 35,
      fallbackFields: [
        !trimmedModelImage ? "modelImage=009" : null,
        parsedBridge == null ? "ponte=10" : null,
        parsedHeight == null ? "altura=32" : null,
        parsedWidth == null ? "largura=35" : null,
      ].filter(Boolean) as string[],
    };
  }

  function describePayloadFrame(payload: HaytekPedidoPayload): string {
    const frame = payload.products.frame;
    const fallbackFields = resolveFrameConfig().fallbackFields;
    const frameSummary = `aro code=${frame.code}, modelImage=${frame.modelImage}, bridge=${frame.bridge}, height=${frame.height}, width=${frame.width}`;

    return fallbackFields.length > 0
      ? `${frameSummary} | defaults: ${fallbackFields.join(", ")}`
      : frameSummary;
  }

  function extractApiErrorMessage(err: unknown): string {
    if (typeof err === "object" && err !== null && "message" in err) {
      return String((err as { message?: unknown }).message ?? "Erro desconhecido").replace(/\s+/g, " ").trim();
    }

    return String(err ?? "Erro desconhecido").replace(/\s+/g, " ").trim();
  }

  // ── Load OS data ──
  useEffect(() => {
    if (!codOs || !codEmpresa) return;
    setLoadingOs(true);
    fetchSingleOsRecipe(codOs, codEmpresa)
      .then((os) => {
        setOsData(os);
        if (os) {
          setPaciente(os.cliente || "");
          setOsNumero(os.numeroOs || String(codOs));
          const resolved = resolverPrescricaoCompleta(os);
          setPrescOd({
            esferico: String(resolved.od.esferico ?? ""),
            cilindrico: String(resolved.od.cilindrico ?? ""),
            eixo: String(resolved.od.eixo ?? ""),
            adicao: String(resolved.od.adicao ?? ""),
            dnp: String(os.odDnp ?? ""),
            altura: String(os.odAltura ?? ""),
          });
          setPrescOe({
            esferico: String(resolved.oe.esferico ?? ""),
            cilindrico: String(resolved.oe.cilindrico ?? ""),
            eixo: String(resolved.oe.eixo ?? ""),
            adicao: String(resolved.oe.adicao ?? ""),
            dnp: String(os.oeDnp ?? ""),
            altura: String(os.oeAltura ?? ""),
          });

          // Auto-fill armação
          if (os.ponte) setFrameBridge(String(os.ponte));
          if (os.aaVertical) setFrameHeight(String(os.aaVertical));
          if (os.caHorizontal) setFrameWidth(String(os.caHorizontal));

          // Auto-fill prisma
          if (os.prisma) {
            const pText = os.prisma.toUpperCase();
            if (pText.includes("NASAL") || pText.includes("TEMPORAL")) {
              setPrismaOd(prev => ({
                ...prev,
                hBase: pText.includes("NASAL") ? "Nasal" : "Temporal",
                hValue: os.prismaAngulo ? String(os.prismaAngulo) : "",
              }));
            }
            if (pText.includes("SUPERIOR") || pText.includes("INFERIOR")) {
              setPrismaOd(prev => ({
                ...prev,
                vBase: pText.includes("SUPERIOR") ? "Superior" : "Inferior",
                vValue: os.prismaAngulo ? String(os.prismaAngulo) : "",
              }));
            }
          }
          if (os.prisma1) {
            const pText = os.prisma1.toUpperCase();
            if (pText.includes("NASAL") || pText.includes("TEMPORAL")) {
              setPrismaOe(prev => ({
                ...prev,
                hBase: pText.includes("NASAL") ? "Nasal" : "Temporal",
                hValue: os.prisma1Angulo ? String(os.prisma1Angulo) : "",
              }));
            }
            if (pText.includes("SUPERIOR") || pText.includes("INFERIOR")) {
              setPrismaOe(prev => ({
                ...prev,
                vBase: pText.includes("SUPERIOR") ? "Superior" : "Inferior",
                vValue: os.prisma1Angulo ? String(os.prisma1Angulo) : "",
              }));
            }
          }
        }
      })
      .finally(() => setLoadingOs(false));
  }, [codOs, codEmpresa]);

  // ── Load catálogo ──
  useEffect(() => {
    setLoadingProdutos(true);
    listarProdutosHaytek()
      .then(setProdutos)
      .finally(() => setLoadingProdutos(false));
  }, []);

  // ── Load storeId da empresa ──
  useEffect(() => {
    if (!codEmpresa) return;
    supabase
      .from("haytek_empresa_config" as never)
      .select("store_id, alias")
      .eq("cod_empresa", codEmpresa)
      .eq("ativo", true)
      .maybeSingle()
      .then(({ data }) => {
        if ((data as any)?.store_id) setHaytekStoreId((data as any).store_id);
        if ((data as any)?.alias) setStoreName((data as any).alias);
      });
  }, [codEmpresa]);

  // ── Auto-match when products + OS loaded ──
  useEffect(() => {
    if (!osData || produtos.length === 0) return;
    const lensDesc = osData.lenteOdDescricao || osData.lenteOeDescricao || "";
    if (!lensDesc) return;

    matchHaytekProducts(produtos, lensDesc).then((result) => {
      setMatchResult(result);
      if (result.bestMatch) {
        setProdutoSelecionado(result.bestMatch.produto);
        setAutoFillSource(result.source === "depara" ? "depara" : "match");
      }
    });
  }, [osData, produtos]);

  // ── Detect progressive + stock (pronta) ──
  const isProgressivo = useMemo(() => {
    if (!produtoSelecionado) return false;
    const full = `${produtoSelecionado.design || ""} ${produtoSelecionado.nome_comercial || ""}`.toUpperCase();
    return full.includes("PROGRESS") || full.includes("MULTIFOCAL");
  }, [produtoSelecionado]);

  const isStockLens = useMemo(() => {
    if (!produtoSelecionado) return false;
    return produtoSelecionado.product_id.startsWith("SS");
  }, [produtoSelecionado]);

  // Stock lenses don't need DNP/Altura
  const needsDnpAltura = !isStockLens;

  // ── Select candidate ──
  const handleSelectCandidate = useCallback(async (candidate: HaytekMatchCandidate) => {
    setProdutoSelecionado(candidate.produto);
    setAutoFillSource(candidate.source === "depara" ? "depara" : "manual");
    setShowCandidates(false);

    // Save DE/PARA
    const lensDesc = osData?.lenteOdDescricao || osData?.lenteOeDescricao || "";
    if (lensDesc && candidate.source !== "depara") {
      await saveHaytekDepara(lensDesc, candidate.produto);
    }
  }, [osData]);

  // ── Build payload ──
  // Format dioptria value: always 2 decimal places with explicit sign (e.g. "+1.25", "-0.50", "0.00")
  function formatDioptria(val: string | undefined | null): string {
    if (!val || val.trim() === "") return "+0.00";
    const num = parseFloat(val.replace(",", "."));
    if (isNaN(num)) return "+0.00";
    const formatted = Math.abs(num).toFixed(2);
    if (num < 0) return `-${formatted}`;
    return `+${formatted}`; // "+0.00" or "+1.25"
  }

  // Format decimal measurement (ndp, height): always 1 decimal place (e.g. "31.0", "20.0")
  function formatMeasurement(val: string | undefined | null): string | null {
    if (!val || val.trim() === "") return null;
    const num = parseFloat(val.replace(",", "."));
    if (isNaN(num)) return null;
    return num.toFixed(1);
  }

  function buildPayload(productOverride?: HaytekProduto): HaytekPedidoPayload {
    const prodId = productOverride?.product_id || produtoSelecionado?.product_id || "";
    const isSingleVision = prodId.startsWith("SS") || (!isProgressivo && !prescOd.adicao && !prescOe.adicao);

    const buildEye = (presc: typeof prescOd, prisma: typeof prismaOd) => {
      const eye: Record<string, unknown> = {};
      eye.spherical = formatDioptria(presc.esferico);
      eye.cylindrical = formatDioptria(presc.cilindrico);
      eye.axis = presc.eixo || "0";
      // Always send addition — API requires it even for single vision (send "0.00")
      eye.addition = formatDioptria(presc.adicao || "0.00");
      const ndp = formatMeasurement(presc.dnp);
      if (ndp) eye.ndp = ndp;
      const height = formatMeasurement(presc.altura);
      if (height) eye.height = height;

      if (prisma.hBase || prisma.vBase) {
        eye.prism = {};
        if (prisma.hBase && prisma.hValue) {
          (eye.prism as any).horizontal = { base: prisma.hBase, value: prisma.hValue };
        }
        if (prisma.vBase && prisma.vValue) {
          (eye.prism as any).vertical = { base: prisma.vBase, value: prisma.vValue };
        }
      }
      return eye;
    };

    const frameConfig = resolveFrameConfig();

    const payload: HaytekPedidoPayload = {
      storeId: haytekStoreId, // explicit store ID from haytek_empresa_config
      osId: osNumero,
      patientName: paciente,
      products: {
        productId: productOverride?.product_id || produtoSelecionado?.product_id || "",
        treatment,
        frame: {
          code: frameConfig.code,
          material: frameConfig.material,
          modelImage: frameConfig.modelImage,
          bridge: frameConfig.bridge,
          height: frameConfig.height,
          width: frameConfig.width,
        },
        right: buildEye(prescOd, prismaOd) as any,
        left: buildEye(prescOe, prismaOe) as any,
      },
    };

    if (isProgressivo && corridor) {
      payload.products.corridor = corridor;
    }

    if (coloringColor && coloringIntensity) {
      payload.products.coloring = {
        color: coloringColor,
        intensityCode: coloringIntensity,
      };
    }

    return payload;
  }

  // ── Validação de dioptria contra catálogo ──
  function validateDioptriaForProduct(product: HaytekProduto): string | null {
    const eyes = [
      { label: "OD", presc: prescOd },
      { label: "OE", presc: prescOe },
    ];
    for (const { label, presc } of eyes) {
      const esf = parseFloat(presc.esferico || "0");
      const cil = parseFloat(presc.cilindrico || "0");
      const adi = parseFloat(presc.adicao || "0");

      if (product.esferico_minimo != null && esf < product.esferico_minimo) {
        return `${label}: Esférico ${esf} abaixo do mínimo (${product.esferico_minimo}) para ${product.product_id}`;
      }
      if (product.esferico_maximo != null && esf > product.esferico_maximo) {
        return `${label}: Esférico ${esf} acima do máximo (${product.esferico_maximo}) para ${product.product_id}`;
      }
      if (product.cilindrico_maximo != null && Math.abs(cil) > Math.abs(product.cilindrico_maximo)) {
        return `${label}: Cilíndrico ${cil} fora do limite (${product.cilindrico_maximo}) para ${product.product_id}`;
      }
      // Produto exige adição mas prescrição não tem
      if (product.adicao_minima != null && product.adicao_minima > 0 && adi === 0) {
        return `${label}: Produto ${product.product_id} exige adição (mín ${product.adicao_minima}), mas a prescrição não possui. Selecione um produto de visão simples.`;
      }
      if (adi > 0) {
        if (product.adicao_minima != null && adi < product.adicao_minima) {
          return `${label}: Adição ${adi} abaixo da mínima (${product.adicao_minima}) para ${product.product_id}`;
        }
        if (product.adicao_maxima != null && adi > product.adicao_maxima) {
          return `${label}: Adição ${adi} acima da máxima (${product.adicao_maxima}) para ${product.product_id}`;
        }
      }
    }
    return null;
  }

  // ── Submit ──
  const handleSubmit = async () => {
    if (!produtoSelecionado) {
      toast({ title: "Selecione um produto", variant: "destructive" });
      return;
    }
    if (!paciente.trim()) {
      toast({ title: "Nome do paciente é obrigatório", variant: "destructive" });
      return;
    }

    setSending(true);
    setResultado(null);
    setTentativasEnvio([]);
    setErroEnvioDetalhado(null);

    try {
      // Validação local antes de enviar
      const localValidationError = validateDioptriaForProduct(produtoSelecionado);
      if (localValidationError) {
        throw new Error(localValidationError);
      }

      const payload = buildPayload(produtoSelecionado);
      const frameSummary = describePayloadFrame(payload);
      const limitesResumo = buildLimitesResumo(produtoSelecionado);

      const resp = await criarPedidoHaytek(payload, codOs, codEmpresa);

      setResultado(resp);
      setErroEnvioDetalhado(null);

      if (resp.orderId) {
        toast({ title: `Pedido Haytek criado: ${resp.orderId}` });
        registrarPedidoNoCache(codOs, String(resp.orderId), "HAYTEK", "CONFIRMADO");
      } else {
        toast({ title: "Pedido enviado", description: resp.message || "Aguardando confirmação" });
      }
    } catch (err: any) {
      const apiMsg = extractApiErrorMessage(err);
      const payload = buildPayload(produtoSelecionado);
      const frameSummary = describePayloadFrame(payload);
      const limitesResumo = buildLimitesResumo(produtoSelecionado);

      // Montar resumo claro do payload enviado para o operador
      const payloadRight = payload.products.right;
      const payloadLeft = payload.products.left;
      const detalhes = [
        `❌ Erro da API: ${apiMsg}`,
        ``,
        `📦 Produto: ${produtoSelecionado.product_id} — ${produtoSelecionado.nome_comercial || ""}`,
        limitesResumo,
        ``,
        `📋 Payload enviado:`,
        `  OD → Esf: ${payloadRight.spherical}  Cil: ${payloadRight.cylindrical}  Eixo: ${payloadRight.axis || "-"}  Ad: ${(payloadRight as any).addition || "omitido"}  DNP: ${payloadRight.ndp || "-"}  Alt: ${payloadRight.height || "-"}`,
        `  OE → Esf: ${payloadLeft.spherical}  Cil: ${payloadLeft.cylindrical}  Eixo: ${payloadLeft.axis || "-"}  Ad: ${(payloadLeft as any).addition || "omitido"}  DNP: ${payloadLeft.ndp || "-"}  Alt: ${payloadLeft.height || "-"}`,
        `  Armação: ${frameSummary}`,
        `  Tratamento: ${payload.products.treatment}`,
      ];

      setResultado(null);
      setErroEnvioDetalhado(detalhes.join("\n"));
      toast({ title: "Erro ao enviar pedido", description: apiMsg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  function buildLimitesResumo(product: HaytekProduto): string {
    const lines: string[] = [`📊 Limites do produto ${product.product_id}:`];
    if (product.esferico_minimo != null || product.esferico_maximo != null) {
      lines.push(`  Esférico: ${product.esferico_minimo ?? "?"} a ${product.esferico_maximo ?? "?"}`);
    }
    if (product.cilindrico_maximo != null) {
      lines.push(`  Cilíndrico: até ${product.cilindrico_maximo}`);
    }
    if (product.adicao_minima != null || product.adicao_maxima != null) {
      lines.push(`  Adição: ${product.adicao_minima ?? "?"} a ${product.adicao_maxima ?? "?"}`);
    }
    return lines.join("\n");
  }

  // ── Loading state ──
  if (loadingOs || loadingProdutos) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Carregando dados...</span>
      </div>
    );
  }

  if (!osData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">OS não encontrada (codOs={codOs}, codEmpresa={codEmpresa})</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  const autoLabel = autoFillLabel(autoFillSource);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Pedido Haytek (Dmax)
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>OS</span>
            <Input
              className="h-6 w-24 text-sm font-mono px-1 py-0 inline-flex"
              value={osNumero}
              onChange={(e) => setOsNumero(e.target.value)}
            />
            <span>— {paciente} — {storeName || `Empresa ${codEmpresa}`}</span>
          </div>
        </div>
        {autoLabel && (
          <Badge variant="outline" className={cn("flex items-center gap-1 text-xs border", autoLabel.color)}>
            {autoLabel.icon} {autoLabel.text}
          </Badge>
        )}
      </div>

      {/* Resultado (sucesso) */}
      {resultado?.orderId && (
        <Alert className="border-emerald-300 bg-emerald-50">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-emerald-800">
            Pedido criado com sucesso! Nº <strong>{resultado.orderId}</strong>
          </AlertDescription>
        </Alert>
      )}

      {erroEnvioDetalhado && (
        <Alert className="border-destructive/40 bg-muted/30">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription>
            <p className="text-sm font-medium mb-2">Erro no envio do pedido</p>
            <pre className="text-xs whitespace-pre-line text-muted-foreground bg-background/60 rounded p-3 border border-border">
              {erroEnvioDetalhado}
            </pre>
          </AlertDescription>
        </Alert>
      )}

      {/* Produto selecionado */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Glasses className="h-4 w-4 text-primary" />
            Produto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {produtoSelecionado ? (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div>
                <p className="font-medium text-sm">{produtoSelecionado.nome_comercial || produtoSelecionado.product_id}</p>
                <p className="text-xs text-muted-foreground">
                  {produtoSelecionado.product_id} — {produtoSelecionado.design} — {produtoSelecionado.material}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowCandidates(!showCandidates)}>
                {showCandidates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Alterar
              </Button>
            </div>
          ) : (
            <div className="text-center p-4 text-muted-foreground">
              <p>Nenhum produto encontrado automaticamente.</p>
              <Button variant="outline" className="mt-2" onClick={() => setShowCandidates(true)}>
                <Search className="h-4 w-4 mr-2" /> Buscar produto
              </Button>
            </div>
          )}

          {/* Candidates list */}
          {showCandidates && matchResult && matchResult.candidates.length > 0 && (
            <ScrollArea className="max-h-60">
              <div className="space-y-1">
                {matchResult.candidates.map((c, i) => {
                  const sl = haytekScoreLabel(c.score);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectCandidate(c)}
                      className={cn(
                        "w-full text-left p-2 rounded-md border hover:border-primary/50 transition-all",
                        produtoSelecionado?.product_id === c.produto.product_id ? "border-primary bg-primary/5" : "border-border"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{c.produto.nome_comercial || c.produto.product_id}</p>
                          <p className="text-xs text-muted-foreground">{c.produto.product_id} — {c.produto.material}</p>
                        </div>
                        <Badge variant="outline" className={cn("text-xs", sl.color)}>{sl.text} ({c.score})</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* All products dropdown for manual search */}
          {showCandidates && (
            <div className="space-y-2">
              <Label className="text-xs">Busca manual no catálogo ({produtos.length} produtos)</Label>
              <Select onValueChange={(pid) => {
                const p = produtos.find(pr => pr.product_id === pid);
                if (p) {
                  setProdutoSelecionado(p);
                  setAutoFillSource("manual");
                  setShowCandidates(false);
                  const lensDesc = osData?.lenteOdDescricao || osData?.lenteOeDescricao || "";
                  if (lensDesc) saveHaytekDepara(lensDesc, p);
                }
              }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar produto..." />
                </SelectTrigger>
                <SelectContent>
                  {produtos.map((p) => (
                    <SelectItem key={p.product_id} value={p.product_id}>
                      {p.product_id} — {p.nome_comercial || p.design}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prescrição Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="h-4 w-4" /> Prescrição
          {!confirmedPrescription && (
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-300">
              <AlertTriangle className="h-3 w-3 mr-1" /> Revisar e confirmar
            </Badge>
          )}
          {confirmedPrescription && (
            <Badge className="bg-emerald-600 text-white gap-1 text-xs">
              <CheckCircle2 className="h-3 w-3" /> Confirmada
            </Badge>
          )}
        </div>
        {!confirmedPrescription && (
          <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs border-emerald-400 text-emerald-700 hover:bg-emerald-50" onClick={() => setConfirmedPrescription(true)}>
            <Check className="h-3 w-3" /> Confirmar Receita
          </Button>
        )}
        {confirmedPrescription && (
          <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs text-muted-foreground" onClick={() => setConfirmedPrescription(false)}>
            <Pencil className="h-3 w-3" /> Editar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Prescrição OD */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Olho Direito (OD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Esférico", field: "esferico" },
                { label: "Cilíndrico", field: "cilindrico" },
                { label: "Eixo", field: "eixo" },
                { label: "Adição", field: "adicao" },
                { label: "DNP", field: "dnp" },
                { label: "Altura", field: "altura" },
              ].map(({ label, field }) => (
                <div key={field} className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
                  <Input
                    className="h-8 text-sm"
                    value={(prescOd as any)[field]}
                    onChange={(e) => {
                      setPrescOd(prev => ({ ...prev, [field]: e.target.value }));
                      if (confirmedPrescription) setConfirmedPrescription(false);
                    }}
                  />
                </div>
              ))}
            </div>
            {/* Prisma OD */}
            <Separator className="my-3" />
            <p className="text-[10px] uppercase text-muted-foreground mb-2">Prisma (opcional)</p>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">H Base</Label>
                <Select value={prismaOd.hBase} onValueChange={(v) => setPrismaOd(p => ({ ...p, hBase: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nasal">Nasal</SelectItem>
                    <SelectItem value="Temporal">Temporal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">H Valor</Label>
                <Input className="h-7 text-xs" value={prismaOd.hValue} onChange={(e) => setPrismaOd(p => ({ ...p, hValue: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">V Base</Label>
                <Select value={prismaOd.vBase} onValueChange={(v) => setPrismaOd(p => ({ ...p, vBase: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Superior">Superior</SelectItem>
                    <SelectItem value="Inferior">Inferior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">V Valor</Label>
                <Input className="h-7 text-xs" value={prismaOd.vValue} onChange={(e) => setPrismaOd(p => ({ ...p, vValue: e.target.value }))} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Prescrição OE */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Olho Esquerdo (OE)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Esférico", field: "esferico" },
                { label: "Cilíndrico", field: "cilindrico" },
                { label: "Eixo", field: "eixo" },
                { label: "Adição", field: "adicao" },
                { label: "DNP", field: "dnp" },
                { label: "Altura", field: "altura" },
              ].map(({ label, field }) => (
                <div key={field} className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
                  <Input
                    className="h-8 text-sm"
                    value={(prescOe as any)[field]}
                    onChange={(e) => {
                      setPrescOe(prev => ({ ...prev, [field]: e.target.value }));
                      if (confirmedPrescription) setConfirmedPrescription(false);
                    }}
                  />
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <p className="text-[10px] uppercase text-muted-foreground mb-2">Prisma (opcional)</p>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">H Base</Label>
                <Select value={prismaOe.hBase} onValueChange={(v) => setPrismaOe(p => ({ ...p, hBase: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nasal">Nasal</SelectItem>
                    <SelectItem value="Temporal">Temporal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">H Valor</Label>
                <Input className="h-7 text-xs" value={prismaOe.hValue} onChange={(e) => setPrismaOe(p => ({ ...p, hValue: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">V Base</Label>
                <Select value={prismaOe.vBase} onValueChange={(v) => setPrismaOe(p => ({ ...p, vBase: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Superior">Superior</SelectItem>
                    <SelectItem value="Inferior">Inferior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">V Valor</Label>
                <Input className="h-7 text-xs" value={prismaOe.vValue} onChange={(e) => setPrismaOe(p => ({ ...p, vValue: e.target.value }))} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Armação */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Glasses className="h-4 w-4 text-primary" /> Armação
              {!confirmedFrame && (
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-300">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Revisar
                </Badge>
              )}
              {confirmedFrame && (
                <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3" /> Confirmada
                </Badge>
              )}
            </CardTitle>
            {!confirmedFrame && (
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs border-emerald-400 text-emerald-700 hover:bg-emerald-50" onClick={() => setConfirmedFrame(true)}>
                <Check className="h-3 w-3" /> Confirmar Armação
              </Button>
            )}
            {confirmedFrame && (
              <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs text-muted-foreground" onClick={() => setConfirmedFrame(false)}>
                <Pencil className="h-3 w-3" /> Editar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Tipo</Label>
              <Select value={frameCode} onValueChange={setFrameCode}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FRAME_CODES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Material</Label>
              <Select value={frameMaterial} onValueChange={setFrameMaterial}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Acetato">Acetato</SelectItem>
                  <SelectItem value="Metal">Metal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Ponte</Label>
              <Input className="h-8 text-sm" value={frameBridge} onChange={(e) => setFrameBridge(e.target.value)} placeholder="mm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Altura</Label>
              <Input className="h-8 text-sm" value={frameHeight} onChange={(e) => setFrameHeight(e.target.value)} placeholder="mm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Largura</Label>
              <Input className="h-8 text-sm" value={frameWidth} onChange={(e) => setFrameWidth(e.target.value)} placeholder="mm" />
            </div>
          </div>
          <HaytekFormatoAroSelector value={frameModelImage} onChange={setFrameModelImage} />
        </CardContent>
      </Card>

      {/* Treatment + Corridor + Coloring */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tratamento</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={treatment} onValueChange={setTreatment}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TREATMENTS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {isProgressivo && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Corredor</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={corridor ? String(corridor) : ""} onValueChange={(v) => setCorridor(Number(v))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {CORRIDORS.map(c => <SelectItem key={c} value={String(c)}>{c}mm</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Coloração (opcional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Select value={coloringColor || "NONE"} onValueChange={(v) => setColoringColor(v === "NONE" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Cor..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Nenhuma</SelectItem>
                {COLORING_COLORS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {coloringColor && (
              <Select value={coloringIntensity} onValueChange={setColoringIntensity}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Intensidade..." /></SelectTrigger>
                <SelectContent>
                  {COLORING_INTENSITIES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
        <Button onClick={handleSubmit} disabled={sending || !!resultado?.orderId}>
          {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Enviar Pedido Haytek
        </Button>
      </div>
    </div>
  );
};

export default PedidoHaytekPage;
