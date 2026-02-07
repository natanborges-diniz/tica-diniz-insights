// src/pages/PedidoFornecedorPage.tsx
// Tela de criação de pedido para fornecedor (Hoya) — pré-preenchida com dados da receita

import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { OsHubRecord, fetchSingleOsRecipe } from "@/services/osHubService";
import {
  HoyaProduto,
  HoyaPedidoPayload,
  HoyaPedidoResponse,
  listarProdutosHoya,
  criarPedidoHoya,
} from "@/services/hoyaService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";

// ============================================
// HELPERS
// ============================================

function formatGrau(v: number | null): string {
  if (v === null || v === undefined) return "";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
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
  const [pedidoEnviado, setPedidoEnviado] = useState<HoyaPedidoResponse | null>(null);

  // Form state
  const [tipoServico, setTipoServico] = useState(4); // Sem montagem
  const [tipoArmacao, setTipoArmacao] = useState(1); // Plástica/Acetato
  const [observacao, setObservacao] = useState("");
  const [usuarioFinal, setUsuarioFinal] = useState("");

  // Prescricao editável
  const [prescOd, setPrescOd] = useState({
    esferico: "",
    cilindrico: "",
    eixo: "",
    adicao: "",
    dnpLonge: "",
    alturaPupilar: "",
  });
  const [prescOe, setPrescOe] = useState({
    esferico: "",
    cilindrico: "",
    eixo: "",
    adicao: "",
    dnpLonge: "",
    alturaPupilar: "",
  });

  // Armação editável
  const [armacao, setArmacao] = useState({
    larguraLente: "",
    alturaLente: "",
    ponteLente: "",
  });

  // ---- Load OS data ----
  useEffect(() => {
    if (!codOs) return;
    (async () => {
      setLoadingOs(true);
      try {
        const found = await fetchSingleOsRecipe(codOs, codEmpresa);
        if (found) {
          setOs(found);
          // Preencher prescrição
          setPrescOd({
            esferico: found.odLongeEsf != null ? String(found.odLongeEsf) : "",
            cilindrico: found.odLongeCil != null ? String(found.odLongeCil) : "",
            eixo: found.odLongeEixo != null ? String(found.odLongeEixo) : "",
            adicao: found.odAdicao != null ? String(found.odAdicao) : "",
            dnpLonge: found.odDnp != null ? String(found.odDnp) : "",
            alturaPupilar: found.odAltura != null ? String(found.odAltura) : "",
          });
          setPrescOe({
            esferico: found.oeLongeEsf != null ? String(found.oeLongeEsf) : "",
            cilindrico: found.oeLongeCil != null ? String(found.oeLongeCil) : "",
            eixo: found.oeLongeEixo != null ? String(found.oeLongeEixo) : "",
            adicao: found.oeAdicao != null ? String(found.oeAdicao) : "",
            dnpLonge: found.oeDnp != null ? String(found.oeDnp) : "",
            alturaPupilar: found.oeAltura != null ? String(found.oeAltura) : "",
          });
          // Armação
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

  // ---- Load Hoya products ----
  const handleCarregarProdutos = async () => {
    setLoadingProdutos(true);
    try {
      const prods = await listarProdutosHoya();
      setProdutos(Array.isArray(prods) ? prods : []);
      toast({ title: `${Array.isArray(prods) ? prods.length : 0} produtos carregados da Hoya` });
    } catch (err) {
      console.error("[PedidoFornecedor] Error loading products:", err);
      toast({
        title: "Erro ao carregar produtos",
        description: err instanceof Error ? err.message : "Verifique se a API Key da Hoya está configurada.",
        variant: "destructive",
      });
    } finally {
      setLoadingProdutos(false);
    }
  };

  // ---- Check for existing de/para ----
  useEffect(() => {
    if (!os?.lenteOdDescricao || produtos.length === 0) return;
    (async () => {
      const { data: depara } = await supabase
        .from("fornecedor_produto_depara")
        .select("*")
        .eq("fornecedor", "HOYA")
        .eq("descricao_local", os.lenteOdDescricao!)
        .maybeSingle();

      if (depara?.codigo_fornecedor) {
        const match = produtos.find(p => p.codigoProduto === depara.codigo_fornecedor);
        if (match) {
          setProdutoSelecionado(match);
          toast({ title: "Produto Hoya encontrado via DE/PARA", description: match.nome });
        }
      }
    })();
  }, [os?.lenteOdDescricao, produtos]);

  // ---- Filtered products ----
  const produtosFiltrados = buscaProduto.trim()
    ? produtos.filter(p =>
        p.nome.toLowerCase().includes(buscaProduto.toLowerCase()) ||
        String(p.codigoProduto).includes(buscaProduto)
      )
    : produtos.slice(0, 50);

  // ---- Submit order ----
  const handleEnviarPedido = async () => {
    if (!os) return;
    if (!produtoSelecionado) {
      toast({ title: "Selecione um produto Hoya", variant: "destructive" });
      return;
    }

    setEnviando(true);
    try {
      const payload: HoyaPedidoPayload = {
        os: String(os.numeroOs || os.codOs),
        observacao: observacao || undefined,
        especificacoes: {
          codigoProduto: produtoSelecionado.codigoProduto,
          tipoServico,
          codigoColoracao: null,
        },
        prescricao: {
          direito: {
            esferico: prescOd.esferico ? Number(prescOd.esferico) : null,
            cilindrico: prescOd.cilindrico ? Number(prescOd.cilindrico) : null,
            eixo: prescOd.eixo ? Number(prescOd.eixo) : null,
            adicao: prescOd.adicao ? Number(prescOd.adicao) : null,
            prismaH: null,
            basePRPrismaH: null,
            prismaV: null,
            basePRPrismaV: null,
            dnpLonge: prescOd.dnpLonge ? Number(prescOd.dnpLonge) : null,
            dnpPerto: null,
            alturaPupilar: prescOd.alturaPupilar ? Number(prescOd.alturaPupilar) : null,
          },
          esquerdo: {
            esferico: prescOe.esferico ? Number(prescOe.esferico) : null,
            cilindrico: prescOe.cilindrico ? Number(prescOe.cilindrico) : null,
            eixo: prescOe.eixo ? Number(prescOe.eixo) : null,
            adicao: prescOe.adicao ? Number(prescOe.adicao) : null,
            prismaH: null,
            basePRPrismaH: null,
            prismaV: null,
            basePRPrismaV: null,
            dnpLonge: prescOe.dnpLonge ? Number(prescOe.dnpLonge) : null,
            dnpPerto: null,
            alturaPupilar: prescOe.alturaPupilar ? Number(prescOe.alturaPupilar) : null,
          },
          afinamentoPrismatico: false,
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

      console.log("[PedidoFornecedor] Sending payload:", JSON.stringify(payload, null, 2));

      const resp = await criarPedidoHoya(payload, os.codOs, os.codEmpresa);
      setPedidoEnviado(resp);

      // Save de/para if not exists
      if (os.lenteOdDescricao && produtoSelecionado) {
        await supabase.from("fornecedor_produto_depara").upsert(
          {
            fornecedor: "HOYA",
            descricao_local: os.lenteOdDescricao,
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
                  <span className="text-sm">{os.lenteOdDescricao}</span>
                </div>
              )}
              {os.lenteOeDescricao && (
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 shrink-0">OE</Badge>
                  <span className="text-sm">{os.lenteOeDescricao}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Produto Hoya */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Glasses className="h-4 w-4" /> Produto Hoya
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCarregarProdutos}
                disabled={loadingProdutos}
              >
                {loadingProdutos ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
                {produtos.length > 0 ? "Recarregar" : "Carregar Catálogo"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {produtoSelecionado && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                <p className="font-medium text-sm">{produtoSelecionado.nome}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Código: {produtoSelecionado.codigoProduto}</span>
                  <span>•</span>
                  <span>{produtoSelecionado.tipoLente}</span>
                  <span>•</span>
                  <span>Tratamento: {produtoSelecionado.tratamento}</span>
                </div>
                {produtoSelecionado.precos?.length > 0 && (
                  <div className="flex gap-3 mt-1">
                    {produtoSelecionado.precos.slice(0, 2).map((p, i) => (
                      <span key={i} className="text-xs">
                        {p.lista.substring(0, 20)}: R$ {p.preco.toFixed(2)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {produtos.length > 0 && (
              <>
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
                      onClick={() => setProdutoSelecionado(p)}
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
              </>
            )}
          </CardContent>
        </Card>

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
                <div className="h-6 w-6 rounded-full bg-blue-500/15 text-blue-700 text-xs font-bold flex items-center justify-center">
                  OD
                </div>
                <span className="text-xs font-medium text-muted-foreground">Olho Direito</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {(["esferico", "cilindrico", "eixo", "adicao", "dnpLonge", "alturaPupilar"] as const).map(
                  (field) => (
                    <div key={field}>
                      <Label className="text-[10px] uppercase">{field === "dnpLonge" ? "DNP" : field === "alturaPupilar" ? "Altura" : field}</Label>
                      <Input
                        value={prescOd[field]}
                        onChange={(e) => setPrescOd((prev) => ({ ...prev, [field]: e.target.value }))}
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                  )
                )}
              </div>
            </div>
            <Separator />
            {/* OE */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-700 text-xs font-bold flex items-center justify-center">
                  OE
                </div>
                <span className="text-xs font-medium text-muted-foreground">Olho Esquerdo</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {(["esferico", "cilindrico", "eixo", "adicao", "dnpLonge", "alturaPupilar"] as const).map(
                  (field) => (
                    <div key={field}>
                      <Label className="text-[10px] uppercase">{field === "dnpLonge" ? "DNP" : field === "alturaPupilar" ? "Altura" : field}</Label>
                      <Input
                        value={prescOe[field]}
                        onChange={(e) => setPrescOe((prev) => ({ ...prev, [field]: e.target.value }))}
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                  )
                )}
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
                  <Input
                    value={armacao.larguraLente}
                    onChange={(e) => setArmacao((p) => ({ ...p, larguraLente: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Altura</Label>
                  <Input
                    value={armacao.alturaLente}
                    onChange={(e) => setArmacao((p) => ({ ...p, alturaLente: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase">Ponte</Label>
                  <Input
                    value={armacao.ponteLente}
                    onChange={(e) => setArmacao((p) => ({ ...p, ponteLente: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase">Tipo de Armação</Label>
                <Select value={String(tipoArmacao)} onValueChange={(v) => setTipoArmacao(Number(v))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
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
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
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
                <Input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Até 120 caracteres"
                  maxLength={120}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase">Usuário Final (Garantia)</Label>
                <Input
                  value={usuarioFinal}
                  onChange={(e) => setUsuarioFinal(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-8">
          <Button variant="outline" onClick={() => navigate("/os")}>
            Cancelar
          </Button>
          <Button
            onClick={handleEnviarPedido}
            disabled={enviando || !produtoSelecionado}
            className="gap-2"
          >
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Enviar Pedido
              </>
            )}
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
};

export default PedidoFornecedorPage;
