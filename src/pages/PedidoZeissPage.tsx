// src/pages/PedidoZeissPage.tsx
// Tela de criação de pedido Zeiss (MaisZeiss) — com matching inteligente + DE/PARA + auto-fill
// + serviços/cores + sugestão base + validação clínica

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { OsHubRecord, fetchSingleOsRecipe } from "@/services/osHubService";
import {
  ZeissProduto,
  ZeissPedidoPayload,
  ZeissApprovalResponse,
  ZeissConfirmResponse,
  listarProdutosZeiss,
  criarPedidoZeiss,
  cancelarPedidoZeiss,
} from "@/services/zeissService";
import {
  matchZeissProducts,
  saveZeissDepara,
  ZeissMatchCandidate,
  ZeissMatchResult,
  zeissScoreLabel,
} from "@/services/zeissMatchingService";
import { validateZeissPayload, hasBlockingErrors, ValidationError } from "@/services/zeissValidation";
import { resolverPrescricaoCompleta } from "@/utils/prescricaoResolver";
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
import ZeissServicosSection from "@/components/zeiss-pedido/ZeissServicosSection";
import ZeissSugestaoBase from "@/components/zeiss-pedido/ZeissSugestaoBase";
import ZeissValidationPanel from "@/components/zeiss-pedido/ZeissValidationPanel";

import {
  ArrowLeft, Send, Eye, Glasses, Package, Loader2, Check, AlertTriangle,
  Search, ShieldCheck, CheckCircle2, DollarSign, Zap, Sparkles, ChevronDown,
  ChevronUp, XCircle, Ban,
} from "lucide-react";

// ============================================
// HELPERS
// ============================================

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const TIPO_ARMACAO_ZEISS: Record<string, string> = {
  M: "Metal", A: "Acetato", F: "Fio de Nylon", P: "Parafuso", C: "Fio de Aço", S: "Segurança",
};

function detectTipoArmacaoFromRef(ref: string | null | undefined): string {
  if (!ref) return "M";
  const upper = ref.toUpperCase();
  if (upper.includes("ACT") || upper.includes("ACET")) return "A";
  if (upper.includes("NYLON") || upper.includes("FIO")) return "F";
  if (upper.includes("PARAF")) return "P";
  return "M";
}

type AutoFillSource = "depara" | "match" | "manual" | null;

function autoFillLabel(source: AutoFillSource) {
  switch (source) {
    case "depara": return { text: "DE/PARA automático", icon: <Zap className="h-3.5 w-3.5" />, color: "text-emerald-700 bg-emerald-500/15 border-emerald-300" };
    case "match": return { text: "Match inteligente", icon: <Sparkles className="h-3.5 w-3.5" />, color: "text-primary bg-primary/10 border-primary/30" };
    case "manual": return { text: "Seleção manual", icon: <Search className="h-3.5 w-3.5" />, color: "text-muted-foreground bg-muted border-border" };
    default: return null;
  }
}

/** Extract familia (cat) from selected product for service/color lookups */
function extractFamilia(produto: ZeissProduto | null): string | null {
  if (!produto?.cat) return null;
  return produto.cat;
}

// ============================================
// COMPONENT
// ============================================

const PedidoZeissPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const codOs = Number(searchParams.get("codOs")) || 0;
  const codEmpresa = Number(searchParams.get("codEmpresa")) || 0;
  const paramPaciente = searchParams.get("paciente") || "";
  const paramCpf = searchParams.get("cpf") || "";
  const paramDataNascimento = searchParams.get("dataNascimento") || "";

  // State
  const [os, setOs] = useState<OsHubRecord | null>(null);
  const [loadingOs, setLoadingOs] = useState(true);
  const [produtos, setProdutos] = useState<ZeissProduto[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Product matching
  const [matchResult, setMatchResult] = useState<ZeissMatchResult | null>(null);
  const [produtoOd, setProdutoOd] = useState<ZeissProduto | null>(null);
  const [produtoOe, setProdutoOe] = useState<ZeissProduto | null>(null);
  const [useSameProduct, setUseSameProduct] = useState(true);
  const [autoFillSource, setAutoFillSource] = useState<AutoFillSource>(null);
  const [confirmedProduct, setConfirmedProduct] = useState(false);
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [showMatchCandidates, setShowMatchCandidates] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");

  // Two-step flow
  const [approvalData, setApprovalData] = useState<ZeissApprovalResponse | null>(null);
  const [pedidoConfirmado, setPedidoConfirmado] = useState<ZeissConfirmResponse | null>(null);
  const [pedidoExistente, setPedidoExistente] = useState<{ numero_pedido: string | null; status: string; estabelecimento?: string } | null>(null);

  // Prescrição editável
  const [prescOd, setPrescOd] = useState({
    esferico: "", cilindrico: "", eixo: "", adicao: "", dnp: "", alturaMontagem: "",
    prisma: "", eixoPrisma: "",
  });
  const [prescOe, setPrescOe] = useState({
    esferico: "", cilindrico: "", eixo: "", adicao: "", dnp: "", alturaMontagem: "",
    prisma: "", eixoPrisma: "",
  });
  const [confirmedPrescription, setConfirmedPrescription] = useState(false);
  const [prescAutoFilled, setPrescAutoFilled] = useState(false);

  // Armação
  const [armacao, setArmacao] = useState({
    modelo: "", ponte: "", altura: "", largura: "", diagonalMaior: "", tipo: "M", formatoAro: "",
  });

  // Patient/order
  const [osNumero, setOsNumero] = useState("");
  const [paciente, setPaciente] = useState("");
  const [cpf, setCpf] = useState("");
  const [medico, setMedico] = useState("");
  const [crm, setCrm] = useState("");
  const [voucher, setVoucher] = useState("");
  const [observacao, setObservacao] = useState("");

  // Services & Colors
  const [selectedServicos, setSelectedServicos] = useState<string[]>([]);
  const [selectedCor, setSelectedCor] = useState("none");

  // Sugestão de base
  const [sugestaoBase, setSugestaoBase] = useState("");
  const [sugestaoDiametro, setSugestaoDiametro] = useState("");

  // Validation
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showValidation, setShowValidation] = useState(false);

  // Cancellation
  const [cancelando, setCancelando] = useState(false);

  // ── Load OS data ──
  useEffect(() => {
    if (!codOs) return;
    (async () => {
      setLoadingOs(true);
      try {
        const found = await fetchSingleOsRecipe(codOs, codEmpresa);
        if (found) {
          if (!found.cpf && paramCpf) found.cpf = paramCpf;
          if (!found.paciente && paramPaciente) found.paciente = paramPaciente;
          setOs(found);

          const resolved = resolverPrescricaoCompleta(found);

          setPrescOd({
            esferico: resolved.od.esferico != null ? String(resolved.od.esferico) : "",
            cilindrico: resolved.od.cilindrico != null ? String(resolved.od.cilindrico) : "",
            eixo: resolved.od.eixo != null ? String(resolved.od.eixo) : "",
            adicao: resolved.od.adicao != null ? String(resolved.od.adicao) : "",
            dnp: found.odDnp != null ? String(found.odDnp) : "",
            alturaMontagem: found.odAltura != null ? String(found.odAltura) : "",
            prisma: "", eixoPrisma: "",
          });
          setPrescOe({
            esferico: resolved.oe.esferico != null ? String(resolved.oe.esferico) : "",
            cilindrico: resolved.oe.cilindrico != null ? String(resolved.oe.cilindrico) : "",
            eixo: resolved.oe.eixo != null ? String(resolved.oe.eixo) : "",
            adicao: resolved.oe.adicao != null ? String(resolved.oe.adicao) : "",
            dnp: found.oeDnp != null ? String(found.oeDnp) : "",
            alturaMontagem: found.oeAltura != null ? String(found.oeAltura) : "",
            prisma: "", eixoPrisma: "",
          });

          const hasPrescData = found.odLongeEsf != null || found.odLongeCil != null ||
            found.oeLongeEsf != null || found.oeLongeCil != null;
          if (hasPrescData) setPrescAutoFilled(true);

          setArmacao({
            modelo: found.referenciaArmacao || "",
            ponte: found.ponte != null ? String(found.ponte) : "",
            altura: found.aaVertical != null ? String(found.aaVertical) : "",
            largura: found.caHorizontal != null ? String(found.caHorizontal) : found.ta != null ? String(found.ta) : "",
            diagonalMaior: found.md != null ? String(found.md) : "",
            tipo: detectTipoArmacaoFromRef(found.referenciaArmacao),
            formatoAro: "",
          });
          setOsNumero(String(found.numeroOs || found.codOs));
          setPaciente(removeAccents(found.paciente || paramPaciente || found.cliente || ""));
          setCpf(found.cpf || paramCpf || "");
          if (found.medico) setMedico(removeAccents(found.medico));
          if (found.crm) setCrm(found.crm);

          // Lookup voucher
          const cpfToSearch = found.cpf || paramCpf;
          if (cpfToSearch) {
            const { data: vData } = await supabase
              .from("voucher_cliente")
              .select("voucher")
              .eq("cpf", cpfToSearch)
              .maybeSingle();
            if (vData?.voucher) {
              setVoucher(vData.voucher);
              toast({ title: "Voucher encontrado", description: `"${vData.voucher}" vinculado ao CPF.` });
            }
          }
        }
      } catch (err) {
        console.error("[PedidoZeiss] Error loading OS:", err);
        toast({ title: "Erro ao carregar OS", variant: "destructive" });
      } finally {
        setLoadingOs(false);
      }
    })();
  }, [codOs, codEmpresa]);

  // ── Check existing order ──
  useEffect(() => {
    if (!codOs) return;
    (async () => {
      const { data: rows } = await supabase
        .from("pedidos_fornecedor")
        .select("numero_pedido, status, response")
        .eq("cod_os", codOs)
        .eq("fornecedor", "ZEISS")
        .order("created_at", { ascending: false });
      if (rows && rows.length > 0) {
        const confirmado = rows.find(r => r.numero_pedido);
        if (confirmado) {
          const resp = confirmado.response as any;
          setPedidoExistente({
            numero_pedido: confirmado.numero_pedido,
            status: confirmado.status || "",
            estabelecimento: resp?.sao?.pedido?.est || resp?.estabelecimento || "",
          });
        }
      }
    })();
  }, [codOs]);

  // ── Load products ──
  useEffect(() => {
    if (!codEmpresa) return;
    (async () => {
      setLoadingProdutos(true);
      try {
        const prods = await listarProdutosZeiss(codEmpresa);
        setProdutos(Array.isArray(prods) ? prods : []);
      } catch (err) {
        console.error("[PedidoZeiss] Error loading products:", err);
        toast({ title: "Erro ao carregar catálogo Zeiss", description: err instanceof Error ? err.message : "Verifique a configuração.", variant: "destructive" });
      } finally {
        setLoadingProdutos(false);
      }
    })();
  }, [codEmpresa]);

  // ── Run matching when OS + catalog are ready ──
  useEffect(() => {
    if (!os || produtos.length === 0) return;
    const descricao = os.lenteOdDescricao || os.lenteOeDescricao;
    if (!descricao) return;

    (async () => {
      const result = await matchZeissProducts(produtos, descricao);
      setMatchResult(result);

      if (result.bestMatch) {
        setProdutoOd(result.bestMatch.produto);
        setProdutoOe(result.bestMatch.produto);
        setAutoFillSource(result.source === "depara" ? "depara" : "match");
        setConfirmedProduct(result.source === "depara");
        toast({
          title: result.source === "depara" ? "Produto encontrado via DE/PARA" : "Match inteligente realizado",
          description: result.bestMatch.produto.nome,
        });
      }
    })();
  }, [os, produtos]);

  // ── Select product handler ──
  const handleSelectProduct = useCallback((produto: ZeissProduto, source: AutoFillSource) => {
    setProdutoOd(produto);
    if (useSameProduct) setProdutoOe(produto);
    setAutoFillSource(source);
    setConfirmedProduct(source === "manual" || source === "depara");
    setShowManualSearch(false);
    setBuscaProduto("");
    // Reset services/colors when product changes
    setSelectedServicos([]);
    setSelectedCor("none");
  }, [useSameProduct]);

  // ── Manual search ──
  const filteredProdutos = useMemo(() => {
    if (!buscaProduto.trim()) return produtos.slice(0, 30);
    const q = buscaProduto.toLowerCase();
    return produtos.filter(p =>
      p.nome?.toLowerCase().includes(q) || p.descr?.toLowerCase().includes(q) || p.cod?.includes(q)
    ).slice(0, 30);
  }, [produtos, buscaProduto]);

  // ── Familia from selected product ──
  const familia = extractFamilia(produtoOd);

  // ── Handle sugestão base ──
  const handleSugestaoBase = useCallback((base: string, diametro: string) => {
    setSugestaoBase(base);
    setSugestaoDiametro(diametro);
  }, []);

  // ── Validate ──
  const runValidation = useCallback((): ValidationError[] => {
    const errors = validateZeissPayload(
      produtoOd?.cod || null,
      produtoOe?.cod || null,
      prescOd,
      prescOe,
      armacao,
      osNumero,
      paciente,
      produtoOd?.nome || produtoOd?.descr || null,
      produtoOe?.nome || produtoOe?.descr || null,
    );
    setValidationErrors(errors);
    setShowValidation(true);
    return errors;
  }, [produtoOd, produtoOe, prescOd, prescOe, armacao, osNumero, paciente]);

  // ── Build payload ──
  function buildPayload(aprov?: ZeissApprovalResponse["aprov"]): ZeissPedidoPayload {
    const payload: ZeissPedidoPayload = {
      oscliente: osNumero,
      paciente,
      cpfpaciente: cpf.replace(/[.\-]/g, ""),
      medico,
      crm,
      voucher: voucher || "",
      corcoloracao: "",
      amostracoloracao: "",
      observacao: observacao ? [observacao] : [],
    };

    if (produtoOd || prescOd.esferico) {
      payload.od = {
        produto: produtoOd?.cod || "",
        esferico: prescOd.esferico,
        cilindrico: prescOd.cilindrico,
        eixocilindrico: prescOd.eixo,
        adicao: prescOd.adicao,
        regressao: "",
        dnp: prescOd.dnp,
        dnpperto: "",
        dnplonge: "",
        alturamontagem: prescOd.alturaMontagem,
        prisma: prescOd.prisma,
        eixoprisma: prescOd.eixoPrisma,
        sugestaobase: sugestaoBase || "",
        sugestaodiametro: sugestaoDiametro || "",
        compl: {},
      };
    }

    const oeProduct = useSameProduct ? produtoOd : produtoOe;
    if (oeProduct || prescOe.esferico) {
      payload.oe = {
        produto: oeProduct?.cod || produtoOd?.cod || "",
        esferico: prescOe.esferico,
        cilindrico: prescOe.cilindrico,
        eixocilindrico: prescOe.eixo,
        adicao: prescOe.adicao,
        regressao: "",
        dnp: prescOe.dnp,
        dnpperto: "",
        dnplonge: "",
        alturamontagem: prescOe.alturaMontagem,
        prisma: prescOe.prisma,
        eixoprisma: prescOe.eixoPrisma,
        sugestaobase: sugestaoBase || "",
        sugestaodiametro: sugestaoDiametro || "",
        compl: {},
      };
    }

    // Armação is REQUIRED by Zeiss API — always include it
    payload.armacao = {
      compralab: "",
      modelo: armacao.modelo || "",
      ponte: armacao.ponte || "0",
      altura: armacao.altura || "0",
      largura: armacao.largura || "0",
      diagonalmaior: armacao.diagonalMaior || "0",
      tipo: armacao.tipo || "M",
      formatoaro: armacao.formatoAro || "",
      distanciahastes: "",
      distanciafrontal: "",
    };

    // Add services
    if (selectedServicos.length > 0) {
      payload.servicos = selectedServicos.map(cod => ({ codigo: cod }));
    }

    // compl is required by Zeiss API (even if empty)
    payload.compl = {};

    if (aprov) payload.aprov = aprov;
    return payload;
  }

  // ── Submit ──
  const handleSubmit = async () => {
    const errors = runValidation();
    if (hasBlockingErrors(errors)) {
      toast({ title: "Corrija os erros antes de enviar", variant: "destructive" });
      return;
    }

    // Show warnings but allow continue
    const warnings = errors.filter(e => e.severity === "warning");
    if (warnings.length > 0) {
      const proceed = window.confirm(
        `Atenção: ${warnings.length} aviso(s) detectado(s):\n\n${warnings.map(w => `• ${w.message}`).join("\n")}\n\nDeseja continuar mesmo assim?`
      );
      if (!proceed) return;
    }

    setEnviando(true);
    try {
      const payload = buildPayload();
      const result = await criarPedidoZeiss(payload, codOs, codEmpresa, cpf, paciente);

      // Handle idempotency hit
      if ("idempotencyHit" in result && (result as any).idempotencyHit) {
        const existing = result as any;
        if (existing.numeroPedido) {
          setPedidoConfirmado({ numeroPedido: existing.numeroPedido, voucherGerado: null, estabelecimento: null, status: existing.status });
          toast({ title: "Pedido já enviado", description: `Nº ${existing.numeroPedido}` });
        } else {
          toast({ title: "Pedido já enviado", description: existing.message || "Este pedido já foi processado.", variant: "destructive" });
        }
        return;
      }

      if ("needsApproval" in result && result.needsApproval) {
        setApprovalData(result);
        toast({ title: "Cotação recebida", description: "Revise os preços e confirme o pedido." });
      } else {
        const confirm = result as ZeissConfirmResponse;
        if (!confirm.numeroPedido) {
          toast({ title: "Erro no pedido", description: "A API Zeiss não retornou número de pedido. Verifique os dados e tente novamente.", variant: "destructive" });
          return;
        }
        setPedidoConfirmado(confirm);
        toast({ title: "Pedido confirmado!", description: `Nº ${confirm.numeroPedido}` });

        // Save DE/PARA for future use
        const descricao = os?.lenteOdDescricao || os?.lenteOeDescricao;
        if (descricao && produtoOd) {
          await saveZeissDepara(descricao, produtoOd);
        }
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast({ title: "Erro ao enviar pedido", description: e.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  // ── Confirm approval (step 2) ──
  const handleConfirmApproval = async () => {
    if (!approvalData) return;
    setEnviando(true);
    try {
      const payload = buildPayload(approvalData.aprov);
      const result = await criarPedidoZeiss(payload, codOs, codEmpresa, cpf, paciente);

      if ("numeroPedido" in result) {
        setPedidoConfirmado(result as ZeissConfirmResponse);
        setApprovalData(null);
        toast({ title: "Pedido confirmado!", description: `Nº ${(result as ZeissConfirmResponse).numeroPedido}` });

        const descricao = os?.lenteOdDescricao || os?.lenteOeDescricao;
        if (descricao && produtoOd) {
          await saveZeissDepara(descricao, produtoOd);
        }
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast({ title: "Erro ao confirmar pedido", description: e.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  // ── Cancel order ──
  const handleCancelarPedido = async () => {
    if (!pedidoExistente?.numero_pedido || !pedidoExistente?.estabelecimento) {
      toast({ title: "Dados insuficientes para cancelar", variant: "destructive" });
      return;
    }
    const confirmed = window.confirm(`Tem certeza que deseja cancelar o pedido ${pedidoExistente.numero_pedido}?`);
    if (!confirmed) return;

    setCancelando(true);
    try {
      await cancelarPedidoZeiss(pedidoExistente.numero_pedido, pedidoExistente.estabelecimento);
      toast({ title: "Solicitação de cancelamento enviada", description: `Pedido ${pedidoExistente.numero_pedido}` });
      setPedidoExistente(prev => prev ? { ...prev, status: "CANCELAMENTO_SOLICITADO" } : null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast({ title: "Erro ao cancelar", description: e.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setCancelando(false);
    }
  };

  // ── RxField ──
  function RxField({ label, value, onChange, readOnly }: { label: string; value: string; onChange: (v: string) => void; readOnly?: boolean }) {
    return (
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          className={cn("h-8 text-sm font-mono", readOnly && "bg-muted")}
          readOnly={readOnly}
        />
      </div>
    );
  }

  // ── ERP description info ──
  const erpDescOd = os?.lenteOdDescricao;
  const erpDescOe = os?.lenteOeDescricao;

  // ── Can submit ──
  const canSubmit = !!produtoOd && confirmedProduct && !pedidoExistente?.numero_pedido && !enviando;

  // ============================================
  // RENDER: Confirmed
  // ============================================

  if (pedidoConfirmado) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
          <Card className="border-emerald-300 bg-emerald-500/5">
            <CardContent className="pt-6 text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto" />
              <h2 className="text-xl font-bold">Pedido Zeiss Confirmado!</h2>
              <p className="text-2xl font-mono font-bold text-primary">{pedidoConfirmado.numeroPedido}</p>
              {pedidoConfirmado.voucherGerado && (
                <Badge variant="secondary" className="text-sm">Voucher: {pedidoConfirmado.voucherGerado}</Badge>
              )}
              <div className="flex gap-3 justify-center pt-4">
                <Button variant="outline" onClick={() => navigate("/os")}>Voltar ao Monitor</Button>
                <Button onClick={() => navigate(`/os/tracking-zeiss?pedido=${pedidoConfirmado.numeroPedido}`)}>
                  Ver Tracking
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  }

  // ============================================
  // RENDER: Main Form
  // ============================================

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Package className="h-5 w-5" /> Pedido Zeiss — OS {codOs}
            </h1>
            <p className="text-sm text-muted-foreground">MaisZeiss • {os?.empresa || `Empresa ${codEmpresa}`}</p>
          </div>
          {autoFillSource && (
            <Badge variant="outline" className={cn("gap-1.5 text-xs", autoFillLabel(autoFillSource)?.color)}>
              {autoFillLabel(autoFillSource)?.icon}
              {autoFillLabel(autoFillSource)?.text}
            </Badge>
          )}
        </div>

        {/* Existing order warning */}
        {pedidoExistente?.numero_pedido && (
          <Alert className="border-amber-300 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>
                Já existe pedido Zeiss para esta OS: <strong>{pedidoExistente.numero_pedido}</strong> ({pedidoExistente.status})
              </span>
              {pedidoExistente.estabelecimento && pedidoExistente.status !== "CANCELAMENTO_SOLICITADO" && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={handleCancelarPedido}
                  disabled={cancelando}
                >
                  {cancelando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                  Cancelar Pedido
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {loadingOs ? (
          <div className="flex items-center justify-center py-12 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-muted-foreground">Carregando OS...</span>
          </div>
        ) : (
          <>
            {/* ── Approval step (single confirmation) ── */}
            {approvalData && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DollarSign className="h-5 w-5" /> Resumo de Custos — Laboratório
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Valores retornados pela Zeiss. Revise e aprove com um único clique.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Cost table */}
                  <div className="rounded-lg border border-border/60 bg-background overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/40 bg-muted/40">
                          <th className="text-left px-4 py-2 text-[10px] uppercase font-semibold text-muted-foreground">Item</th>
                          <th className="text-right px-4 py-2 text-[10px] uppercase font-semibold text-muted-foreground">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {approvalData.aprov.precood && (
                          <tr className="border-b border-border/20">
                            <td className="px-4 py-2 text-muted-foreground">Lente OD</td>
                            <td className="px-4 py-2 text-right font-mono font-medium">R$ {approvalData.aprov.precood}</td>
                          </tr>
                        )}
                        {approvalData.aprov.precooe && (
                          <tr className="border-b border-border/20">
                            <td className="px-4 py-2 text-muted-foreground">Lente OE</td>
                            <td className="px-4 py-2 text-right font-mono font-medium">R$ {approvalData.aprov.precooe}</td>
                          </tr>
                        )}
                        {approvalData.aprov.precoserv && (
                          <tr className="border-b border-border/20">
                            <td className="px-4 py-2 text-muted-foreground">Serviços / Tratamentos</td>
                            <td className="px-4 py-2 text-right font-mono font-medium">R$ {approvalData.aprov.precoserv}</td>
                          </tr>
                        )}
                        {approvalData.precos.filter(p => !["od","oe"].includes(p.c?.toLowerCase?.())).map((p, i) => (
                          <tr key={i} className="border-b border-border/20">
                            <td className="px-4 py-2 text-muted-foreground">{p.n}</td>
                            <td className="px-4 py-2 text-right font-mono font-medium">R$ {p.p}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        {(() => {
                          const parseVal = (v?: string) => {
                            if (!v) return 0;
                            return parseFloat(String(v).replace(",", ".").replace(/[^\d.]/g, "")) || 0;
                          };
                          const total = parseVal(approvalData.aprov.precood) + parseVal(approvalData.aprov.precooe) + parseVal(approvalData.aprov.precoserv);
                          if (total <= 0) return null;
                          return (
                            <tr className="bg-muted/30">
                              <td className="px-4 py-2.5 font-semibold">Total Laboratório</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-lg text-primary">R$ {total.toFixed(2)}</td>
                            </tr>
                          );
                        })()}
                      </tfoot>
                    </table>
                  </div>

                  {/* Alerts section */}
                  {approvalData.antecDescricao && (
                    <Alert><AlertDescription className="text-sm">
                      <strong>Análise Técnica:</strong> {approvalData.antecDescricao}
                    </AlertDescription></Alert>
                  )}
                  {approvalData.campanhas?.length > 0 && (
                    <div className="text-sm">
                      <strong>Campanhas:</strong> {approvalData.campanhas.map(c => c.n).join(", ")}
                    </div>
                  )}
                  {approvalData.mesmaReceita?.length > 0 && (
                    <Alert className="border-amber-300 bg-amber-500/10">
                      <AlertDescription className="text-sm">
                        <strong>Mesma Receita:</strong> Pedidos anteriores encontrados — {approvalData.mesmaReceita.map(r => r.np).join(", ")}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Single approval action */}
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
                    <Button variant="outline" onClick={() => setApprovalData(null)}>Voltar e Editar</Button>
                    <Button size="lg" onClick={handleConfirmApproval} disabled={enviando} className="gap-2 px-6">
                      {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Aprovar e Confirmar Pedido
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── ERP Info (read-only) ── */}
            {(erpDescOd || erpDescOe) && (
              <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Descrição no ERP</p>
                {erpDescOd && <p className="text-sm font-mono"><span className="text-muted-foreground mr-2">OD:</span>{erpDescOd}</p>}
                {erpDescOe && erpDescOe !== erpDescOd && <p className="text-sm font-mono"><span className="text-muted-foreground mr-2">OE:</span>{erpDescOe}</p>}
              </div>
            )}

            {/* ── Product Selection (Intelligent) ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4" /> Produto Zeiss
                  {loadingProdutos && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Selected product display */}
                {produtoOd && (
                  <div className={cn(
                    "rounded-lg border-2 p-3 transition-colors",
                    confirmedProduct ? "border-emerald-400 bg-emerald-500/5" : "border-primary/40 bg-primary/5"
                  )}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="font-mono text-xs">{produtoOd.cod}</Badge>
                          {produtoOd.cat && <Badge variant="secondary" className="text-xs">{produtoOd.cat}</Badge>}
                          {autoFillSource && autoFillSource !== "manual" && matchResult?.bestMatch && (
                            <Badge variant="outline" className={cn("text-xs gap-1", zeissScoreLabel(matchResult.bestMatch.score).color)}>
                              {zeissScoreLabel(matchResult.bestMatch.score).text}
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium mt-1">{produtoOd.nome}</p>
                        {produtoOd.descr && <p className="text-xs text-muted-foreground">{produtoOd.descr}</p>}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {!confirmedProduct && (
                          <Button size="sm" variant="default" className="gap-1.5 h-8" onClick={() => setConfirmedProduct(true)}>
                            <Check className="h-3.5 w-3.5" /> Confirmar
                          </Button>
                        )}
                        {confirmedProduct && (
                          <Badge className="bg-emerald-600 text-white gap-1 h-8 px-3">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Confirmado
                          </Badge>
                        )}
                        <Button
                          size="sm" variant="ghost" className="h-8"
                          onClick={() => {
                            setProdutoOd(null); setProdutoOe(null);
                            setConfirmedProduct(false); setAutoFillSource(null);
                            setShowManualSearch(true);
                            setSelectedServicos([]); setSelectedCor("none");
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Match details (expandable) */}
                    {matchResult?.bestMatch && autoFillSource === "match" && (
                      <button
                        onClick={() => setShowMatchCandidates(!showMatchCandidates)}
                        className="flex items-center gap-1 text-xs text-muted-foreground mt-2 hover:text-foreground transition-colors"
                      >
                        {showMatchCandidates ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {matchResult.candidates.length} candidato(s)
                      </button>
                    )}
                  </div>
                )}

                {/* Match candidates list */}
                {showMatchCandidates && matchResult && matchResult.candidates.length > 1 && (
                  <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                    {matchResult.candidates.slice(1, 6).map((c, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectProduct(c.produto, "match")}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                      >
                        <Badge variant="outline" className={cn("text-[10px] shrink-0", zeissScoreLabel(c.score).color)}>
                          {c.score}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-xs text-muted-foreground mr-1">{c.produto.cod}</span>
                          <span className="font-medium">{c.produto.nome}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* No match / manual search */}
                {(!produtoOd || showManualSearch) && (
                  <>
                    {!produtoOd && matchResult && matchResult.candidates.length === 0 && !loadingProdutos && (
                      <Alert className="border-amber-300 bg-amber-500/10">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          Nenhum match encontrado automaticamente. Selecione manualmente abaixo.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={buscaProduto}
                        onChange={e => setBuscaProduto(e.target.value)}
                        placeholder="Buscar produto por nome ou código..."
                        className="pl-9 h-9"
                        autoFocus={showManualSearch}
                      />
                    </div>
                    {loadingProdutos ? (
                      <div className="flex items-center gap-2 py-4 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo...
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                        {filteredProdutos.map(p => (
                          <button
                            key={p.cod}
                            onClick={() => handleSelectProduct(p, "manual")}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                          >
                            <span className="font-mono text-xs text-muted-foreground mr-2">{p.cod}</span>
                            <span className="font-medium">{p.nome}</span>
                            {p.cat && <Badge variant="secondary" className="text-[10px] ml-2">{p.cat}</Badge>}
                            {p.descr && <span className="text-xs text-muted-foreground ml-2">— {p.descr}</span>}
                          </button>
                        ))}
                        {filteredProdutos.length === 0 && (
                          <p className="text-sm text-muted-foreground p-3">Nenhum produto encontrado</p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Show manual search button when product is confirmed */}
                {produtoOd && !showManualSearch && (
                  <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={() => setShowManualSearch(true)}>
                    <Search className="h-3 w-3" /> Trocar produto manualmente
                  </Button>
                )}

                {/* Same product toggle */}
                {produtoOd && (
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useSameProduct}
                      onChange={e => {
                        setUseSameProduct(e.target.checked);
                        if (e.target.checked) setProdutoOe(produtoOd);
                      }}
                      className="rounded"
                      id="same-product"
                    />
                    <label htmlFor="same-product" className="text-muted-foreground cursor-pointer">
                      Mesmo produto para OD e OE
                    </label>
                  </div>
                )}

                {/* OE product selection (when different) */}
                {!useSameProduct && produtoOd && (
                  <div className="pl-4 border-l-2 border-border space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Produto OE</Label>
                    {produtoOe ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">{produtoOe.cod}</Badge>
                        <span className="text-sm">{produtoOe.nome}</span>
                        <Button variant="ghost" size="sm" className="h-6" onClick={() => setProdutoOe(null)}>
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Buscar produto OE..."
                          className="pl-8 h-8 text-sm"
                          onChange={e => {
                            const q = e.target.value.toLowerCase();
                            if (q.length >= 2) {
                              const found = produtos.find(p =>
                                p.nome?.toLowerCase().includes(q) || p.cod?.includes(q)
                              );
                              if (found) setProdutoOe(found);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Services & Colors ── */}
            <ZeissServicosSection
              familia={familia}
              codEmpresa={codEmpresa}
              selectedServicos={selectedServicos}
              onServicosChange={setSelectedServicos}
              selectedCor={selectedCor}
              onCorChange={setSelectedCor}
            />

            {/* ── Patient & Doctor ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" /> Paciente & Médico</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">OS</Label>
                    <Input value={osNumero} onChange={e => setOsNumero(e.target.value)} className="h-8 text-sm font-mono bg-muted" readOnly />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Paciente</Label>
                    <Input value={paciente} onChange={e => setPaciente(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">CPF</Label>
                    <Input value={cpf} onChange={e => setCpf(e.target.value)} className="h-8 text-sm font-mono" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Voucher</Label>
                    <Input value={voucher} onChange={e => setVoucher(e.target.value)} className="h-8 text-sm font-mono" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Médico</Label>
                    <Input value={medico} onChange={e => setMedico(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">CRM</Label>
                    <Input value={crm} onChange={e => setCrm(e.target.value)} className="h-8 text-sm font-mono" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] uppercase text-muted-foreground">Observação</Label>
                    <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Prescription ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Glasses className="h-4 w-4" /> Prescrição
                    {prescAutoFilled && !confirmedPrescription && (
                      <Badge variant="outline" className="text-xs text-amber-600 bg-amber-500/10 border-amber-300 gap-1">
                        <AlertTriangle className="h-3 w-3" /> Revisar
                      </Badge>
                    )}
                    {confirmedPrescription && (
                      <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                        <CheckCircle2 className="h-3 w-3" /> OK
                      </Badge>
                    )}
                  </CardTitle>
                  {prescAutoFilled && !confirmedPrescription && (
                    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setConfirmedPrescription(true)}>
                      <Check className="h-3 w-3" /> Confirmar Rx
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Olho Direito (OD)</p>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                  <RxField label="Esf" value={prescOd.esferico} onChange={v => setPrescOd(p => ({ ...p, esferico: v }))} />
                  <RxField label="Cil" value={prescOd.cilindrico} onChange={v => setPrescOd(p => ({ ...p, cilindrico: v }))} />
                  <RxField label="Eixo" value={prescOd.eixo} onChange={v => setPrescOd(p => ({ ...p, eixo: v }))} />
                  <RxField label="Adição" value={prescOd.adicao} onChange={v => setPrescOd(p => ({ ...p, adicao: v }))} />
                  <RxField label="DNP" value={prescOd.dnp} onChange={v => setPrescOd(p => ({ ...p, dnp: v }))} />
                  <RxField label="Altura" value={prescOd.alturaMontagem} onChange={v => setPrescOd(p => ({ ...p, alturaMontagem: v }))} />
                  <RxField label="Prisma" value={prescOd.prisma} onChange={v => setPrescOd(p => ({ ...p, prisma: v }))} />
                  <RxField label="Eixo Pr" value={prescOd.eixoPrisma} onChange={v => setPrescOd(p => ({ ...p, eixoPrisma: v }))} />
                </div>

                {/* Sugestão de base OD */}
                <ZeissSugestaoBase
                  familia={familia}
                  codEmpresa={codEmpresa}
                  esferico={prescOd.esferico}
                  cilindrico={prescOd.cilindrico}
                  adicao={prescOd.adicao}
                  onSugestao={handleSugestaoBase}
                />

                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase">Olho Esquerdo (OE)</p>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                  <RxField label="Esf" value={prescOe.esferico} onChange={v => setPrescOe(p => ({ ...p, esferico: v }))} />
                  <RxField label="Cil" value={prescOe.cilindrico} onChange={v => setPrescOe(p => ({ ...p, cilindrico: v }))} />
                  <RxField label="Eixo" value={prescOe.eixo} onChange={v => setPrescOe(p => ({ ...p, eixo: v }))} />
                  <RxField label="Adição" value={prescOe.adicao} onChange={v => setPrescOe(p => ({ ...p, adicao: v }))} />
                  <RxField label="DNP" value={prescOe.dnp} onChange={v => setPrescOe(p => ({ ...p, dnp: v }))} />
                  <RxField label="Altura" value={prescOe.alturaMontagem} onChange={v => setPrescOe(p => ({ ...p, alturaMontagem: v }))} />
                  <RxField label="Prisma" value={prescOe.prisma} onChange={v => setPrescOe(p => ({ ...p, prisma: v }))} />
                  <RxField label="Eixo Pr" value={prescOe.eixoPrisma} onChange={v => setPrescOe(p => ({ ...p, eixoPrisma: v }))} />
                </div>
              </CardContent>
            </Card>

            {/* ── Frame ── */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Armação</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Modelo</Label>
                    <Input value={armacao.modelo} onChange={e => setArmacao(a => ({ ...a, modelo: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Ponte</Label>
                    <Input value={armacao.ponte} onChange={e => setArmacao(a => ({ ...a, ponte: e.target.value }))} className="h-8 text-sm font-mono" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Altura</Label>
                    <Input value={armacao.altura} onChange={e => setArmacao(a => ({ ...a, altura: e.target.value }))} className="h-8 text-sm font-mono" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Largura</Label>
                    <Input value={armacao.largura} onChange={e => setArmacao(a => ({ ...a, largura: e.target.value }))} className="h-8 text-sm font-mono" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Diag. Maior</Label>
                    <Input value={armacao.diagonalMaior} onChange={e => setArmacao(a => ({ ...a, diagonalMaior: e.target.value }))} className="h-8 text-sm font-mono" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Tipo</Label>
                    <Select value={armacao.tipo} onValueChange={v => setArmacao(a => ({ ...a, tipo: v }))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TIPO_ARMACAO_ZEISS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{k} — {v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Formato Aro</Label>
                    <Input value={armacao.formatoAro} onChange={e => setArmacao(a => ({ ...a, formatoAro: e.target.value }))} className="h-8 text-sm font-mono" placeholder="ex: 1AB" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Validation errors ── */}
            {showValidation && <ZeissValidationPanel errors={validationErrors} />}


            {/* ── Submit ── */}
            {!approvalData && (
              <div className="flex items-center justify-between gap-3 pt-2">
                <div className="text-xs text-muted-foreground">
                  {!produtoOd && "Selecione um produto para continuar"}
                  {produtoOd && !confirmedProduct && "Confirme o produto selecionado"}
                  {produtoOd && confirmedProduct && selectedServicos.length > 0 && (
                    <span>{selectedServicos.length} serviço(s) selecionado(s)</span>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
                  <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar para Zeiss
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
};

export default PedidoZeissPage;
