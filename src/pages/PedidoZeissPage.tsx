// src/pages/PedidoZeissPage.tsx
// Tela de criação de pedido Zeiss (MaisZeiss) — fluxo dois passos (cotação + confirmação)

import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { OsHubRecord, fetchSingleOsRecipe } from "@/services/osHubService";
import {
  ZeissProduto,
  ZeissPedidoPayload,
  ZeissApprovalResponse,
  ZeissConfirmResponse,
  ZeissPrecoItem,
  listarProdutosZeiss,
  criarPedidoZeiss,
} from "@/services/zeissService";
import { resolverPrescricaoCompleta } from "@/utils/prescricaoResolver";
import { supabase } from "@/integrations/supabase/client";
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
import {
  ArrowLeft, Send, Eye, Glasses, Package, Loader2, Check, AlertTriangle,
  Search, ShieldCheck, CheckCircle2, DollarSign,
} from "lucide-react";

// ============================================
// HELPERS
// ============================================

function formatGrau(v: number | null): string {
  if (v === null || v === undefined) return "";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const TIPO_ARMACAO_ZEISS: Record<string, string> = {
  M: "Metal", A: "Acetato", F: "Fio de Nylon", P: "Parafuso", C: "Fio de Aço", S: "Segurança",
};

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

  // State
  const [os, setOs] = useState<OsHubRecord | null>(null);
  const [loadingOs, setLoadingOs] = useState(true);
  const [produtos, setProdutos] = useState<ZeissProduto[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(false);
  const [produtoOd, setProdutoOd] = useState("");
  const [produtoOe, setProdutoOe] = useState("");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Two-step flow
  const [approvalData, setApprovalData] = useState<ZeissApprovalResponse | null>(null);
  const [pedidoConfirmado, setPedidoConfirmado] = useState<ZeissConfirmResponse | null>(null);
  const [pedidoExistente, setPedidoExistente] = useState<{ numero_pedido: string | null; status: string } | null>(null);

  // Prescrição editável
  const [prescOd, setPrescOd] = useState({
    esferico: "", cilindrico: "", eixo: "", adicao: "", dnp: "", alturaMontagem: "",
    prisma: "", eixoPrisma: "",
  });
  const [prescOe, setPrescOe] = useState({
    esferico: "", cilindrico: "", eixo: "", adicao: "", dnp: "", alturaMontagem: "",
    prisma: "", eixoPrisma: "",
  });

  // Armação
  const [armacao, setArmacao] = useState({
    modelo: "", ponte: "", altura: "", largura: "", tipo: "M", formatoAro: "",
  });

  // Patient/order
  const [osNumero, setOsNumero] = useState("");
  const [paciente, setPaciente] = useState("");
  const [cpf, setCpf] = useState("");
  const [medico, setMedico] = useState("");
  const [crm, setCrm] = useState("");
  const [voucher, setVoucher] = useState("");
  const [observacao, setObservacao] = useState("");

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
          setArmacao({
            modelo: found.referenciaArmacao || "",
            ponte: found.ponte != null ? String(found.ponte) : "",
            altura: found.aaVertical != null ? String(found.aaVertical) : "",
            largura: found.caHorizontal != null ? String(found.caHorizontal) : found.ta != null ? String(found.ta) : "",
            tipo: "M",
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
            if (vData?.voucher) setVoucher(vData.voucher);
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
        .select("numero_pedido, status")
        .eq("cod_os", codOs)
        .eq("fornecedor", "ZEISS")
        .order("created_at", { ascending: false });
      if (rows && rows.length > 0) {
        const confirmado = rows.find(r => r.numero_pedido);
        if (confirmado) {
          setPedidoExistente({ numero_pedido: confirmado.numero_pedido, status: confirmado.status || "" });
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

  // Filter products
  const filteredProdutos = useMemo(() => {
    if (!buscaProduto.trim()) return produtos.slice(0, 50);
    const q = buscaProduto.toLowerCase();
    return produtos.filter(p =>
      p.nome?.toLowerCase().includes(q) || p.descr?.toLowerCase().includes(q) || p.cod?.includes(q)
    ).slice(0, 50);
  }, [produtos, buscaProduto]);

  // ── Build payload ──
  function buildPayload(aprov?: ZeissApprovalResponse["aprov"]): ZeissPedidoPayload {
    const payload: ZeissPedidoPayload = {
      oscliente: osNumero,
      paciente,
      cpfpaciente: cpf.replace(/[.\-]/g, ""),
      medico,
      crm,
      voucher: voucher || "",
      observacao: observacao ? [observacao] : [],
    };

    if (produtoOd || prescOd.esferico) {
      payload.od = {
        produto: produtoOd,
        esferico: prescOd.esferico,
        cilindrico: prescOd.cilindrico,
        eixocilindrico: prescOd.eixo,
        adicao: prescOd.adicao,
        dnp: prescOd.dnp,
        alturamontagem: prescOd.alturaMontagem,
        prisma: prescOd.prisma,
        eixoprisma: prescOd.eixoPrisma,
      };
    }

    if (produtoOe || prescOe.esferico) {
      payload.oe = {
        produto: produtoOe || produtoOd, // fallback to same product
        esferico: prescOe.esferico,
        cilindrico: prescOe.cilindrico,
        eixocilindrico: prescOe.eixo,
        adicao: prescOe.adicao,
        dnp: prescOe.dnp,
        alturamontagem: prescOe.alturaMontagem,
        prisma: prescOe.prisma,
        eixoprisma: prescOe.eixoPrisma,
      };
    }

    if (armacao.ponte || armacao.altura || armacao.largura) {
      payload.armacao = {
        modelo: armacao.modelo,
        ponte: armacao.ponte,
        altura: armacao.altura,
        largura: armacao.largura,
        tipo: armacao.tipo,
        formatoaro: armacao.formatoAro,
      };
    }

    if (aprov) {
      payload.aprov = aprov;
    }

    return payload;
  }

  // ── Submit ──
  const handleSubmit = async () => {
    if (!produtoOd) {
      toast({ title: "Selecione o produto OD", variant: "destructive" });
      return;
    }

    setEnviando(true);
    try {
      const payload = buildPayload();
      const result = await criarPedidoZeiss(payload, codOs, codEmpresa, cpf, paciente);

      if ("needsApproval" in result && result.needsApproval) {
        setApprovalData(result);
        toast({ title: "Cotação recebida", description: "Revise os preços e confirme o pedido." });
      } else {
        const confirm = result as ZeissConfirmResponse;
        setPedidoConfirmado(confirm);
        toast({ title: "Pedido confirmado!", description: `Nº ${confirm.numeroPedido}` });
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
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast({ title: "Erro ao confirmar pedido", description: e.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  // ── Rx field helper ──
  function RxField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
        <Input value={value} onChange={e => onChange(e.target.value)} className="h-8 text-sm font-mono" />
      </div>
    );
  }

  // ── RENDER ──

  if (pedidoConfirmado) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
          <Card className="border-success-muted bg-success-soft/30">
            <CardContent className="pt-6 text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 text-success mx-auto" />
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

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Package className="h-5 w-5" /> Pedido Zeiss — OS {codOs}
            </h1>
            <p className="text-sm text-muted-foreground">MaisZeiss • {os?.empresa || `Empresa ${codEmpresa}`}</p>
          </div>
        </div>

        {/* Existing order warning */}
        {pedidoExistente?.numero_pedido && (
          <Alert className="border-warning-muted bg-warning-soft">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Já existe pedido Zeiss para esta OS: <strong>{pedidoExistente.numero_pedido}</strong> ({pedidoExistente.status})
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
            {/* ── Approval step ── */}
            {approvalData && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DollarSign className="h-5 w-5" /> Aprovação de Preços
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    A Zeiss retornou a cotação abaixo. Confirme para gravar o pedido.
                  </p>
                  {approvalData.precos.length > 0 && (
                    <div className="space-y-1">
                      {approvalData.precos.map((p, i) => (
                        <div key={i} className="flex justify-between text-sm py-1 border-b border-border/40">
                          <span className="text-muted-foreground">{p.n}</span>
                          <span className="font-mono font-medium">R$ {p.p}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {approvalData.antecDescricao && (
                    <Alert>
                      <AlertDescription className="text-sm">
                        <strong>Análise Técnica:</strong> {approvalData.antecDescricao}
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setApprovalData(null)}>Cancelar</Button>
                    <Button onClick={handleConfirmApproval} disabled={enviando} className="gap-2">
                      {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Confirmar Pedido
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Patient & Doctor ── */}
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" /> Paciente & Médico</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">OS</Label>
                    <Input value={osNumero} onChange={e => setOsNumero(e.target.value)} className="h-8 text-sm font-mono" />
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

            {/* ── Product Selection ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Produto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={buscaProduto}
                    onChange={e => setBuscaProduto(e.target.value)}
                    placeholder="Buscar produto por nome ou código..."
                    className="pl-9 h-9"
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
                        onClick={() => { setProdutoOd(p.cod); if (!produtoOe) setProdutoOe(p.cod); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${produtoOd === p.cod ? "bg-brand-soft border-l-2 border-primary" : ""}`}
                      >
                        <span className="font-mono text-xs text-muted-foreground mr-2">{p.cod}</span>
                        <span className="font-medium">{p.nome}</span>
                        {p.descr && <span className="text-xs text-muted-foreground ml-2">— {p.descr}</span>}
                      </button>
                    ))}
                    {filteredProdutos.length === 0 && (
                      <p className="text-sm text-muted-foreground p-3">Nenhum produto encontrado</p>
                    )}
                  </div>
                )}
                {produtoOd && (
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label className="text-[10px] uppercase">Produto OD</Label>
                      <Input value={produtoOd} onChange={e => setProdutoOd(e.target.value)} className="h-8 text-sm font-mono" />
                    </div>
                    <div className="flex-1">
                      <Label className="text-[10px] uppercase">Produto OE</Label>
                      <Input value={produtoOe} onChange={e => setProdutoOe(e.target.value)} className="h-8 text-sm font-mono" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Prescription ── */}
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Glasses className="h-4 w-4" /> Prescrição</CardTitle></CardHeader>
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
              <CardHeader><CardTitle className="text-sm">Armação</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
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

            {/* ── Submit ── */}
            {!approvalData && (
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={enviando || !produtoOd || !!pedidoExistente?.numero_pedido}
                  className="gap-2"
                >
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar para Zeiss
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
};

export default PedidoZeissPage;
