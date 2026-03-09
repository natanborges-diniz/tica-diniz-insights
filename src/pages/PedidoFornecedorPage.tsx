// src/pages/PedidoFornecedorPage.tsx
// Tela de criação de pedido para fornecedor (Hoya) — com matching inteligente + validação + auditoria + auto-fill FASE 5

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { OsHubRecord, fetchSingleOsRecipe } from "@/services/osHubService";
import {
  HoyaProduto,
  HoyaPedidoPayload,
  HoyaPedidoResponse,
  listarProdutosHoya,
  consultarProdutoHoya,
  criarPedidoHoya,
  recuperarPedidoPorOs,
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
import {
  getProductRequirements,
  getDefaultRequirements,
  ProductRequirements,
} from "@/services/hoyaProductRequirements";
import { registrarPedidoNoCache } from "@/utils/pedidosMapCache";
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
  CheckCircle2,
  Pencil,
  PackageCheck,
  Copy,
  Ticket,
} from "lucide-react";

// ============================================
// HELPERS
// ============================================

function formatGrau(v: number | null): string {
  if (v === null || v === undefined) return "";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

/** Remove acentos/diacríticos de uma string */
function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Detecta tipo de armação (metal/acetato) a partir da referência */
function detectTipoArmacaoFromRef(ref: string | null | undefined): number | null {
  if (!ref) return null;
  const upper = ref.toUpperCase();
  if (upper.includes("MET")) return 2; // Metal
  if (upper.includes("ACT") || upper.includes("ACET")) return 1; // Plástica/Acetato
  return null;
}

function scoreLabel(score: number): { text: string; color: string } {
  if (score >= 60) return { text: "Alta", color: "text-emerald-600 bg-emerald-500/15 border-emerald-300" };
  if (score >= 35) return { text: "Média", color: "text-amber-600 bg-amber-500/15 border-amber-300" };
  return { text: "Baixa", color: "text-red-600 bg-red-500/15 border-red-300" };
}

// Auto-fill source labels
type AutoFillSource = "depara" | "match" | "manual" | null;

function autoFillSourceLabel(source: AutoFillSource): { text: string; icon: React.ReactNode; color: string } | null {
  switch (source) {
    case "depara":
      return { text: "DE/PARA automático", icon: <Zap className="h-3.5 w-3.5" />, color: "text-emerald-700 bg-emerald-500/15 border-emerald-300" };
    case "match":
      return { text: "Match inteligente", icon: <Sparkles className="h-3.5 w-3.5" />, color: "text-primary bg-primary/10 border-primary/30" };
    case "manual":
      return { text: "Seleção manual", icon: <Search className="h-3.5 w-3.5" />, color: "text-muted-foreground bg-muted border-border" };
    default:
      return null;
  }
}

// ============================================
// COMPONENT
// ============================================

const PedidoFornecedorPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const codOs = Number(searchParams.get("codOs")) || 0;
  const codEmpresa = Number(searchParams.get("codEmpresa")) || 0;
  // Patient data passed from recipe sheet as fallback
  const paramPaciente = searchParams.get("paciente") || "";
  const paramCpf = searchParams.get("cpf") || "";
  const paramDataNascimento = searchParams.get("dataNascimento") || "";

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
  // Pedido já existente no banco para esta OS (bloqueio de duplicidade)
  const [pedidoExistente, setPedidoExistente] = useState<{ numero_pedido: string | null; status: string; fornecedor: string } | null>(null);
  const [recuperando, setRecuperando] = useState(false);

  // Matching state
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<MatchGroup | null>(null);
  const [selectedAltura, setSelectedAltura] = useState<string>("");
  const [selectedTratamento, setSelectedTratamento] = useState<string>("");
  const [selectedFotossensivel, setSelectedFotossensivel] = useState<string>("none");
  const [selectedColoracao, setSelectedColoracao] = useState<string>("none");
  const [noMatchWarning, setNoMatchWarning] = useState(false);

  // Campos complementares dinâmicos (F4.4)
  const [camposComplementaresValues, setCamposComplementaresValues] = useState<Record<number, string>>({});

  // Form state
  const [tipoServico, setTipoServico] = useState(4);
  const [tipoArmacao, setTipoArmacao] = useState(1);
  const [formaArmacao, setFormaArmacao] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [usuarioFinal, setUsuarioFinal] = useState("");
  const [inicialUsuario, setInicialUsuario] = useState("");
  const [valorMontagem, setValorMontagem] = useState(0);
  const [voucher, setVoucher] = useState("");
  const [voucherSugerido, setVoucherSugerido] = useState<string | null>(null);
  const [osNumeroEditavel, setOsNumeroEditavel] = useState("");
  const [nomeMedico, setNomeMedico] = useState("");
  const [crmMedico, setCrmMedico] = useState("");
   // Condições de pagamento: fixada em 30/60/90 (seleção automática nos botões de preço)
  const [condicaoPagamentoSelecionada, setCondicaoPagamentoSelecionada] = useState<string>("default");
  const COND_PAGAMENTO_FIXA = "30/60/90";
  


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

  // ============================================
  // FASE 5: Auto-fill confirmation states
  // ============================================
  const [confirmedProduct, setConfirmedProduct] = useState(false);
  const [confirmedPrescription, setConfirmedPrescription] = useState(false);
  const [autoFillSource, setAutoFillSource] = useState<AutoFillSource>(null);
  const [prescriptionAutoFilled, setPrescriptionAutoFilled] = useState(false);

  // Auto-select 30/60/90 payment condition when product changes
  useEffect(() => {
    if (produtoSelecionado?.precos?.length) {
      const cond3060 = produtoSelecionado.precos.find(p => p.lista.toLowerCase().includes("30/60/90"));
      if (cond3060) {
        const codigo = cond3060.lista.match(/^(\d+)/)?.[1] || "";
        if (codigo) setCondicaoPagamentoSelecionada(codigo);
      }
    }
  }, [produtoSelecionado]);

  // Reset confirmation when product changes
  const handleProductChange = useCallback((produto: HoyaProduto | null, source: AutoFillSource) => {
    setProdutoSelecionado(produto);
    setAutoFillSource(source);
    // Manual selection = auto-confirmed
    if (source === "manual") {
      setConfirmedProduct(true);
    } else {
      setConfirmedProduct(false);
    }
  }, []);

  // ---- Load OS data ----
  useEffect(() => {
    if (!codOs) return;
    (async () => {
      setLoadingOs(true);
      try {
        const found = await fetchSingleOsRecipe(codOs, codEmpresa);
        if (found) {
          // Merge patient data from URL params if hub-receitas didn't return them
          if (!found.cpf && paramCpf) found.cpf = paramCpf;
          if (!found.paciente && paramPaciente) found.paciente = paramPaciente;
          if (!found.dataNascimento && paramDataNascimento) found.dataNascimento = paramDataNascimento;
          setOs(found);
          // Map prismas from OS
          const prismas = mapPrismasFromOs(found);

          const hasAnyPrescData = found.odLongeEsf != null || found.odLongeCil != null ||
            found.oeLongeEsf != null || found.oeLongeCil != null ||
            found.odPertoEsf != null || found.oePertoEsf != null ||
            found.odDnp != null || found.oeDnp != null;

          // Resolver prescrição: aplica regras longe/perto/adição
          const resolved = resolverPrescricaoCompleta(found);
          if (resolved.od.origem !== "longe" || resolved.oe.origem !== "longe") {
            console.log("[PedidoFornecedor] Prescrição resolvida:", 
              `OD=${resolved.od.origem}`, `OE=${resolved.oe.origem}`);
          }

          setPrescOd({
            esferico: resolved.od.esferico != null ? String(resolved.od.esferico) : "",
            cilindrico: resolved.od.cilindrico != null ? String(resolved.od.cilindrico) : "",
            eixo: resolved.od.eixo != null ? String(resolved.od.eixo) : "",
            adicao: resolved.od.adicao != null ? String(resolved.od.adicao) : "",
            dnpLonge: found.odDnp != null ? String(found.odDnp) : "",
            alturaPupilar: found.odAltura != null ? String(found.odAltura) : "",
            prismaH: prismas.odPrismaH != null ? String(prismas.odPrismaH) : "",
            basePrismaH: prismas.odBasePRPrismaH || "",
            prismaV: prismas.odPrismaV != null ? String(prismas.odPrismaV) : "",
            basePrismaV: prismas.odBasePRPrismaV || "",
          });
          setPrescOe({
            esferico: resolved.oe.esferico != null ? String(resolved.oe.esferico) : "",
            cilindrico: resolved.oe.cilindrico != null ? String(resolved.oe.cilindrico) : "",
            eixo: resolved.oe.eixo != null ? String(resolved.oe.eixo) : "",
            adicao: resolved.oe.adicao != null ? String(resolved.oe.adicao) : "",
            dnpLonge: found.oeDnp != null ? String(found.oeDnp) : "",
            alturaPupilar: found.oeAltura != null ? String(found.oeAltura) : "",
            prismaH: prismas.oePrismaH != null ? String(prismas.oePrismaH) : "",
            basePrismaH: prismas.oeBasePRPrismaH || "",
            prismaV: prismas.oePrismaV != null ? String(prismas.oePrismaV) : "",
            basePrismaV: prismas.oeBasePRPrismaV || "",
          });
          setArmacao({
            larguraLente: found.caHorizontal != null ? String(found.caHorizontal) : found.ta != null ? String(found.ta) : "",
            alturaLente: found.aaVertical != null ? String(found.aaVertical) : "",
            ponteLente: found.ponte != null ? String(found.ponte) : "",
          });
          // Auto-fill forma da armação from OS (cod_formato_aro)
          if (found.codFormatoAro != null && found.codFormatoAro > 0) {
            setFormaArmacao(found.codFormatoAro);
          }
          // Auto-detect tipo armação from referência (MET = Metal, ACT = Acetato)
          const tipoDetectado = detectTipoArmacaoFromRef(found.referenciaArmacao);
          if (tipoDetectado !== null) {
            setTipoArmacao(tipoDetectado);
          }
          // Preencher OS editável (número da OS)
          setOsNumeroEditavel(String(found.numeroOs || found.codOs));
          // Remover acentos do nome do usuário final
          setUsuarioFinal(removeAccents(found.paciente || paramPaciente || found.cliente || ""));
          // Auto-gerar iniciais a partir do nome (máximo 2 caracteres)
          const nomeBase = found.paciente || paramPaciente || found.cliente || "";
          setInicialUsuario(removeAccents(nomeBase).split(/\s+/).filter((w: string) => w.length > 0).map((w: string) => w.charAt(0)).join("").substring(0, 2).toUpperCase() || "US");

          // Auto-preencher médico e CRM da OS
          if (found.medico) setNomeMedico(removeAccents(found.medico));
          if (found.crm) setCrmMedico(found.crm);

          // Lookup voucher by CPF
          const cpfToSearch = found.cpf || paramCpf;
          if (cpfToSearch) {
            const { data: voucherData } = await supabase
              .from("voucher_cliente")
              .select("voucher")
              .eq("cpf", cpfToSearch)
              .maybeSingle();
            if (voucherData?.voucher) {
              setVoucher(voucherData.voucher);
              setVoucherSugerido(voucherData.voucher);
              toast({ title: "Voucher encontrado", description: `Voucher "${voucherData.voucher}" vinculado ao CPF deste cliente.` });
            }
          }

          // FASE 5: Mark prescription as auto-filled if data exists
          if (hasAnyPrescData) {
            setPrescriptionAutoFilled(true);
            setConfirmedPrescription(false);
          }
        }
      } catch (err) {
        console.error("[PedidoFornecedor] Error loading OS:", err);
        toast({ title: "Erro ao carregar OS", variant: "destructive" });
      } finally {
        setLoadingOs(false);
      }
    })();
  }, [codOs, codEmpresa]);

  // ---- Verificar se já existe pedido confirmado para esta OS (bloquear duplicidade) ----
  useEffect(() => {
    if (!codOs) return;
    (async () => {
      // Busca config do fornecedor para saber o ambiente ativo
      const { data: configRow } = await supabase
        .from("fornecedor_configuracao")
        .select("ambiente")
        .eq("fornecedor", "HOYA")
        .maybeSingle();
      const ambienteAtivo = configRow?.ambiente || "production";

      const { data: rows } = await supabase
        .from("pedidos_fornecedor")
        .select("numero_pedido, status, fornecedor, created_at, hoya_environment")
        .eq("cod_os", codOs)
        .eq("hoya_environment", ambienteAtivo)
        .order("created_at", { ascending: false });
      if (rows && rows.length > 0) {
        // Prioriza o registro com número de pedido confirmado
        const confirmado = rows.find(r => r.numero_pedido);
        if (confirmado) {
          setPedidoExistente({ numero_pedido: confirmado.numero_pedido, status: confirmado.status || "", fornecedor: confirmado.fornecedor });
        } else {
          // Só erros — não bloqueia, mas informa
          setPedidoExistente({ numero_pedido: null, status: rows[0].status || "ERRO", fornecedor: rows[0].fornecedor });
        }
      }
    })();
  }, [codOs]);

  // ---- Auto-load Hoya products + payment conditions on mount ----
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

      if (depara) {
        // Try matching by codigo_fornecedor first, then by nome_fornecedor
        let match: HoyaProduto | undefined;
        if (depara.codigo_fornecedor) {
          match = produtos.find(p => p.codigoProduto === depara.codigo_fornecedor);
        }
        if (!match && depara.nome_fornecedor) {
          // Fallback: match by product name in catalog
          const nomeLower = depara.nome_fornecedor.toLowerCase();
          match = produtos.find(p => p.nome.toLowerCase() === nomeLower);
          if (!match) {
            // Fuzzy: check if catalog name contains the DE/PARA name
            match = produtos.find(p => p.nome.toLowerCase().includes(nomeLower) || nomeLower.includes(p.nome.toLowerCase()));
          }
        }
        if (match) {
          // FASE 5: DE/PARA auto-selects product + syncs group selects
          handleProductChange(match, "depara");

          // Also run matching to populate group selects for visual consistency
          const resolvedMatch = resolverPrescricaoCompleta(os);
          const result = matchProducts(produtos, descricao, {
            esfericoOd: resolvedMatch.od.esferico,
            esfericoOe: resolvedMatch.oe.esferico,
            cilindricoOd: resolvedMatch.od.cilindrico,
            cilindricoOe: resolvedMatch.oe.cilindrico,
            adicaoOd: resolvedMatch.od.adicao,
            adicaoOe: resolvedMatch.oe.adicao,
          });
          setMatchResult(result);

          // Find the group that contains this product and sync selects
          const matchingGroup = result.groups.find(g =>
            g.produtos.some(p => p.codigoProduto === match!.codigoProduto)
          );
          if (matchingGroup) {
            setSelectedGroup(matchingGroup);
            // Sync altura
            if (match.codigoAltura != null) {
              setSelectedAltura(String(match.codigoAltura));
            }
            // Sync tratamento
            setSelectedTratamento(String(match.codigoTratamento));
            // Sync fotossensivel
            if (match.codigoFotossensivel != null) {
              setSelectedFotossensivel(String(match.codigoFotossensivel));
            }
          }

          toast({ title: "Produto encontrado via DE/PARA", description: match.nome });
          return;
        }
      }

      // Run intelligent matching
      const resolvedForMatch = resolverPrescricaoCompleta(os);
      const result = matchProducts(produtos, descricao, {
        esfericoOd: resolvedForMatch.od.esferico,
        esfericoOe: resolvedForMatch.oe.esferico,
        cilindricoOd: resolvedForMatch.od.cilindrico,
        cilindricoOe: resolvedForMatch.oe.cilindrico,
        adicaoOd: resolvedForMatch.od.adicao,
        adicaoOe: resolvedForMatch.oe.adicao,
      });
      setMatchResult(result);

      if (result.bestGroup) {
        setSelectedGroup(result.bestGroup);
        setAutoFillSource("match");
        // Pre-select based on parsed data
        if (result.parsed.tratamento) {
          const matchTrat = result.bestGroup.tratamentosDisponiveis.find(t =>
            t.tratamento.toLowerCase().includes(result.parsed.tratamento!.toLowerCase())
          );
          if (matchTrat) {
            setSelectedTratamento(String(matchTrat.codigoTratamento));
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
  }, [os, produtos, handleProductChange]);

  // ---- Resolve exact product from selections ----
  useEffect(() => {
    if (!selectedGroup || !selectedTratamento) return;
    const codTrat = Number(selectedTratamento);

    const codAltura = selectedAltura ? Number(selectedAltura) : null;
    const codFoto = selectedFotossensivel !== "none" ? Number(selectedFotossensivel) : null;

    // Try non-COR first, then COR
    let exact = findExactProduct(
      selectedGroup.produtos,
      selectedGroup.codigoDesenho,
      selectedGroup.codigoMaterial,
      codAltura,
      codTrat,
      codFoto,
      false
    );

    if (!exact) {
      exact = findExactProduct(
        selectedGroup.produtos,
        selectedGroup.codigoDesenho,
        selectedGroup.codigoMaterial,
        codAltura,
        codTrat,
        codFoto,
        true
      );
    }

    if (exact) {
      setNoMatchWarning(false);
      if (exact.codigoProduto !== produtoSelecionado?.codigoProduto) {
        setProdutoSelecionado(exact);
        if (autoFillSource !== "depara") {
          setAutoFillSource("match");
          setConfirmedProduct(false);
        }
      }
    } else {
      setProdutoSelecionado(null);
      setConfirmedProduct(false);
      setNoMatchWarning(true);
    }
    setCamposComplementaresValues({});
  }, [selectedGroup, selectedAltura, selectedTratamento, selectedFotossensivel]);

  // ---- Cascading filtered options based on current selections ----
  const filteredOptions = useMemo(() => {
    if (!selectedGroup) return { alturas: [], tratamentos: [], fotossensiveis: [] };
    const prods = selectedGroup.produtos;

    // Filter products by current selections to derive compatible options
    const codAltura = selectedAltura ? Number(selectedAltura) : null;
    const codTrat = selectedTratamento ? Number(selectedTratamento) : null;
    const codFoto = selectedFotossensivel !== "none" ? Number(selectedFotossensivel) : null;

    // Alturas: filter products by selected tratamento + fotossensível
    const prodsForAlturas = prods.filter(p => {
      if (codTrat != null && p.codigoTratamento !== codTrat) return false;
      if (codFoto != null && p.codigoFotossensivel !== codFoto) return false;
      if (codFoto == null && selectedFotossensivel === "none" && p.codigoFotossensivel != null) return false;
      return true;
    });
    const alturasMap = new Map<number, { altura: number; codigoAltura: number }>();
    for (const p of prodsForAlturas) {
      if (p.codigoAltura != null && p.altura != null && !alturasMap.has(p.codigoAltura)) {
        alturasMap.set(p.codigoAltura, { altura: p.altura, codigoAltura: p.codigoAltura });
      }
    }
    const alturas = Array.from(alturasMap.values()).sort((a, b) => a.altura - b.altura);

    // Tratamentos: filter products by selected altura + fotossensível
    const prodsForTrat = prods.filter(p => {
      if (codAltura != null && p.codigoAltura !== codAltura) return false;
      if (codFoto != null && p.codigoFotossensivel !== codFoto) return false;
      if (codFoto == null && selectedFotossensivel === "none" && p.codigoFotossensivel != null) return false;
      return true;
    });
    const tratMap = new Map<number, { tratamento: string; codigoTratamento: number }>();
    for (const p of prodsForTrat) {
      if (!tratMap.has(p.codigoTratamento)) {
        tratMap.set(p.codigoTratamento, {
          tratamento: p.tratamento,
          codigoTratamento: p.codigoTratamento,
        });
      }
    }
    const tratamentos = Array.from(tratMap.values()).sort((a, b) => a.tratamento.localeCompare(b.tratamento));

    // Fotossensíveis: filter products by selected altura + tratamento
    const prodsForFoto = prods.filter(p => {
      if (codAltura != null && p.codigoAltura !== codAltura) return false;
      if (codTrat != null && p.codigoTratamento !== codTrat) return false;
      return true;
    });
    const fotoMap = new Map<number, { nome: string; codigoFotossensivel: number }>();
    for (const p of prodsForFoto) {
      if (p.codigoFotossensivel != null && p.fotossensivel && !fotoMap.has(p.codigoFotossensivel)) {
        fotoMap.set(p.codigoFotossensivel, { nome: String(p.fotossensivel), codigoFotossensivel: p.codigoFotossensivel });
      }
    }
    const fotossensiveis = Array.from(fotoMap.values());

    return { alturas, tratamentos, fotossensiveis };
  }, [selectedGroup, selectedAltura, selectedTratamento, selectedFotossensivel]);

  // ---- Auto-reset incompatible selections when filtered options change ----
  useEffect(() => {
    if (!selectedGroup) return;
    if (selectedTratamento) {
      const codTrat = Number(selectedTratamento);
      const tratAvailable = filteredOptions.tratamentos.some(t => t.codigoTratamento === codTrat);
      if (!tratAvailable && filteredOptions.tratamentos.length > 0) {
        setSelectedTratamento(String(filteredOptions.tratamentos[0].codigoTratamento));
      } else if (!tratAvailable && filteredOptions.tratamentos.length === 0) {
        setSelectedTratamento("");
      }
    }
    if (selectedAltura) {
      const codAlt = Number(selectedAltura);
      const altAvailable = filteredOptions.alturas.some(a => a.codigoAltura === codAlt);
      if (!altAvailable && filteredOptions.alturas.length > 0) {
        setSelectedAltura(String(filteredOptions.alturas[0].codigoAltura));
      } else if (!altAvailable && filteredOptions.alturas.length === 0) {
        setSelectedAltura("");
      }
    }
    if (selectedFotossensivel !== "none") {
      const codFoto = Number(selectedFotossensivel);
      const fotoAvailable = filteredOptions.fotossensiveis.some(f => f.codigoFotossensivel === codFoto);
      if (!fotoAvailable) {
        setSelectedFotossensivel("none");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOptions]);

  // ---- Fetch colorações when product allows it but catalog didn't include them ----
  const [coloracoesCarregadas, setColoracoesCarregadas] = useState<HoyaProduto["coloracoes"]>([]);
  const [loadingColoracoes, setLoadingColoracoes] = useState(false);

  useEffect(() => {
    if (!produtoSelecionado) {
      setColoracoesCarregadas([]);
      setSelectedColoracao("none");
      return;
    }
    // If catalog already has colorações, use them
    if (produtoSelecionado.coloracoes && produtoSelecionado.coloracoes.length > 0) {
      setColoracoesCarregadas(produtoSelecionado.coloracoes);
      return;
    }
    // If product allows coloração but colorações not loaded, fetch individual product
    if (produtoSelecionado.permiteColoracao) {
      let cancelled = false;
      setLoadingColoracoes(true);
      consultarProdutoHoya(produtoSelecionado.codigoProduto)
        .then((detalhe) => {
          if (!cancelled && detalhe.coloracoes && detalhe.coloracoes.length > 0) {
            setColoracoesCarregadas(detalhe.coloracoes);
          } else if (!cancelled) {
            setColoracoesCarregadas([]);
          }
        })
        .catch((err) => {
          console.warn("[PedidoFornecedor] Erro ao buscar colorações:", err);
          if (!cancelled) setColoracoesCarregadas([]);
        })
        .finally(() => { if (!cancelled) setLoadingColoracoes(false); });
      return () => { cancelled = true; };
    }
    setColoracoesCarregadas([]);
  }, [produtoSelecionado?.codigoProduto, produtoSelecionado?.permiteColoracao]);

  // ---- Available colorações for selected product ----
  const coloracoesDisponiveis = useMemo(() => {
    return coloracoesCarregadas || [];
  }, [coloracoesCarregadas]);

  // ---- Manual search filtered products ----
  const produtosFiltrados = buscaProduto.trim()
    ? produtos.filter(p =>
        p.nome.toLowerCase().includes(buscaProduto.toLowerCase()) ||
        String(p.codigoProduto).includes(buscaProduto)
      )
    : produtos.slice(0, 50);

  // Deriva requisitos do produto a partir dos dados do catálogo (ranges)
  const productReqs: ProductRequirements = produtoSelecionado
    ? getProductRequirements(produtoSelecionado)
    : getDefaultRequirements();
  const produtoIsSurfacada = !productReqs.isLentePronta;

  // FASE 5: Check if both confirmations are done
  // If prescription was NOT auto-filled, no confirmation needed; if it was, user must confirm
  const isReadyToSubmit = confirmedProduct && (confirmedPrescription || !prescriptionAutoFilled) && !!produtoSelecionado;

  // ---- Submit order ----
  const handleEnviarPedido = async () => {
    if (!os || !produtoSelecionado) {
      toast({ title: "Selecione um produto Hoya", variant: "destructive" });
      return;
    }
    if (!isReadyToSubmit) {
      toast({
        title: "Confirme o produto e a prescrição",
        description: "Revise e confirme os dados auto-preenchidos antes de enviar.",
        variant: "destructive",
      });
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
        os: osNumeroEditavel || String(os.numeroOs || os.codOs),
        observacao: observacao || undefined,
        voucher: voucher || undefined,
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
            esferico: prescOd.esferico ? Number(prescOd.esferico) : 0,
            cilindrico: prescOd.cilindrico ? Number(prescOd.cilindrico) : 0,
            eixo: prescOd.eixo ? Number(prescOd.eixo) : 0,
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
            esferico: prescOe.esferico ? Number(prescOe.esferico) : 0,
            cilindrico: prescOe.cilindrico ? Number(prescOe.cilindrico) : 0,
            eixo: prescOe.eixo ? Number(prescOe.eixo) : 0,
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
          larguraLente: armacao.larguraLente && armacao.larguraLente.trim() !== "" ? Number(armacao.larguraLente) : undefined,
          alturaLente: armacao.alturaLente && armacao.alturaLente.trim() !== "" ? Number(armacao.alturaLente) : undefined,
          ponteLente: armacao.ponteLente && armacao.ponteLente.trim() !== "" ? Number(armacao.ponteLente) : undefined,
          distanciaLeitura: null,
        },
        armacao: {
          tipoArmacao,
          comPolimento: false,
          formaArmacao,
        },
        valorMontagemSemTriangulacao: (tipoServico === 1 || tipoServico === 3) ? valorMontagem : 0,
        condicaoPagamento: condicaoPagamentoSelecionada && condicaoPagamentoSelecionada !== "default" ? condicaoPagamentoSelecionada : undefined,
        garantia: {
          usuarioFinal: removeAccents(usuarioFinal || os.paciente || os.cliente || ""),
          inicialUsuario: removeAccents(inicialUsuario || (usuarioFinal || os.paciente || os.cliente || "").split(/\s+/).filter((w: string) => w.length > 0).map((w: string) => w.charAt(0)).join("").substring(0, 2).toUpperCase() || "US"),
          nomeMedico: nomeMedico || null,
          crmMedico: crmMedico || null,
        },
        // F4.4: Campos complementares
        camposComplementares: produtoSelecionado.camposComplementares?.length
          ? produtoSelecionado.camposComplementares.map(c => ({
              codigo: c.codigo,
              valor: camposComplementaresValues[c.codigo] ?? String(c.valorPadrao ?? ""),
            }))
          : undefined,
      };

      // DEBUG: Log payload para inspeção
      console.log("[PedidoFornecedor] PAYLOAD:", JSON.stringify(payload, null, 2));

      // E4.1: Validate before sending (F4.4: pass campos complementares + product ranges)
      const validation = validateHoyaPayload(
        payload,
        produtoSelecionado.camposComplementares,
        camposComplementaresValues,
        {
          alturaPupilarMinima: produtoSelecionado.alturaPupilarMinima,
          alturaPupilarMaxima: produtoSelecionado.alturaPupilarMaxima,
          esfericoMinimo: produtoSelecionado.esfericoMinimo,
          esfericoMaximo: produtoSelecionado.esfericoMaximo,
          cilindricoMinimo: produtoSelecionado.cilindricoMinimo,
          cilindricoMaximo: produtoSelecionado.cilindricoMaximo,
          adicaoMinima: produtoSelecionado.adicaoMinima,
          adicaoMaxima: produtoSelecionado.adicaoMaxima,
        },
        produtoSelecionado.nome,
      );
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

      // Atualiza o cache compartilhado para o badge aparecer imediatamente no monitor
      registrarPedidoNoCache(
        os.codOs,
        String(resp.numeroPedido),
        "HOYA",
        resp.status || "enviado",
        new Date().toISOString(),
        resp.voucherGerado || null
      );

      // Save DE/PARA (persist for future auto-fill)
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

      // Save voucher linked to CPF if response contains one
      const voucherGerado = resp.voucherGerado;
      const cpfCliente = os.cpf || paramCpf;
      if (voucherGerado && cpfCliente) {
        await supabase.from("voucher_cliente").upsert(
          {
            cpf: cpfCliente,
            voucher: voucherGerado,
            numero_pedido: String(resp.numeroPedido),
            cod_empresa: os.codEmpresa,
            cliente_nome: os.paciente || os.cliente || "",
          },
          { onConflict: "cpf" }
        );
      }

      toast({
        title: "Pedido enviado com sucesso!",
        description: `Número: ${resp.numeroPedido} — Status: ${resp.status}`,
      });
    } catch (err) {
      console.error("[PedidoFornecedor] Error:", err);
      // Extract friendly message — HoyaProxyError has .message, plain Error also has .message
      const errMsg = (err as { message?: string })?.message || "Erro desconhecido ao comunicar com o laboratório.";
      toast({
        title: "Erro ao enviar pedido para a Hoya",
        description: errMsg,
        variant: "destructive",
        duration: 8000,
      });
    } finally {
      setEnviando(false);
    }
  };

  // Handler para recuperar pedido que foi processado pela Hoya mas não salvo corretamente
  const handleRecuperarPedido = async () => {
    if (!os) return;
    try {
      setRecuperando(true);
      toast({ title: "Consultando Hoya...", description: "Buscando pedido pelo número da OS." });
      const result = await recuperarPedidoPorOs(
        os.numeroOs || String(os.codOs),
        os.codOs,
        os.codEmpresa
      );
      // Atualiza cache e estado local
      registrarPedidoNoCache(os.codOs, result.numeroPedido, "HOYA", result.status, new Date().toISOString());
      setPedidoExistente({ numero_pedido: result.numeroPedido, status: result.status, fornecedor: "HOYA" });
      toast({
        title: "Pedido recuperado!",
        description: `Nº ${result.numeroPedido} encontrado na Hoya e registrado com sucesso.`,
      });
    } catch (err) {
      console.error("[PedidoFornecedor] Recover error:", err);
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || "Erro ao consultar Hoya";
      toast({
        title: "Não foi possível recuperar o pedido",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setRecuperando(false);
    }
  };

  // ============================================
  // FASE 5: Confirmation Banner Component
  // ============================================

  const AutoFillConfirmBanner: React.FC<{
    type: "product" | "prescription";
    confirmed: boolean;
    onConfirm: () => void;
    onEdit: () => void;
    source?: AutoFillSource;
  }> = ({ type, confirmed, onConfirm, onEdit, source }) => {
    if (confirmed) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-500/10 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-sm text-emerald-700 font-medium">
            {type === "product" ? "Produto confirmado" : "Prescrição confirmada"}
          </span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs text-muted-foreground" onClick={onEdit}>
            <Pencil className="h-3 w-3 mr-1" /> Editar
          </Button>
        </div>
      );
    }

    const sourceInfo = source ? autoFillSourceLabel(source) : null;

    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-500/10 px-3 py-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-amber-800 font-medium">
            {type === "product" ? "Produto pré-selecionado" : "Prescrição pré-preenchida da OS"}
          </span>
          {sourceInfo && (
            <Badge variant="outline" className={`ml-2 text-[10px] h-5 ${sourceInfo.color}`}>
              {sourceInfo.icon}
              <span className="ml-1">{sourceInfo.text}</span>
            </Badge>
          )}
          <p className="text-xs text-amber-700 mt-0.5">
            Revise os dados e confirme antes de enviar.
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 h-8 gap-1 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={onConfirm}
        >
          <Check className="h-3.5 w-3.5" /> Confirmar
        </Button>
      </div>
    );
  };

  // ---- RENDER ----

  if (loadingOs) {
    return (
      <div className="flex items-center justify-center h-24 gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Consultando receita...</span>
      </div>
    );
  }

  if (!os) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p>OS não encontrada (codOs: {codOs})</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar à Receita
        </Button>
      </div>
    );
  }

  // Pedido já confirmado no banco — bloqueia nova tentativa (exceto se cancelado/rejeitado)
  const isNegativeStatus = (s: string) => {
    const lower = s.toLowerCase();
    return lower.includes("cancel") || lower.includes("rejeit") || lower.includes("falha") || lower.includes("recusa");
  };

  if (pedidoExistente?.numero_pedido && !isNegativeStatus(pedidoExistente.status)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10">
          <PackageCheck className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Pedido já enviado</h2>
        <div className="text-center space-y-2">
          <p className="text-lg">
            Nº Pedido {pedidoExistente.fornecedor}:{" "}
            <span className="font-mono font-bold text-primary">{pedidoExistente.numero_pedido}</span>
          </p>
          <p className="text-muted-foreground">Status: {pedidoExistente.status}</p>
          <p className="text-sm text-muted-foreground">Esta OS já possui pedido confirmado. Não é possível enviar um segundo pedido.</p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar à Receita
        </Button>
      </div>
    );
  }

  // Pedido cancelado/rejeitado — informa mas permite refazer
  if (pedidoExistente?.numero_pedido && isNegativeStatus(pedidoExistente.status)) {
    // Don't block — just clear the existing reference and let the form render
    // Show a warning banner instead (handled below in the form)
  }

  // Só erros no banco + a Hoya rejeita como duplicata — oferece recuperação
  if (pedidoExistente && !pedidoExistente.numero_pedido && os) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 max-w-md mx-auto text-center">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-1">Tentativas com erro registradas</h2>
          <p className="text-muted-foreground text-sm">
            Esta OS possui {""} tentativas anteriores que falharam. Se a Hoya informar que a OS já foi usada, é possível que o pedido tenha sido processado mas não registrado aqui.
          </p>
        </div>
        <div className="w-full rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Recuperar pedido da Hoya</p>
          <p className="text-xs text-muted-foreground">
            Clique abaixo para consultar diretamente na Hoya pelo número da OS <strong>{os.numeroOs || os.codOs}</strong>. Se encontrado, o número do protocolo será registrado automaticamente.
          </p>
          <Button
            className="w-full"
            onClick={handleRecuperarPedido}
            disabled={recuperando}
          >
            {recuperando ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Consultando Hoya...</>
            ) : (
              <><Search className="h-4 w-4 mr-2" /> Buscar pedido na Hoya</>
            )}
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setPedidoExistente(null)}>
          Ignorar e tentar enviar novamente
        </Button>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar à Receita
        </Button>
      </div>
    );
  }


  if (pedidoEnviado) {
    const handleCopyVoucher = (v: string) => {
      navigator.clipboard.writeText(v);
      toast({ title: "Voucher copiado!", description: v });
    };
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10">
          <Check className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Pedido Enviado!</h2>
        <div className="text-center space-y-2">
          <p className="text-lg">
            Nº Pedido Hoya:{" "}
            <span className="font-mono font-bold text-primary">{pedidoEnviado.numeroPedido}</span>
          </p>
          <p className="text-muted-foreground">Status: {pedidoEnviado.status}</p>
          {pedidoEnviado.voucherGerado && (
            <div className="flex items-center justify-center gap-2 mt-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
              <Ticket className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Voucher:</span>
              <span className="font-mono font-bold text-primary">{pedidoEnviado.voucherGerado}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleCopyVoucher(pedidoEnviado.voucherGerado!)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate(`/os?openOs=${codOs}&codEmpresa=${codEmpresa}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar à Receita
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
    <ScrollArea className="flex-1">
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Pedido Hoya — OS {os.numeroOs || os.codOs}</h1>
              <p className="text-sm text-muted-foreground">
                {os.paciente ? `Paciente: ${os.paciente}` : os.cliente}
                {os.cpf && <span className="ml-2 text-xs">CPF: {os.cpf}</span>}
                {os.dataNascimento && <span className="ml-2 text-xs">Nasc: {new Date(os.dataNascimento).toLocaleDateString('pt-BR')}</span>}
              </p>
            </div>
          </div>
          <Badge className="bg-orange-500/15 text-orange-700 border-orange-300">HOYA</Badge>
        </div>

        <Separator />

        {/* Banner de pedido cancelado/rejeitado — permite refazer */}
        {pedidoExistente?.numero_pedido && isNegativeStatus(pedidoExistente.status) && (
          <Alert className="border-amber-300 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm">
              <span className="font-semibold">Pedido anterior #{pedidoExistente.numero_pedido}</span> foi{" "}
              <span className="font-semibold text-amber-700">{pedidoExistente.status}</span>.
              Você pode enviar um novo pedido para esta OS.
            </AlertDescription>
          </Alert>
        )}

        {/* Confirmation banners removed — now in sticky footer */}

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
                  {produtoSelecionado && !produtoIsSurfacada && (
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-300">
                      Lente Pronta
                    </Badge>
                  )}
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
                      setAutoFillSource("manual");
                      setConfirmedProduct(false);
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
                  {filteredOptions.alturas.length > 0 && (
                    <div>
                      <Label className="text-[10px] uppercase mb-1 block">
                        Altura <span className="text-destructive">*</span>
                      </Label>
                      <Select value={selectedAltura} onValueChange={(v) => {
                        setSelectedAltura(v);
                        setAutoFillSource("manual");
                        setConfirmedProduct(true);
                      }}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Escolha..." />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredOptions.alturas.map(a => (
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
                      setSelectedColoracao("none");
                      setAutoFillSource("manual");
                      setConfirmedProduct(true);
                    }}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Escolha..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredOptions.tratamentos.map(t => (
                          <SelectItem key={String(t.codigoTratamento)} value={String(t.codigoTratamento)}>
                            {t.tratamento}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Fotossensível */}
                  {filteredOptions.fotossensiveis.length > 0 && (
                    <div>
                      <Label className="text-[10px] uppercase mb-1 block">Fotossensível</Label>
                      <Select value={selectedFotossensivel} onValueChange={(v) => {
                        setSelectedFotossensivel(v);
                        setAutoFillSource("manual");
                        setConfirmedProduct(true);
                      }}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Nenhum" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem fotossensível</SelectItem>
                          {filteredOptions.fotossensiveis.map(f => (
                            <SelectItem key={f.codigoFotossensivel} value={String(f.codigoFotossensivel)}>
                              {f.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Coloração — sempre visível */}
                  <div>
                    <Label className="text-[10px] uppercase mb-1 block">Coloração</Label>
                    <Select value={selectedColoracao} onValueChange={setSelectedColoracao} disabled={coloracoesDisponiveis.length === 0 || loadingColoracoes}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={loadingColoracoes ? "Carregando..." : coloracoesDisponiveis.length === 0 ? "Indisponível" : "Nenhuma"} />
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
                    {loadingColoracoes && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Buscando colorações...</p>
                    )}
                    {!loadingColoracoes && coloracoesDisponiveis.length === 0 && produtoSelecionado && !produtoSelecionado.permiteColoracao && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Este produto não possui opções de coloração.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Warning: combinação não encontrada */}
              {noMatchWarning && selectedGroup && selectedTratamento && (
                <Alert className="border-amber-300 bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm">
                    <span className="font-semibold">Combinação indisponível.</span> Não existe produto no catálogo Hoya para a combinação selecionada. Altere uma das opções acima.
                  </AlertDescription>
                </Alert>
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
                    <div className="flex flex-wrap gap-2 mt-2">
                      {produtoSelecionado.precos.slice(0, 5).map((p, i) => {
                        const codigoCond = p.lista.match(/^(\d+)/)?.[1] || "";
                        const isCondFixa = p.lista.toLowerCase().includes("30/60/90");
                        const isSelected = condicaoPagamentoSelecionada === codigoCond;
                        const isDisabled = !isCondFixa;
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => {
                              if (!isDisabled) {
                                setCondicaoPagamentoSelecionada(isSelected ? "default" : codigoCond);
                              }
                            }}
                            className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                              isSelected
                                ? "border-primary bg-primary/15 text-primary font-semibold ring-1 ring-primary/30"
                                : isDisabled
                                  ? "border-border bg-muted/50 text-muted-foreground/50 cursor-not-allowed opacity-50"
                                  : "border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {p.lista.substring(0, 25)}: <span className="font-mono">R$ {p.preco.toFixed(2)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* F4.4: Campos Complementares Dinâmicos */}
              {produtoSelecionado?.camposComplementares && produtoSelecionado.camposComplementares.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase text-muted-foreground block">Campos Complementares</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {produtoSelecionado.camposComplementares.map(campo => (
                      <div key={campo.codigo}>
                        <Label className="text-[10px] uppercase mb-1 block">
                          {campo.nome}
                          {campo.obrigatorio && <span className="text-destructive ml-0.5">*</span>}
                        </Label>
                        <Input
                          value={camposComplementaresValues[campo.codigo] ?? String(campo.valorPadrao ?? "")}
                          onChange={(e) =>
                            setCamposComplementaresValues(prev => ({
                              ...prev,
                              [campo.codigo]: e.target.value,
                            }))
                          }
                          placeholder={`${campo.rangeMinimo} — ${campo.rangeMaximo}`}
                          className="h-8 text-sm font-mono"
                          type="number"
                          step={campo.incremento || "any"}
                          min={campo.rangeMinimo}
                          max={campo.rangeMaximo}
                        />
                        <span className="text-[9px] text-muted-foreground">
                          Range: {campo.rangeMinimo} – {campo.rangeMaximo}
                        </span>
                      </div>
                    ))}
                  </div>
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
                          handleProductChange(p, "manual");
                          setSelectedGroup(null);
                          setMatchResult(null);
                          setSelectedColoracao("none");
                        }}
                      >
                        <p className="font-medium truncate">{p.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          Cód: {p.codigoProduto} • {p.tipoLente} • {p.tratamento}
                          {p.permiteColoracao && <span className="ml-1 text-amber-600">• Coloração disponível</span>}
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

        {/* Produto selecionado manualmente (sem match group) — exibe detalhes + coloração */}
        {produtoSelecionado && !selectedGroup && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="h-4 w-4" /> Produto Selecionado Manualmente
                {!produtoIsSurfacada && (
                  <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-300 ml-1">
                    Lente Pronta (sem medidas de armação)
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <div className="flex flex-wrap gap-2 mt-2">
                    {produtoSelecionado.precos.slice(0, 5).map((p, i) => {
                      const codigoCond = p.lista.match(/^(\d+)/)?.[1] || "";
                      const isCondFixa = p.lista.toLowerCase().includes("30/60/90");
                      const isSelected = condicaoPagamentoSelecionada === codigoCond;
                      const isDisabled = !isCondFixa;
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            if (!isDisabled) {
                              setCondicaoPagamentoSelecionada(isSelected ? "default" : codigoCond);
                            }
                          }}
                          className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/15 text-primary font-semibold ring-1 ring-primary/30"
                              : isDisabled
                                ? "border-border bg-muted/50 text-muted-foreground/50 cursor-not-allowed opacity-50"
                                : "border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {p.lista.substring(0, 25)}: <span className="font-mono">R$ {p.preco.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Coloração para produto manual */}
              {(coloracoesDisponiveis.length > 0 || produtoSelecionado.permiteColoracao) && (
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

              {/* Indicador de que o produto permite coloração mas não tem opções carregadas */}
              {produtoSelecionado.permiteColoracao && coloracoesDisponiveis.length === 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-500/10 p-3">
                  <p className="text-sm text-amber-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Este produto permite coloração, mas nenhuma opção foi carregada do catálogo.
                  </p>
                </div>
              )}

              {/* Campos Complementares para produto manual */}
              {produtoSelecionado.camposComplementares && produtoSelecionado.camposComplementares.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase text-muted-foreground block">Campos Complementares</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {produtoSelecionado.camposComplementares.map(campo => (
                      <div key={campo.codigo}>
                        <Label className="text-[10px] uppercase mb-1 block">
                          {campo.nome}
                          {campo.obrigatorio && <span className="text-destructive ml-0.5">*</span>}
                        </Label>
                        <Input
                          value={camposComplementaresValues[campo.codigo] ?? String(campo.valorPadrao ?? "")}
                          onChange={(e) =>
                            setCamposComplementaresValues(prev => ({
                              ...prev,
                              [campo.codigo]: e.target.value,
                            }))
                          }
                          placeholder={`${campo.rangeMinimo} — ${campo.rangeMaximo}`}
                          className="h-8 text-sm font-mono"
                          type="number"
                          step={campo.incremento || "any"}
                          min={campo.rangeMinimo}
                          max={campo.rangeMaximo}
                        />
                        <span className="text-[9px] text-muted-foreground">
                          Range: {campo.rangeMinimo} – {campo.rangeMaximo}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Prescrição */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> Prescrição
              {prescriptionAutoFilled && !confirmedPrescription && (
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-300 ml-2">
                  Pré-preenchida da OS
                </Badge>
              )}
              {confirmedPrescription && (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-300 ml-2">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Confirmada
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* OD */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-blue-500/15 text-blue-700 text-xs font-bold flex items-center justify-center">OD</div>
                <span className="text-xs font-medium text-muted-foreground">Olho Direito</span>
              </div>
              <div className={`grid grid-cols-3 ${produtoIsSurfacada ? "sm:grid-cols-6" : "sm:grid-cols-4"} gap-2`}>
                {(produtoIsSurfacada
                  ? ["esferico", "cilindrico", "eixo", "adicao", "dnpLonge", "alturaPupilar"] as const
                  : ["esferico", "cilindrico", "eixo", "adicao"] as const
                ).map(field => (
                  <div key={field}>
                    <Label className="text-[10px] uppercase">{field === "dnpLonge" ? "DNP" : field === "alturaPupilar" ? "Altura" : field}</Label>
                    <Input
                      value={prescOd[field]}
                      onChange={(e) => {
                        setPrescOd(prev => ({ ...prev, [field]: e.target.value }));
                        // Any manual edit auto-confirms prescription
                        if (prescriptionAutoFilled) setConfirmedPrescription(true);
                      }}
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
              <div className={`grid grid-cols-3 ${produtoIsSurfacada ? "sm:grid-cols-6" : "sm:grid-cols-4"} gap-2`}>
                {(produtoIsSurfacada
                  ? ["esferico", "cilindrico", "eixo", "adicao", "dnpLonge", "alturaPupilar"] as const
                  : ["esferico", "cilindrico", "eixo", "adicao"] as const
                ).map(field => (
                  <div key={field}>
                    <Label className="text-[10px] uppercase">{field === "dnpLonge" ? "DNP" : field === "alturaPupilar" ? "Altura" : field}</Label>
                    <Input
                      value={prescOe[field]}
                      onChange={(e) => {
                        setPrescOe(prev => ({ ...prev, [field]: e.target.value }));
                        if (prescriptionAutoFilled) setConfirmedPrescription(true);
                      }}
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
        <div className={`grid grid-cols-1 ${produtoIsSurfacada ? "md:grid-cols-2" : ""} gap-4`}>
          {produtoIsSurfacada && (
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
              {os?.descricaoArmacao && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mb-2">
                  <span className="font-medium">Armação ERP:</span> {os.descricaoArmacao}
                  {os.referenciaArmacao && <span className="ml-2 text-[10px]">({os.referenciaArmacao})</span>}
                  {os.codFormatoAro != null && <Badge variant="outline" className="ml-2 text-[10px]">Formato: {os.codFormatoAro}</Badge>}
                </div>
              )}
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
              <div>
                <Label className="text-[10px] uppercase mb-2 block">Forma da Armação</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFormaArmacao(v)}
                      className={cn(
                        "relative rounded-md border p-1 transition-all hover:border-primary/50 cursor-pointer",
                        formaArmacao === v
                          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                          : "border-border bg-background"
                      )}
                      title={`Forma ${v}`}
                    >
                      <img
                        src={`/images/forma-armacao-${v}.png`}
                        alt={`Forma ${v}`}
                        className="w-full h-auto object-contain"
                      />
                      <span className="absolute bottom-0 right-0.5 text-[8px] text-muted-foreground font-mono">{v}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          )}

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
              {(tipoServico === 1 || tipoServico === 3) && (
                <div>
                  <Label className="text-[10px] uppercase">Valor Montagem (s/ triangulação)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={valorMontagem}
                    onChange={(e) => setValorMontagem(Number(e.target.value) || 0)}
                    className="h-8 text-sm"
                    placeholder="0.00"
                  />
                </div>
              )}
              <div>
                <Label className="text-[10px] uppercase">OS (Pedido Hoya)</Label>
                <Input
                  value={osNumeroEditavel}
                  onChange={(e) => setOsNumeroEditavel(e.target.value)}
                  className="h-8 text-sm font-mono"
                  placeholder="Nº OS"
                />
                <span className="text-[9px] text-muted-foreground">Pré-preenchido da OS. Acrescente caracteres se necessário.</span>
              </div>
              <div>
                <Label className="text-[10px] uppercase">Observação</Label>
                <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Até 120 caracteres" maxLength={120} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px] uppercase">Usuário Final (Garantia)</Label>
                <Input
                  value={usuarioFinal}
                  onChange={(e) => setUsuarioFinal(removeAccents(e.target.value))}
                  className="h-8 text-sm"
                />
                <span className="text-[9px] text-muted-foreground">Sem caracteres especiais ou acentos</span>
              </div>
              <div>
                <Label className="text-[10px] uppercase">Iniciais (Personalização)</Label>
                <Input
                  value={inicialUsuario}
                  onChange={(e) => setInicialUsuario(removeAccents(e.target.value).toUpperCase().substring(0, 2))}
                  className="h-8 text-sm font-mono uppercase"
                  placeholder="Ex: HF"
                  maxLength={2}
                />
                <span className="text-[9px] text-muted-foreground">Máximo 2 caracteres</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] uppercase">Médico</Label>
                  <Input
                    value={nomeMedico}
                    onChange={(e) => setNomeMedico(e.target.value)}
                    className="h-8 text-sm"
                    placeholder="Nome do médico"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase">CRM</Label>
                  <Input
                    value={crmMedico}
                    onChange={(e) => setCrmMedico(e.target.value)}
                    className="h-8 text-sm font-mono"
                    placeholder="CRM"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase flex items-center gap-1">
                  <Ticket className="h-3 w-3" /> Voucher
                  {voucherSugerido && <Badge variant="outline" className="text-[9px] ml-1 bg-primary/10 text-primary border-primary/30">Sugerido</Badge>}
                </Label>
                <Input
                  value={voucher}
                  onChange={(e) => setVoucher(e.target.value)}
                  className="h-8 text-sm font-mono"
                  placeholder="Código do voucher (opcional)"
                />
                {voucherSugerido && voucher !== voucherSugerido && (
                  <button
                    onClick={() => setVoucher(voucherSugerido)}
                    className="text-[10px] text-primary hover:underline mt-0.5"
                  >
                    Usar voucher sugerido: {voucherSugerido}
                  </button>
                )}
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

      </div>
    </ScrollArea>

      {/* Sticky Footer — confirmações + enviar */}
      <div className="shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3 flex-wrap">
          {produtoSelecionado && autoFillSource && autoFillSource !== "manual" && (
            confirmedProduct ? (
              <button
                onClick={() => setConfirmedProduct(false)}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-500/20 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Produto ✓
              </button>
            ) : (
              <button
                onClick={() => setConfirmedProduct(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-500/20 transition-colors animate-pulse"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Confirmar Produto
              </button>
            )
          )}
          {prescriptionAutoFilled && (
            confirmedPrescription ? (
              <button
                onClick={() => setConfirmedPrescription(false)}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-500/20 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Prescrição ✓
              </button>
            ) : (
              <button
                onClick={() => setConfirmedPrescription(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-500/20 transition-colors animate-pulse"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Confirmar Prescrição
              </button>
            )
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Voltar</Button>
          <Button
            onClick={handleEnviarPedido}
            disabled={enviando || enviandoCooldown || !produtoSelecionado || !isReadyToSubmit}
            className="gap-2"
          >
            {enviando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
            ) : (
              <><Send className="h-4 w-4" /> Enviar Pedido</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PedidoFornecedorPage;
