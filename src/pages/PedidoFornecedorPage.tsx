// src/pages/PedidoFornecedorPage.tsx
// Tela de criação de pedido para fornecedor (Hoya) — com matching inteligente + validação + auditoria

import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { OsHubRecord, fetchSingleOsRecipe } from "@/services/osHubService";
import {
  HoyaProduto,
  HoyaPedidoPayload,
  HoyaPedidoResponse,
  listarProdutosHoya,
  criarPedidoHoya,
} from "@/services/hoyaService";
import {
  matchProducts,
  MatchGroup,
  MatchResult,
  findExactProduct,
  ParsedLensDescription,
} from "@/services/hoyaMatchingService";
import {
  validateHoyaPayload,
  mapPrismasFromOs,
  ValidationResult,
} from "@/services/hoyaValidationService";
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
  ArrowLeft,
  Send,
  Eye,
  Glasses,
  Package,
  Loader2,
  Check,
  AlertTriangle,
  Search,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Zap,
  ShieldCheck,
  XCircle,
} from "lucide-react";

// ============================================
// HELPERS
// ============================================

function formatGrau(v: number | null): string {
  if (v === null || v === undefined) return "";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

function scoreLabel(score: number): { text: string; color: string } {
  if (score >= 60) return { text: "Alta", color: "text-emerald-600 bg-emerald-500/15 border-emerald-300" };
  if (score >= 35) return { text: "Média", color: "text-amber-600 bg-amber-500/15 border-amber-300" };
  return { text: "Baixa", color: "text-red-600 bg-red-500/15 border-red-300" };
}

// ============================================
// COMPONENT
// ============================================

const PedidoFornecedorPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const codOs = Number(searchParams.get("codOs")) || 0;
  const codEmpresa = Number(searchParams.get("codEmpresa")) || 0;

  const [os, setOs] = useState<OsHubRecord | null>(null);
  const [loadingOs, setLoadingOs] = useState(true);
  const [produtos, setProdutos] = useState<HoyaProduto[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState<HoyaProduto | null>(null);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviandoCooldown, setEnviandoCooldown] = useState(false);
  const [pedidoEnviado, setPedidoEnviado] = useState<HoyaPedidoResponse | null>(null);
  const [showManualSearch, setShowManualSearch] = useState(false);

  // Matching state
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<MatchGroup | null>(null);
  const [selectedAltura, setSelectedAltura] = useState<string>("");
  const [selectedTratamento, setSelectedTratamento] = useState<string>("");
  const [selectedFotossensivel, setSelectedFotossensivel] = useState<string>("none");
  const [selectedColoracao, setSelectedColoracao] = useState<string>("none");
  const [isCor, setIsCor] = useState(false);

  // Form state
  const [tipoServico, setTipoServico] = useState(4);
  const [tipoArmacao, setTipoArmacao] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [usuarioFinal, setUsuarioFinal] = useState("");

  // Prescrição editável
  const [prescOd, setPrescOd] = useState({
    esferico: "", cilindrico: "", eixo: "", adicao: "", dnpLonge: "", alturaPupilar: "",
    prismaH: "", basePrismaH: "", prismaV: "", basePrismaV: "",
  });
  const [prescOe, setPrescOe] = useState({
    esferico: "", cilindrico: "", eixo: "", adicao: "", dnpLonge: "", alturaPupilar: "",
    prismaH: "", basePrismaH: "", prismaV: "", basePrismaV: "",
  });

  // Armação editável
  const [armacao, setArmacao] = useState({
    larguraLente: "", alturaLente: "", ponteLente: "",
  });

  // Validation state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // ---- Load OS data ----
  useEffect(() => {
    if (!codOs) return;
    (async () => {
      setLoadingOs(true);
      try {
        const found = await fetchSingleOsRecipe(codOs, codEmpresa);
        if (found) {
          setOs(found);
          // Map prismas from OS
          const prismas = mapPrismasFromOs(found);
          setPrescOd({
            esferico: found.odLongeEsf != null ? String(found.odLongeEsf) : "",
            cilindrico: found.odLongeCil != null ? String(found.odLongeCil) : "",
            eixo: found.odLongeEixo != null ? String(found.odLongeEixo) : "",
            adicao: found.odAdicao != null ? String(found.odAdicao) : "",
            dnpLonge: found.odDnp != null ? String(found.odDnp) : "",
            alturaPupilar: found.odAltura != null ? String(found.odAltura) : "",
            prismaH: prismas.odPrismaH != null ? String(prismas.odPrismaH) : "",
            basePrismaH: prismas.odBasePRPrismaH || "",
            prismaV: prismas.odPrismaV != null ? String(prismas.odPrismaV) : "",
            basePrismaV: prismas.odBasePRPrismaV || "",
          });
          setPrescOe({
            esferico: found.oeLongeEsf != null ? String(found.oeLongeEsf) : "",
            cilindrico: found.oeLongeCil != null ? String(found.oeLongeCil) : "",
            eixo: found.oeLongeEixo != null ? String(found.oeLongeEixo) : "",
            adicao: found.oeAdicao != null ? String(found.oeAdicao) : "",
            dnpLonge: found.oeDnp != null ? String(found.oeDnp) : "",
            alturaPupilar: found.oeAltura != null ? String(found.oeAltura) : "",
            prismaH: prismas.oePrismaH != null ? String(prismas.oePrismaH) : "",
            basePrismaH: prismas.oeBasePRPrismaH || "",
            prismaV: prismas.oePrismaV != null ? String(prismas.oePrismaV) : "",
            basePrismaV: prismas.oeBasePRPrismaV || "",
          });
          setArmacao({
            larguraLente: found.caHorizontal != null ? String(found.caHorizontal) : "",
            alturaLente: found.aaVertical != null ? String(found.aaVertical) : "",
            ponteLente: found.ponte != null ? String(found.ponte) : "",
          });
          setUsuarioFinal(found.cliente || "");
        }
      } catch (err) {
        console.error("[PedidoFornecedor] Error loading OS:", err);
        toast({ title: "Erro ao carregar OS", variant: "destructive" });
      } finally {
        setLoadingOs(false);
      }
    })();
  }, [codOs, codEmpresa]);

  // ---- Auto-load Hoya products on mount ----
  useEffect(() => {
    (async () => {
      setLoadingProdutos(true);
      try {
        const prods = await listarProdutosHoya();
        setProdutos(Array.isArray(prods) ? prods : []);
      } catch (err) {
        console.error("[PedidoFornecedor] Error loading products:", err);
        toast({
          title: "Erro ao carregar catálogo Hoya",
          description: err instanceof Error ? err.message : "Verifique a API Key.",
          variant: "destructive",
        });
      } finally {
        setLoadingProdutos(false);
      }
    })();
  }, []);

  // ---- Run matching when OS + catalog are ready ----
  useEffect(() => {
    if (!os || produtos.length === 0) return;
    const descricao = os.lenteOdDescricao || os.lenteOeDescricao;
    if (!descricao) return;

    // First check DE/PARA
    (async () => {
      const { data: depara } = await supabase
        .from("fornecedor_produto_depara")
        .select("*")
        .eq("fornecedor", "HOYA")
        .eq("descricao_local", descricao)
        .maybeSingle();

      if (depara?.codigo_fornecedor) {
        const match = produtos.find(p => p.codigoProduto === depara.codigo_fornecedor);
        if (match) {
          setProdutoSelecionado(match);
          toast({ title: "Produto encontrado via DE/PARA", description: match.nome });
          return;
        }
      }

      // Run intelligent matching
      const result = matchProducts(produtos, descricao, {
        esfericoOd: os.odLongeEsf,
        esfericoOe: os.oeLongeEsf,
        cilindricoOd: os.odLongeCil,
        cilindricoOe: os.oeLongeCil,
        adicaoOd: os.odAdicao,
        adicaoOe: os.oeAdicao,
      });
      setMatchResult(result);

      if (result.bestGroup) {
        setSelectedGroup(result.bestGroup);
        // Pre-select based on parsed data
        if (result.parsed.tratamento) {
          const matchTrat = result.bestGroup.tratamentosDisponiveis.find(t =>
            t.tratamento.toLowerCase().includes(result.parsed.tratamento!.toLowerCase())
          );
          if (matchTrat) {
            setSelectedTratamento(`${matchTrat.codigoTratamento}_${matchTrat.temCor}`);
            setIsCor(matchTrat.temCor);
          }
        }
        if (result.parsed.isFotossensivel && result.bestGroup.fotossensiveisDisponiveis.length > 0) {
          setSelectedFotossensivel(String(result.bestGroup.fotossensiveisDisponiveis[0].codigoFotossensivel));
        }
        toast({
          title: "Match inteligente realizado",
          description: `${result.groups.length} família(s) compatível(is) encontrada(s)`,
        });
      }
    })();
  }, [os, produtos]);

  // ---- Resolve exact product from selections ----
  useEffect(() => {
    if (!selectedGroup || !selectedTratamento) return;
    const [tratCod, tratCor] = selectedTratamento.split("_");
    const codTrat = Number(tratCod);
    const corFlag = tratCor === "true";

    const codAltura = selectedAltura ? Number(selectedAltura) : null;
    const codFoto = selectedFotossensivel !== "none" ? Number(selectedFotossensivel) : null;

    const exact = findExactProduct(
      selectedGroup.produtos,
      selectedGroup.codigoDesenho,
      selectedGroup.codigoMaterial,
      codAltura,
      codTrat,
      codFoto,
      corFlag
    );
    setProdutoSelecionado(exact);
  }, [selectedGroup, selectedAltura, selectedTratamento, selectedFotossensivel]);

  // ---- Available colorações for selected product ----
  const coloracoesDisponiveis = useMemo(() => {
    if (!produtoSelecionado?.coloracoes) return [];
    return produtoSelecionado.coloracoes;
  }, [produtoSelecionado]);

  // ---- Manual search filtered products ----
  const produtosFiltrados = buscaProduto.trim()
    ? produtos.filter(p =>
        p.nome.toLowerCase().includes(buscaProduto.toLowerCase()) ||
        String(p.codigoProduto).includes(buscaProduto)
      )
    : produtos.slice(0, 50);

  // ---- Submit order ----
  const handleEnviarPedido = async () => {
    if (!os || !produtoSelecionado) {
      toast({ title: "Selecione um produto Hoya", variant: "destructive" });
      return;
    }
    if (enviandoCooldown) {
      toast({ title: "Aguarde antes de enviar novamente", variant: "destructive" });
      return;
    }

    const hasPrismaOd = !!(prescOd.prismaH || prescOd.prismaV);
    const hasPrismaOe = !!(prescOe.prismaH || prescOe.prismaV);

    setEnviando(true);
    setEnviandoCooldown(true);
    setTimeout(() => setEnviandoCooldown(false), 3000);
    try {
      const payload: HoyaPedidoPayload = {
        os: String(os.numeroOs || os.codOs),
        observacao: observacao || undefined,
        especificacoes: {
          codigoProduto: produtoSelecionado.codigoProduto,
          tipoServico,
          codigoColoracao: selectedColoracao !== "none" ? selectedColoracao : null,
          codigoDesenho: produtoSelecionado.codigoDesenho,
          codigoAltura: produtoSelecionado.codigoAltura ?? undefined,
          codigoMaterial: produtoSelecionado.codigoMaterial,
          codigoTratamento: produtoSelecionado.codigoTratamento,
          codigoFotossensivel: produtoSelecionado.codigoFotossensivel ?? undefined,
        },
        prescricao: {
          direito: {
            esferico: prescOd.esferico ? Number(prescOd.esferico) : null,
            cilindrico: prescOd.cilindrico ? Number(prescOd.cilindrico) : null,
            eixo: prescOd.eixo ? Number(prescOd.eixo) : null,
            adicao: prescOd.adicao ? Number(prescOd.adicao) : null,
            prismaH: prescOd.prismaH ? Number(prescOd.prismaH) : null,
            basePRPrismaH: prescOd.basePrismaH || null,
            prismaV: prescOd.prismaV ? Number(prescOd.prismaV) : null,
            basePRPrismaV: prescOd.basePrismaV || null,
            dnpLonge: prescOd.dnpLonge ? Number(prescOd.dnpLonge) : null,
            dnpPerto: null,
            alturaPupilar: prescOd.alturaPupilar ? Number(prescOd.alturaPupilar) : null,
          },
          esquerdo: {
            esferico: prescOe.esferico ? Number(prescOe.esferico) : null,
            cilindrico: prescOe.cilindrico ? Number(prescOe.cilindrico) : null,
            eixo: prescOe.eixo ? Number(prescOe.eixo) : null,
            adicao: prescOe.adicao ? Number(prescOe.adicao) : null,
            prismaH: prescOe.prismaH ? Number(prescOe.prismaH) : null,
            basePRPrismaH: prescOe.basePrismaH || null,
            prismaV: prescOe.prismaV ? Number(prescOe.prismaV) : null,
            basePRPrismaV: prescOe.basePrismaV || null,
            dnpLonge: prescOe.dnpLonge ? Number(prescOe.dnpLonge) : null,
            dnpPerto: null,
            alturaPupilar: prescOe.alturaPupilar ? Number(prescOe.alturaPupilar) : null,
          },
          afinamentoPrismatico: hasPrismaOd || hasPrismaOe,
          equilibrioLente: false,
        },
        dadosMedida: {
          larguraLente: armacao.larguraLente ? Number(armacao.larguraLente) : undefined,
          alturaLente: armacao.alturaLente ? Number(armacao.alturaLente) : undefined,
          ponteLente: armacao.ponteLente ? Number(armacao.ponteLente) : undefined,
          distanciaLeitura: null,
        },
        armacao: {
          tipoArmacao,
          comPolimento: false,
        },
        garantia: {
          usuarioFinal: usuarioFinal || os.cliente || "",
          inicialUsuario: "",
        },
      };

      // E4.1: Validate before sending
      const validation = validateHoyaPayload(payload);
      setValidationResult(validation);

      if (!validation.valid) {
        toast({
          title: "Validação falhou",
          description: `${validation.errors.length} campo(s) obrigatório(s) faltando`,
          variant: "destructive",
        });
        setEnviando(false);
        return;
      }

      const resp = await criarPedidoHoya(payload, os.codOs, os.codEmpresa);

      // F4.2: Check idempotency hit
      if ((resp as any).idempotencyHit) {
        toast({
          title: "Pedido já enviado para esta OS",
          description: `Nº ${resp.numeroPedido} — Este pedido já foi registrado anteriormente.`,
        });
        setPedidoEnviado(resp);
        return;
      }

      setPedidoEnviado(resp);

      // Save DE/PARA
      const descricao = os.lenteOdDescricao || os.lenteOeDescricao;
      if (descricao && produtoSelecionado) {
        await supabase.from("fornecedor_produto_depara").upsert(
          {
            fornecedor: "HOYA",
            descricao_local: descricao,
            codigo_fornecedor: produtoSelecionado.codigoProduto,
            nome_fornecedor: produtoSelecionado.nome,
          },
          { onConflict: "fornecedor,descricao_local" }
        );
      }

      toast({
        title: "Pedido enviado com sucesso!",
        description: `Número: ${resp.numeroPedido} — Status: ${resp.status}`,
      });
    } catch (err) {
      console.error("[PedidoFornecedor] Error:", err);
      toast({
        title: "Erro ao enviar pedido",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  // ---- RENDER ----

  if (loadingOs) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando dados da OS...</span>
      </div>
    );
  }

  if (!os) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p>OS não encontrada (codOs: {codOs})</p>
        <Button variant="outline" onClick={() => navigate("/os")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao Monitor
        </Button>
      </div>
    );
  }

  if (pedidoEnviado) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/15">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold">Pedido Enviado!</h2>
        <div className="text-center space-y-2">
          <p className="text-lg">
            Nº Pedido Hoya:{" "}
            <span className="font-mono font-bold text-primary">{pedidoEnviado.numeroPedido}</span>
          </p>
          <p className="text-muted-foreground">Status: {pedidoEnviado.status}</p>
          {pedidoEnviado.voucherGerado && (
            <p className="text-sm text-muted-foreground">Voucher: {pedidoEnviado.voucherGerado}</p>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/os")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao Monitor
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/os")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Pedido Hoya — OS {os.numeroOs || os.codOs}</h1>
              <p className="text-sm text-muted-foreground">{os.cliente}</p>
            </div>
          </div>
          <Badge className="bg-orange-500/15 text-orange-700 border-orange-300">HOYA</Badge>
        </div>

        <Separator />

        {/* Lentes da OS */}
        {(os.lenteOdDescricao || os.lenteOeDescricao) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" /> Lentes da OS (ERP)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {os.lenteOdDescricao && (
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                  <Badge variant="outline" className="bg-blue-500/15 text-blue-700 shrink-0">OD</Badge>
                  <span className="text-sm font-mono">{os.lenteOdDescricao}</span>
                </div>
              )}
              {os.lenteOeDescricao && (
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 shrink-0">OE</Badge>
                  <span className="text-sm font-mono">{os.lenteOeDescricao}</span>
                </div>
              )}
              {matchResult?.parsed && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {matchResult.parsed.desenho && (
                    <Badge variant="secondary" className="text-xs">Desenho: {matchResult.parsed.desenho}</Badge>
                  )}
                  {matchResult.parsed.materialIndex && (
                    <Badge variant="secondary" className="text-xs">Índice: {matchResult.parsed.materialIndex}</Badge>
                  )}
                  {matchResult.parsed.tratamento && (
                    <Badge variant="secondary" className="text-xs">Tratamento: {matchResult.parsed.tratamento}</Badge>
                  )}
                  {matchResult.parsed.isFotossensivel && (
                    <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-700">
                      Sensity {matchResult.parsed.fotossensivelTipo} {matchResult.parsed.fotossensivelCor || ""}
                    </Badge>
                  )}
                  {matchResult.parsed.tipoLente !== "unknown" && (
                    <Badge variant="secondary" className="text-xs">
                      {matchResult.parsed.tipoLente === "progressiva" ? "Progressiva" : "Monofocal"}
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Loading catálogo */}
        {loadingProdutos && (
          <Card>
            <CardContent className="py-8 flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-muted-foreground">Carregando catálogo Hoya...</span>
            </CardContent>
          </Card>
        )}

        {/* Match inteligente */}
        {!loadingProdutos && matchResult && matchResult.groups.length > 0 && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Produto Hoya — Match Inteligente
                </CardTitle>
                <div className="flex items-center gap-2">
                  {selectedGroup && (
                    <Badge variant="outline" className={scoreLabel(selectedGroup.score).color}>
                      Confiança: {scoreLabel(selectedGroup.score).text}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Family/Group selector */}
              <div>
                <Label className="text-[10px] uppercase mb-1 block">Família de Produto</Label>
                <Select
                  value={selectedGroup ? `${selectedGroup.codigoDesenho}_${selectedGroup.codigoMaterial}` : ""}
                  onValueChange={(v) => {
                    const group = matchResult.groups.find(g => `${g.codigoDesenho}_${g.codigoMaterial}` === v);
                    if (group) {
                      setSelectedGroup(group);
                      setSelectedAltura("");
                      setSelectedTratamento("");
                      setSelectedFotossensivel("none");
                      setSelectedColoracao("none");
                      setProdutoSelecionado(null);
                    }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione a família..." />
                  </SelectTrigger>
                  <SelectContent>
                    {matchResult.groups.slice(0, 20).map(g => {
                      const sl = scoreLabel(g.score);
                      return (
                        <SelectItem key={`${g.codigoDesenho}_${g.codigoMaterial}`} value={`${g.codigoDesenho}_${g.codigoMaterial}`}>
                          <span className="flex items-center gap-2">
                            <span>{g.desenho} — {g.material}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${sl.color}`}>{sl.text}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedGroup && selectedGroup.scoreDetails.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedGroup.scoreDetails.map((d, i) => (
                      <span key={i} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{d}</span>
                    ))}
                  </div>
                )}
              </div>

              {selectedGroup && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Altura */}
                  {selectedGroup.alturasDisponiveis.length > 0 && (
                    <div>
                      <Label className="text-[10px] uppercase mb-1 block">
                        Altura <span className="text-destructive">*</span>
                      </Label>
                      <Select value={selectedAltura} onValueChange={setSelectedAltura}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Escolha..." />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedGroup.alturasDisponiveis.map(a => (
                            <SelectItem key={a.codigoAltura} value={String(a.codigoAltura)}>
                              {a.altura}mm
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Tratamento */}
                  <div>
                    <Label className="text-[10px] uppercase mb-1 block">
                      Tratamento <span className="text-destructive">*</span>
                    </Label>
                    <Select value={selectedTratamento} onValueChange={(v) => {
                      setSelectedTratamento(v);
                      const [, cor] = v.split("_");
                      setIsCor(cor === "true");
                      setSelectedColoracao("none");
                    }}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Escolha..." />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedGroup.tratamentosDisponiveis.map(t => (
                          <SelectItem key={`${t.codigoTratamento}_${t.temCor}`} value={`${t.codigoTratamento}_${t.temCor}`}>
                            {t.tratamento}{t.temCor ? " (COR)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Fotossensível */}
                  {selectedGroup.fotossensiveisDisponiveis.length > 0 && (
                    <div>
                      <Label className="text-[10px] uppercase mb-1 block">Fotossensível</Label>
                      <Select value={selectedFotossensivel} onValueChange={setSelectedFotossensivel}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Nenhum" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem fotossensível</SelectItem>
                          {selectedGroup.fotossensiveisDisponiveis.map(f => (
                            <SelectItem key={f.codigoFotossensivel} value={String(f.codigoFotossensivel)}>
                              {f.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Coloração */}
                  {coloracoesDisponiveis.length > 0 && (
                    <div>
                      <Label className="text-[10px] uppercase mb-1 block">Coloração</Label>
                      <Select value={selectedColoracao} onValueChange={setSelectedColoracao}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Nenhuma" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem coloração</SelectItem>
                          {coloracoesDisponiveis.map(c => (
                            <SelectItem key={c.codigo} value={c.codigo}>
                              {c.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Selected product display */}
              {produtoSelecionado && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <p className="font-medium text-sm">{produtoSelecionado.nome}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Código: {produtoSelecionado.codigoProduto}</span>
                    <span>•</span>
                    <span>{produtoSelecionado.tipoLente}</span>
                    <span>•</span>
                    <span>Tratamento: {produtoSelecionado.tratamento}</span>
                    {produtoSelecionado.altura && <><span>•</span><span>Altura: {produtoSelecionado.altura}mm</span></>}
                  </div>
                  {produtoSelecionado.precos?.length > 0 && (
                    <div className="flex gap-3 mt-1">
                      {produtoSelecionado.precos.slice(0, 3).map((p, i) => (
                        <span key={i} className="text-xs">
                          {p.lista.substring(0, 25)}: R$ {p.preco.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!produtoSelecionado && selectedGroup && selectedTratamento && (
                <div className="rounded-lg border border-amber-300 bg-amber-500/10 p-3">
                  <p className="text-sm text-amber-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {!selectedAltura && selectedGroup.alturasDisponiveis.length > 0
                      ? "Selecione a altura para definir o produto exato."
                      : "Nenhum produto encontrado para essa combinação."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Manual fallback search */}
        {!loadingProdutos && produtos.length > 0 && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowManualSearch(!showManualSearch)}
              className="text-xs text-muted-foreground"
            >
              {showManualSearch ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
              Busca manual no catálogo ({produtos.length} produtos)
            </Button>
            {showManualSearch && (
              <Card className="mt-2">
                <CardContent className="pt-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar produto por nome ou código..."
                      value={buscaProduto}
                      onChange={(e) => setBuscaProduto(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                    {produtosFiltrados.map((p) => (
                      <button
                        key={p.codigoProduto}
                        className={`w-full text-left p-2 hover:bg-muted/50 transition-colors text-sm ${
                          produtoSelecionado?.codigoProduto === p.codigoProduto ? "bg-primary/5 border-l-2 border-primary" : ""
                        }`}
                        onClick={() => {
                          setProdutoSelecionado(p);
                          setSelectedGroup(null);
                          setMatchResult(null);
                        }}
                      >
                        <p className="font-medium truncate">{p.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          Cód: {p.codigoProduto} • {p.tipoLente} • {p.tratamento}
                        </p>
                      </button>
                    ))}
                    {produtosFiltrados.length === 0 && (
                      <p className="p-3 text-sm text-muted-foreground text-center">Nenhum produto encontrado</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Prescrição */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> Prescrição
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* OD */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-blue-500/15 text-blue-700 text-xs font-bold flex items-center justify-center">OD</div>
                <span className="text-xs font-medium text-muted-foreground">Olho Direito</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {(["esferico", "cilindrico", "eixo", "adicao", "dnpLonge", "alturaPupilar"] as const).map(field => (
                  <div key={field}>
                    <Label className="text-[10px] uppercase">{field === "dnpLonge" ? "DNP" : field === "alturaPupilar" ? "Altura" : field}</Label>
                    <Input
                      value={prescOd[field]}
                      onChange={(e) => setPrescOd(prev => ({ ...prev, [field]: e.target.value }))}
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                ))}
              </div>
              {/* Prismas OD */}
              <div className="grid grid-cols-4 gap-2 mt-2">
                <div>
                  <Label className="text-[10px] uppercase">Prisma H</Label>
                  <Input value={prescOd.prismaH} onChange={(e) => setPrescOd(prev => ({ ...prev, prismaH: e.target.value }))} className="h-8 text-sm font-mono" placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Base H</Label>
                  <Select value={prescOd.basePrismaH || "none"} onValueChange={(v) => setPrescOd(prev => ({ ...prev, basePrismaH: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="IN">IN (Nasal)</SelectItem>
                      <SelectItem value="OUT">OUT (Temporal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Prisma V</Label>
                  <Input value={prescOd.prismaV} onChange={(e) => setPrescOd(prev => ({ ...prev, prismaV: e.target.value }))} className="h-8 text-sm font-mono" placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Base V</Label>
                  <Select value={prescOd.basePrismaV || "none"} onValueChange={(v) => setPrescOd(prev => ({ ...prev, basePrismaV: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="UP">UP (Superior)</SelectItem>
                      <SelectItem value="DOWN">DOWN (Inferior)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Separator />
            {/* OE */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-700 text-xs font-bold flex items-center justify-center">OE</div>
                <span className="text-xs font-medium text-muted-foreground">Olho Esquerdo</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {(["esferico", "cilindrico", "eixo", "adicao", "dnpLonge", "alturaPupilar"] as const).map(field => (
                  <div key={field}>
                    <Label className="text-[10px] uppercase">{field === "dnpLonge" ? "DNP" : field === "alturaPupilar" ? "Altura" : field}</Label>
                    <Input
                      value={prescOe[field]}
                      onChange={(e) => setPrescOe(prev => ({ ...prev, [field]: e.target.value }))}
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                ))}
              </div>
              {/* Prismas OE */}
              <div className="grid grid-cols-4 gap-2 mt-2">
                <div>
                  <Label className="text-[10px] uppercase">Prisma H</Label>
                  <Input value={prescOe.prismaH} onChange={(e) => setPrescOe(prev => ({ ...prev, prismaH: e.target.value }))} className="h-8 text-sm font-mono" placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Base H</Label>
                  <Select value={prescOe.basePrismaH || "none"} onValueChange={(v) => setPrescOe(prev => ({ ...prev, basePrismaH: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="IN">IN (Nasal)</SelectItem>
                      <SelectItem value="OUT">OUT (Temporal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Prisma V</Label>
                  <Input value={prescOe.prismaV} onChange={(e) => setPrescOe(prev => ({ ...prev, prismaV: e.target.value }))} className="h-8 text-sm font-mono" placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Base V</Label>
                  <Select value={prescOe.basePrismaV || "none"} onValueChange={(v) => setPrescOe(prev => ({ ...prev, basePrismaV: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="UP">UP (Superior)</SelectItem>
                      <SelectItem value="DOWN">DOWN (Inferior)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Armação + Serviço */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Dados de Medida / Armação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] uppercase">Largura</Label>
                  <Input value={armacao.larguraLente} onChange={(e) => setArmacao(p => ({ ...p, larguraLente: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Altura</Label>
                  <Input value={armacao.alturaLente} onChange={(e) => setArmacao(p => ({ ...p, alturaLente: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Ponte</Label>
                  <Input value={armacao.ponteLente} onChange={(e) => setArmacao(p => ({ ...p, ponteLente: e.target.value }))} className="h-8 text-sm" />
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase">Tipo de Armação</Label>
                <Select value={String(tipoArmacao)} onValueChange={(v) => setTipoArmacao(Number(v))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Plástica/Acetato</SelectItem>
                    <SelectItem value="2">Metal</SelectItem>
                    <SelectItem value="5">Balgrif (3 Peças)</SelectItem>
                    <SelectItem value="6">Nylon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Configuração do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase">Tipo de Serviço</Label>
                <Select value={String(tipoServico)} onValueChange={(v) => setTipoServico(Number(v))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Com montagem expressa</SelectItem>
                    <SelectItem value="3">Com montagem convencional (VTA)</SelectItem>
                    <SelectItem value="4">Sem montagem</SelectItem>
                    <SelectItem value="5">Somente corte com tracer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase">Observação</Label>
                <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Até 120 caracteres" maxLength={120} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px] uppercase">Usuário Final (Garantia)</Label>
                <Input value={usuarioFinal} onChange={(e) => setUsuarioFinal(e.target.value)} className="h-8 text-sm" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Validation Results */}
        {validationResult && !validationResult.valid && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium mb-1">Campos obrigatórios faltando:</p>
              <ul className="list-disc list-inside text-xs space-y-0.5">
                {validationResult.errors.map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {validationResult && validationResult.warnings.length > 0 && (
          <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription>
              <p className="font-medium mb-1 text-yellow-800 dark:text-yellow-200">Avisos:</p>
              <ul className="list-disc list-inside text-xs space-y-0.5 text-yellow-700 dark:text-yellow-300">
                {validationResult.warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-8">
          <Button variant="outline" onClick={() => navigate("/os")}>Cancelar</Button>
          <Button onClick={handleEnviarPedido} disabled={enviando || enviandoCooldown || !produtoSelecionado} className="gap-2">
            {enviando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
            ) : (
              <><Send className="h-4 w-4" /> Enviar Pedido</>
            )}
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
};

export default PedidoFornecedorPage;
