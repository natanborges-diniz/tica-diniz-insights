import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, Calendar, Store, Settings, Plus, Trash2, Save, 
  Building2, CalendarDays, AlertCircle, Target, Users, Copy
} from "lucide-react";
import { useCalendarioConfig } from "@/hooks/useCalendarioConfig";
import { useMetasVendas, VendedorOption } from "@/hooks/useMetasVendas";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { upsertMeta } from "@/services/metasService";

const MESES = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

export default function MetasConfigDashboard() {
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2];

  const {
    ano,
    setAno,
    periodos,
    feriados,
    lojasConfig,
    excecoes,
    empresas,
    loading: loadingCalendario,
    salvarPeriodo,
    salvarFeriado,
    excluirFeriado,
    configurarLojasEmLote,
    salvarExcecao,
    excluirExcecao,
  } = useCalendarioConfig();

  const {
    metas,
    vendedores,
    loading: loadingMetas,
    loadingVendedores,
    fetchMetas,
    fetchVendedores,
    excluirMeta,
  } = useMetasVendas();

  // Estado global da aba
  const [tabAtiva, setTabAtiva] = useState("metas-lojas");
  
  // ========== ESTADOS: METAS EM LOTE ==========
  const [lojasSelecionadas, setLojasSelecionadas] = useState<number[]>([]);
  const [mesesMeta, setMesesMeta] = useState<number[]>([mesAtual]);
  const [metaFaturamento, setMetaFaturamento] = useState("");
  const [metaTicketMedio, setMetaTicketMedio] = useState("");
  const [numVendedoresMeta, setNumVendedoresMeta] = useState("1");
  
  const [savingMetas, setSavingMetas] = useState(false);
  const [calcularAutomatico, setCalcularAutomatico] = useState(true);
  
  // Estado para loja base no cálculo automático de vendedores
  const [lojaBaseCalculo, setLojaBaseCalculo] = useState<number | null>(null);

  // ========== ESTADOS: METAS VENDEDOR ==========
  const [vendedoresSelecionados, setVendedoresSelecionados] = useState<number[]>([]);
  const [empresaFiltro, setEmpresaFiltro] = useState<number | 'ALL'>('ALL');

  // ========== ESTADOS: PERÍODOS ==========
  const [novoPeriodo, setNovoPeriodo] = useState({
    mes: 1,
    diaInicio: 1,
    diaFim: 31,
    mesInicio: null as number | null,
    mesFim: null as number | null,
    descricao: "",
  });

  // ========== ESTADOS: FERIADOS ==========
  const [novoFeriado, setNovoFeriado] = useState({
    data: "",
    descricao: "",
    tipo: "NACIONAL" as 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL',
    recorrente: true,
  });

  // ========== ESTADOS: CONFIG LOJAS ==========
  const [lojasParaConfigurar, setLojasParaConfigurar] = useState<number[]>([]);
  const [configLote, setConfigLote] = useState({
    tipoLoja: "RUA" as 'RUA' | 'SHOPPING',
    abreDomingo: false,
    abreFeriado: false,
    numVendedores: 1,
    percentualAceitavel: 100,
  });

  // ========== ESTADOS: EXCEÇÕES ==========
  const [novaExcecao, setNovaExcecao] = useState({
    codEmpresa: null as number | null,
    data: "",
    aberto: true,
    motivo: "",
  });

  // Carregar vendedores ao mudar filtro
  useEffect(() => {
    fetchVendedores(empresaFiltro);
  }, [empresaFiltro, fetchVendedores]);

  // Carregar metas ao mudar aba
  useEffect(() => {
    if (tabAtiva === "metas-lojas" || tabAtiva === "metas-vendedores") {
      fetchMetas();
    }
  }, [tabAtiva, fetchMetas]);

  // ========== HANDLERS: METAS EM LOTE ==========
  const toggleLojaMeta = (codEmpresa: number) => {
    setLojasSelecionadas(prev => 
      prev.includes(codEmpresa)
        ? prev.filter(c => c !== codEmpresa)
        : [...prev, codEmpresa]
    );
  };

  const selecionarTodasLojas = () => {
    if (lojasSelecionadas.length === empresas.length) {
      setLojasSelecionadas([]);
    } else {
      setLojasSelecionadas(empresas.map(e => e.codEmpresa));
    }
  };

  const handleSalvarMetasEmLote = async () => {
    if (lojasSelecionadas.length === 0) {
      toast.error("Selecione pelo menos uma loja");
      return;
    }
    if (mesesMeta.length === 0) {
      toast.error("Selecione pelo menos um mês");
      return;
    }
    
    setSavingMetas(true);
    try {
      const promises: Promise<boolean>[] = [];
      
      for (const codEmpresa of lojasSelecionadas) {
        const empresa = empresas.find(e => e.codEmpresa === codEmpresa);
        const metaLoja = Number(metaFaturamento) || 0;
        
        for (const mes of mesesMeta) {
          // Meta da Loja com num_vendedores
          promises.push(upsertMeta({
            tipo: 'LOJA',
            codReferencia: codEmpresa,
            nomeReferencia: empresa?.nome || null,
            ano,
            mes,
            metaFaturamento: metaLoja,
            metaTicketMedio: Number(metaTicketMedio) || 0,
            metaDescontoMax: 0,
            metaQtdVendas: 0,
            numVendedores: Number(numVendedoresMeta) || 1,
          }));
        }
      }
      
      await Promise.all(promises);
      toast.success(`Metas salvas para ${lojasSelecionadas.length} loja(s) em ${mesesMeta.length} mês(es)!`);
      setLojasSelecionadas([]);
      setMetaFaturamento("");
      setMetaTicketMedio("");
      setNumVendedoresMeta("1");
      fetchMetas();
    } catch (err) {
      toast.error("Erro ao salvar metas");
    } finally {
      setSavingMetas(false);
    }
  };

  // Toggle mês na seleção múltipla
  const toggleMesMeta = (mes: number) => {
    setMesesMeta(prev => 
      prev.includes(mes)
        ? prev.filter(m => m !== mes)
        : [...prev, mes].sort((a, b) => a - b)
    );
  };

  const selecionarTodosMeses = () => {
    if (mesesMeta.length === 12) {
      setMesesMeta([mesAtual]);
    } else {
      setMesesMeta([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
  };

  // ========== HANDLERS: METAS VENDEDOR EM LOTE ==========
  const toggleVendedorMeta = (codVendedor: number) => {
    setVendedoresSelecionados(prev => 
      prev.includes(codVendedor)
        ? prev.filter(c => c !== codVendedor)
        : [...prev, codVendedor]
    );
  };

  // Função para calcular meta do vendedor baseado na loja selecionada
  const calcularMetaVendedor = (codEmpresa: number, mes: number): { faturamento: number; ticketMedio: number } => {
    // Buscar meta da loja para o período (já inclui numVendedores)
    const metaLoja = metas.find(m => 
      m.tipo === 'LOJA' && 
      m.codReferencia === codEmpresa && 
      m.ano === ano && 
      m.mes === mes
    );
    
    if (!metaLoja) {
      return { faturamento: 0, ticketMedio: 0 };
    }
    
    const numVendedores = metaLoja.numVendedores || 1;
    
    return {
      faturamento: Math.round((metaLoja.metaFaturamento || 0) / numVendedores),
      ticketMedio: metaLoja.metaTicketMedio || 0, // Ticket médio não divide
    };
  };

  const handleSalvarMetasVendedorEmLote = async () => {
    if (vendedoresSelecionados.length === 0) {
      toast.error("Selecione pelo menos um vendedor");
      return;
    }
    if (mesesMeta.length === 0) {
      toast.error("Selecione pelo menos um mês");
      return;
    }
    
    // Verificar se há loja base selecionada quando cálculo automático
    if (calcularAutomatico && !lojaBaseCalculo) {
      toast.error("Selecione a loja base para cálculo automático");
      return;
    }
    
    // Verificar se há metas de lojas cadastradas para calcular automaticamente
    if (calcularAutomatico && lojaBaseCalculo) {
      const mesesSemMeta: string[] = [];
      for (const mes of mesesMeta) {
        const metaCalc = calcularMetaVendedor(lojaBaseCalculo, mes);
        if (metaCalc.faturamento === 0) {
          mesesSemMeta.push(MESES.find(m => m.value === mes)?.label || String(mes));
        }
      }
      if (mesesSemMeta.length > 0) {
        toast.warning(`Meta da loja não cadastrada para: ${mesesSemMeta.join(", ")}`);
      }
    }
    
    setSavingMetas(true);
    try {
      const promises: Promise<boolean>[] = [];
      
      for (const codVendedor of vendedoresSelecionados) {
        const vendedor = vendedores.find(v => v.codVendedor === codVendedor);
        if (!vendedor) continue;
        
        for (const mes of mesesMeta) {
          let faturamento = Number(metaFaturamento) || 0;
          let ticketMedio = Number(metaTicketMedio) || 0;
          
          // Se cálculo automático ativado, usa meta da loja selecionada / num vendedores
          if (calcularAutomatico && lojaBaseCalculo) {
            const metaCalc = calcularMetaVendedor(lojaBaseCalculo, mes);
            faturamento = metaCalc.faturamento;
            ticketMedio = metaCalc.ticketMedio;
          }
          
          promises.push(upsertMeta({
            tipo: 'VENDEDOR',
            codReferencia: codVendedor,
            nomeReferencia: vendedor?.nome || null,
            ano,
            mes,
            metaFaturamento: faturamento,
            metaTicketMedio: ticketMedio,
            metaDescontoMax: 0,
            metaQtdVendas: 0,
            numVendedores: 1,
          }));
        }
      }
      
      await Promise.all(promises);
      toast.success(`Metas salvas para ${vendedoresSelecionados.length} vendedor(es) em ${mesesMeta.length} mês(es)!`);
      setVendedoresSelecionados([]);
      if (!calcularAutomatico) {
        setMetaFaturamento("");
        setMetaTicketMedio("");
      }
      fetchMetas();
    } catch (err) {
      toast.error("Erro ao salvar metas");
    } finally {
      setSavingMetas(false);
    }
  };

  // ========== HANDLERS: PERÍODOS ==========
  const handleSalvarPeriodo = async () => {
    await salvarPeriodo({
      ano,
      mes: novoPeriodo.mes,
      diaInicio: novoPeriodo.diaInicio,
      diaFim: novoPeriodo.diaFim,
      mesInicio: novoPeriodo.mesInicio,
      mesFim: novoPeriodo.mesFim,
      descricao: novoPeriodo.descricao || null,
    });
  };

  // ========== HANDLERS: FERIADOS ==========
  const handleSalvarFeriado = async () => {
    if (!novoFeriado.data || !novoFeriado.descricao) return;
    await salvarFeriado({
      data: novoFeriado.data,
      descricao: novoFeriado.descricao,
      tipo: novoFeriado.tipo,
      uf: null,
      cidade: null,
      recorrente: novoFeriado.recorrente,
    });
    setNovoFeriado({ data: "", descricao: "", tipo: "NACIONAL", recorrente: true });
  };

  // ========== HANDLERS: CONFIG LOJAS ==========
  const toggleLojaConfig = (codEmpresa: number) => {
    setLojasParaConfigurar(prev => 
      prev.includes(codEmpresa)
        ? prev.filter(c => c !== codEmpresa)
        : [...prev, codEmpresa]
    );
  };

  const handleConfigurarLojasEmLote = async () => {
    if (lojasParaConfigurar.length === 0) return;
    await configurarLojasEmLote(lojasParaConfigurar, configLote);
    setLojasParaConfigurar([]);
  };

  // ========== HANDLERS: EXCEÇÕES ==========
  const handleSalvarExcecao = async () => {
    if (!novaExcecao.codEmpresa || !novaExcecao.data) return;
    await salvarExcecao({
      codEmpresa: novaExcecao.codEmpresa,
      data: novaExcecao.data,
      aberto: novaExcecao.aberto,
      motivo: novaExcecao.motivo || null,
    });
    setNovaExcecao({ codEmpresa: null, data: "", aberto: true, motivo: "" });
  };

  const loading = loadingCalendario;

  // Metas já cadastradas para os períodos selecionados
  const metasLojas = metas.filter(m => m.tipo === 'LOJA' && m.ano === ano && mesesMeta.includes(m.mes));
  const metasVendedores = metas.filter(m => m.tipo === 'VENDEDOR' && m.ano === ano && mesesMeta.includes(m.mes));

  // Vendedores filtrados por empresa
  const vendedoresFiltrados = empresaFiltro === 'ALL' 
    ? vendedores 
    : vendedores.filter(v => v.codEmpresa === empresaFiltro);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">Configurações de Metas</h1>
                  <p className="text-sm text-muted-foreground">
                    Metas, períodos, feriados e regras de funcionamento
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Ano:</Label>
                <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map(a => (
                      <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="container mx-auto px-4 py-6">
        {loading ? (
          <Skeleton className="h-96" />
        ) : (
          <Tabs value={tabAtiva} onValueChange={setTabAtiva} className="space-y-6">
            <TabsList className="grid w-full grid-cols-6 h-auto">
              <TabsTrigger value="metas-lojas" className="flex flex-col gap-1 py-2">
                <Target className="h-4 w-4" />
                <span className="text-xs">Metas Lojas</span>
              </TabsTrigger>
              <TabsTrigger value="metas-vendedores" className="flex flex-col gap-1 py-2">
                <Users className="h-4 w-4" />
                <span className="text-xs">Metas Vendedores</span>
              </TabsTrigger>
              <TabsTrigger value="periodos" className="flex flex-col gap-1 py-2">
                <CalendarDays className="h-4 w-4" />
                <span className="text-xs">Períodos</span>
              </TabsTrigger>
              <TabsTrigger value="feriados" className="flex flex-col gap-1 py-2">
                <Calendar className="h-4 w-4" />
                <span className="text-xs">Feriados</span>
              </TabsTrigger>
              <TabsTrigger value="lojas" className="flex flex-col gap-1 py-2">
                <Store className="h-4 w-4" />
                <span className="text-xs">Tipo de Lojas</span>
              </TabsTrigger>
              <TabsTrigger value="excecoes" className="flex flex-col gap-1 py-2">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs">Exceções</span>
              </TabsTrigger>
            </TabsList>

            {/* ========== METAS DE LOJAS EM LOTE ========== */}
            <TabsContent value="metas-lojas">
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Seleção de Lojas */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Selecione as Lojas</CardTitle>
                        <CardDescription>
                          Clique nas lojas para aplicar metas em lote
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={selecionarTodasLojas}>
                        {lojasSelecionadas.length === empresas.length ? "Desmarcar Todas" : "Selecionar Todas"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {empresas.map(emp => {
                        const metaExistente = metasLojas.find(m => m.codReferencia === emp.codEmpresa);
                        const config = lojasConfig.find(c => c.codEmpresa === emp.codEmpresa);
                        const selecionada = lojasSelecionadas.includes(emp.codEmpresa);
                        
                        return (
                          <div 
                            key={emp.codEmpresa}
                            onClick={() => toggleLojaMeta(emp.codEmpresa)}
                            className={`
                              flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-all
                              ${selecionada ? 'bg-primary/10 border-primary ring-2 ring-primary/20' : 'hover:bg-muted'}
                            `}
                          >
                            <Checkbox checked={selecionada} />
                            <div className="text-sm">
                              <p className="font-medium">{emp.nome}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {config && (
                                  <Badge variant="outline" className="text-xs">
                                    {config.tipoLoja}
                                  </Badge>
                                )}
                                {metaExistente && (
                                  <Badge variant="secondary" className="text-xs">
                                    Meta: R$ {metaExistente.metaFaturamento?.toLocaleString('pt-BR')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Formulário de Meta */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Definir Meta
                    </CardTitle>
                    <CardDescription>
                      {lojasSelecionadas.length > 0 
                        ? `${lojasSelecionadas.length} loja(s) selecionada(s)` 
                        : "Selecione lojas ao lado"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Meses</Label>
                        <Button variant="link" size="sm" className="h-auto p-0" onClick={selecionarTodosMeses}>
                          {mesesMeta.length === 12 ? "Limpar" : "Todos"}
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {MESES.map(m => (
                          <Badge
                            key={m.value}
                            variant={mesesMeta.includes(m.value) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => toggleMesMeta(m.value)}
                          >
                            {m.label.substring(0, 3)}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Meta Faturamento (R$)</Label>
                      <Input 
                        type="number"
                        step="0.01"
                        min="0"
                        value={metaFaturamento}
                        onChange={(e) => setMetaFaturamento(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Meta Ticket Médio (R$)</Label>
                      <Input 
                        type="number"
                        step="0.01"
                        min="0"
                        value={metaTicketMedio}
                        onChange={(e) => setMetaTicketMedio(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Nº de Vendedores</Label>
                      <Input 
                        type="number"
                        min="1"
                        value={numVendedoresMeta}
                        onChange={(e) => setNumVendedoresMeta(e.target.value)}
                        placeholder="1"
                      />
                      <p className="text-xs text-muted-foreground">
                        Para cálculo da meta individual por vendedor
                      </p>
                    </div>

                    <Button 
                      onClick={handleSalvarMetasEmLote} 
                      disabled={lojasSelecionadas.length === 0 || savingMetas}
                      className="w-full"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {savingMetas ? "Salvando..." : `Salvar para ${lojasSelecionadas.length} Loja(s)`}
                    </Button>
                  </CardContent>
                </Card>

                {/* Metas já cadastradas */}
                {metasLojas.length > 0 && (
                  <Card className="lg:col-span-3">
                    <CardHeader>
                      <CardTitle>
                        Metas de Lojas - {mesesMeta.length === 1 
                          ? MESES.find(m => m.value === mesesMeta[0])?.label 
                          : `${mesesMeta.length} meses`} {ano}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Loja</TableHead>
                            <TableHead>Mês</TableHead>
                            <TableHead className="text-right">Faturamento</TableHead>
                            <TableHead className="text-right">Ticket Médio</TableHead>
                            <TableHead className="text-center">Nº Vend.</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metasLojas.map(m => (
                            <TableRow key={m.id}>
                              <TableCell className="font-medium">{m.nomeReferencia}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{MESES.find(mes => mes.value === m.mes)?.label.substring(0, 3)}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                R$ {m.metaFaturamento?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right">
                                R$ {m.metaTicketMedio?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">{m.numVendedores || 1}</Badge>
                              </TableCell>
                              <TableCell>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta ação não pode ser desfeita.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => excluirMeta(m.id)}>
                                        Excluir
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* ========== METAS DE VENDEDORES EM LOTE ========== */}
            <TabsContent value="metas-vendedores">
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Seleção de Vendedores */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Selecione os Vendedores</CardTitle>
                        <CardDescription>
                          Filtre por loja e selecione os vendedores
                        </CardDescription>
                      </div>
                      <Select value={empresaFiltro === 'ALL' ? 'ALL' : String(empresaFiltro)} onValueChange={(v) => setEmpresaFiltro(v === 'ALL' ? 'ALL' : Number(v))}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Filtrar por loja..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">Todas as lojas</SelectItem>
                          {empresas.map(emp => (
                            <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                              {emp.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingVendedores ? (
                      <Skeleton className="h-32" />
                    ) : vendedoresFiltrados.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        Nenhum vendedor encontrado. Vendedores ativos nos últimos 3 meses serão listados.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {vendedoresFiltrados.map(v => {
                          const metaExistente = metasVendedores.find(m => m.codReferencia === v.codVendedor);
                          const selecionado = vendedoresSelecionados.includes(v.codVendedor);
                          
                          return (
                            <div 
                              key={v.codVendedor}
                              onClick={() => toggleVendedorMeta(v.codVendedor)}
                              className={`
                                flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-all
                                ${selecionado ? 'bg-primary/10 border-primary ring-2 ring-primary/20' : 'hover:bg-muted'}
                              `}
                            >
                              <Checkbox checked={selecionado} />
                              <div className="text-sm">
                                <p className="font-medium">{v.nome}</p>
                                {metaExistente && (
                                  <Badge variant="secondary" className="text-xs mt-1">
                                    Meta: R$ {metaExistente.metaFaturamento?.toLocaleString('pt-BR')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Formulário de Meta Vendedor */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Definir Meta
                    </CardTitle>
                    <CardDescription>
                      {vendedoresSelecionados.length > 0 
                        ? `${vendedoresSelecionados.length} vendedor(es) selecionado(s)` 
                        : "Selecione vendedores ao lado"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Meses</Label>
                        <Button variant="link" size="sm" className="h-auto p-0" onClick={selecionarTodosMeses}>
                          {mesesMeta.length === 12 ? "Limpar" : "Todos"}
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {MESES.map(m => (
                          <Badge
                            key={m.value}
                            variant={mesesMeta.includes(m.value) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => toggleMesMeta(m.value)}
                          >
                            {m.label.substring(0, 3)}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <Label>Calcular automaticamente</Label>
                        <p className="text-xs text-muted-foreground">
                          Meta Loja ÷ Nº de Vendedores
                        </p>
                      </div>
                      <Switch 
                        checked={calcularAutomatico}
                        onCheckedChange={setCalcularAutomatico}
                      />
                    </div>

                    {calcularAutomatico && (
                      <div className="space-y-2">
                        <Label>Loja Base para Cálculo *</Label>
                        <Select 
                          value={lojaBaseCalculo ? String(lojaBaseCalculo) : ""} 
                          onValueChange={(v) => setLojaBaseCalculo(Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a loja..." />
                          </SelectTrigger>
                          <SelectContent>
                            {empresas.map(emp => {
                              const metaLoja = metas.find(m => 
                                m.tipo === 'LOJA' && 
                                m.codReferencia === emp.codEmpresa && 
                                m.ano === ano && 
                                mesesMeta.includes(m.mes)
                              );
                              return (
                                <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                                  {emp.nome} {metaLoja ? `(${metaLoja.numVendedores || 1} vend.)` : ''}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          A meta será dividida pelo Nº de vendedores configurado na meta da loja
                        </p>
                      </div>
                    )}

                    {!calcularAutomatico && (
                      <>
                        <div className="space-y-2">
                          <Label>Meta Faturamento (R$)</Label>
                          <Input 
                            type="number"
                            step="0.01"
                            min="0"
                            value={metaFaturamento}
                            onChange={(e) => setMetaFaturamento(e.target.value)}
                            placeholder="0,00"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Meta Ticket Médio (R$)</Label>
                          <Input 
                            type="number"
                            step="0.01"
                            min="0"
                            value={metaTicketMedio}
                            onChange={(e) => setMetaTicketMedio(e.target.value)}
                            placeholder="0,00"
                          />
                        </div>

                      </>
                    )}

                    {calcularAutomatico && lojaBaseCalculo && vendedoresSelecionados.length > 0 && (
                      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-1 text-sm">
                        <p className="font-medium text-primary">Prévia do cálculo:</p>
                        {vendedoresSelecionados.slice(0, 3).map(codVendedor => {
                          const vendedor = vendedores.find(v => v.codVendedor === codVendedor);
                          if (!vendedor) return null;
                          const metaCalc = calcularMetaVendedor(lojaBaseCalculo, mesesMeta[0] || mesAtual);
                          return (
                            <p key={codVendedor} className="text-muted-foreground">
                              {vendedor.nome}: R$ {metaCalc.faturamento.toLocaleString('pt-BR')}
                            </p>
                          );
                        })}
                        {vendedoresSelecionados.length > 3 && (
                          <p className="text-muted-foreground">... e mais {vendedoresSelecionados.length - 3}</p>
                        )}
                      </div>
                    )}

                    <Button 
                      onClick={handleSalvarMetasVendedorEmLote} 
                      disabled={vendedoresSelecionados.length === 0 || savingMetas}
                      className="w-full"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {savingMetas ? "Salvando..." : `Salvar para ${vendedoresSelecionados.length} Vendedor(es)`}
                    </Button>
                  </CardContent>
                </Card>

                {/* Metas de Vendedores já cadastradas */}
                {metasVendedores.length > 0 && (
                  <Card className="lg:col-span-3">
                    <CardHeader>
                      <CardTitle>
                        Metas de Vendedores - {mesesMeta.length === 1 
                          ? MESES.find(m => m.value === mesesMeta[0])?.label 
                          : `${mesesMeta.length} meses`} {ano}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Vendedor</TableHead>
                            <TableHead>Mês</TableHead>
                            <TableHead className="text-right">Faturamento</TableHead>
                            <TableHead className="text-right">Ticket Médio</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metasVendedores.map(m => (
                            <TableRow key={m.id}>
                              <TableCell className="font-medium">{m.nomeReferencia}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{MESES.find(mes => mes.value === m.mes)?.label.substring(0, 3)}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                R$ {m.metaFaturamento?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right">
                                R$ {m.metaTicketMedio?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta ação não pode ser desfeita.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => excluirMeta(m.id)}>
                                        Excluir
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* ========== PERÍODOS ========== */}
            <TabsContent value="periodos">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Configurar Período do Mês</CardTitle>
                    <CardDescription>
                      Defina o dia de início e fim para cada mês (ex: 21/11 a 20/12)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Mês de Referência</Label>
                        <Select 
                          value={String(novoPeriodo.mes)} 
                          onValueChange={(v) => setNovoPeriodo(p => ({ ...p, mes: Number(v) }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MESES.map(m => (
                              <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Descrição (opcional)</Label>
                        <Input 
                          placeholder="Ex: Black Friday"
                          value={novoPeriodo.descricao}
                          onChange={(e) => setNovoPeriodo(p => ({ ...p, descricao: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Dia Início</Label>
                        <Input 
                          type="number"
                          min={1}
                          max={31}
                          value={novoPeriodo.diaInicio}
                          onChange={(e) => setNovoPeriodo(p => ({ ...p, diaInicio: Number(e.target.value) }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mês do Início (opcional)</Label>
                        <Select 
                          value={novoPeriodo.mesInicio ? String(novoPeriodo.mesInicio) : "mesmo"} 
                          onValueChange={(v) => setNovoPeriodo(p => ({ ...p, mesInicio: v === "mesmo" ? null : Number(v) }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Mesmo mês" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mesmo">Mesmo mês</SelectItem>
                            {MESES.map(m => (
                              <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Dia Fim</Label>
                        <Input 
                          type="number"
                          min={1}
                          max={31}
                          value={novoPeriodo.diaFim}
                          onChange={(e) => setNovoPeriodo(p => ({ ...p, diaFim: Number(e.target.value) }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mês do Fim (opcional)</Label>
                        <Select 
                          value={novoPeriodo.mesFim ? String(novoPeriodo.mesFim) : "mesmo"} 
                          onValueChange={(v) => setNovoPeriodo(p => ({ ...p, mesFim: v === "mesmo" ? null : Number(v) }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Mesmo mês" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mesmo">Mesmo mês</SelectItem>
                            {MESES.map(m => (
                              <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button onClick={handleSalvarPeriodo} className="w-full">
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Período
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Períodos Configurados - {ano}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {periodos.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">
                        Nenhum período configurado. Use o padrão (1º ao último dia do mês).
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mês</TableHead>
                            <TableHead>Período</TableHead>
                            <TableHead>Descrição</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {periodos.map(p => (
                            <TableRow key={p.id}>
                              <TableCell>{MESES.find(m => m.value === p.mes)?.label}</TableCell>
                              <TableCell>
                                {p.diaInicio}/{p.mesInicio || p.mes} a {p.diaFim}/{p.mesFim || p.mes}
                              </TableCell>
                              <TableCell>{p.descricao || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ========== FERIADOS ========== */}
            <TabsContent value="feriados">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Adicionar Feriado</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input 
                        type="date"
                        value={novoFeriado.data}
                        onChange={(e) => setNovoFeriado(f => ({ ...f, data: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Input 
                        placeholder="Ex: Natal"
                        value={novoFeriado.descricao}
                        onChange={(e) => setNovoFeriado(f => ({ ...f, descricao: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select 
                        value={novoFeriado.tipo} 
                        onValueChange={(v) => setNovoFeriado(f => ({ ...f, tipo: v as any }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NACIONAL">Nacional</SelectItem>
                          <SelectItem value="ESTADUAL">Estadual</SelectItem>
                          <SelectItem value="MUNICIPAL">Municipal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="recorrente"
                        checked={novoFeriado.recorrente}
                        onCheckedChange={(v) => setNovoFeriado(f => ({ ...f, recorrente: v }))}
                      />
                      <Label htmlFor="recorrente">Repete todo ano</Label>
                    </div>
                    <Button onClick={handleSalvarFeriado} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Feriado
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Feriados Cadastrados</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {feriados.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">
                        Nenhum feriado cadastrado.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {feriados.map(f => (
                            <TableRow key={f.id}>
                              <TableCell>
                                {new Date(f.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                                {f.recorrente && <Badge variant="outline" className="ml-2">Anual</Badge>}
                              </TableCell>
                              <TableCell>{f.descricao}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{f.tipo}</Badge>
                              </TableCell>
                              <TableCell>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Excluir feriado?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta ação não pode ser desfeita.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => excluirFeriado(f.id)}>
                                        Excluir
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ========== REGRAS DE LOJAS ========== */}
            <TabsContent value="lojas">
              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Configuração das Lojas</CardTitle>
                    <CardDescription>
                      Selecione as lojas e aplique as regras de funcionamento em lote
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {empresas.map(emp => {
                          const config = lojasConfig.find(c => c.codEmpresa === emp.codEmpresa);
                          return (
                            <div 
                              key={emp.codEmpresa}
                              onClick={() => toggleLojaConfig(emp.codEmpresa)}
                              className={`
                                flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors
                                ${lojasParaConfigurar.includes(emp.codEmpresa) ? 'bg-primary/10 border-primary' : 'hover:bg-muted'}
                              `}
                            >
                              <Checkbox 
                                checked={lojasParaConfigurar.includes(emp.codEmpresa)}
                              />
                              <div className="text-sm">
                                <p className="font-medium">{emp.nome}</p>
                                {config && (
                                  <p className="text-xs text-muted-foreground">
                                    {config.tipoLoja} • {config.numVendedores} vend. • {config.percentualAceitavel}% mín
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {lojasParaConfigurar.length > 0 && (
                        <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                          <p className="text-sm font-medium">
                            {lojasParaConfigurar.length} loja(s) selecionada(s)
                          </p>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Tipo de Loja</Label>
                              <Select 
                                value={configLote.tipoLoja} 
                                onValueChange={(v) => setConfigLote(c => ({ ...c, tipoLoja: v as any }))}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="RUA">Loja de Rua</SelectItem>
                                  <SelectItem value="SHOPPING">Loja de Shopping</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Nº de Vendedores</Label>
                              <Input 
                                type="number"
                                min={1}
                                value={configLote.numVendedores}
                                onChange={(e) => setConfigLote(c => ({ ...c, numVendedores: Number(e.target.value) || 1 }))}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>% Mínimo Aceitável</Label>
                              <Input 
                                type="number"
                                min={0}
                                max={100}
                                value={configLote.percentualAceitavel}
                                onChange={(e) => setConfigLote(c => ({ ...c, percentualAceitavel: Number(e.target.value) || 100 }))}
                              />
                              <p className="text-xs text-muted-foreground">Ex: 90 = aceita a partir de 90% da meta</p>
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center space-x-2">
                                <Switch
                                  id="abreDomingo"
                                  checked={configLote.abreDomingo}
                                  onCheckedChange={(v) => setConfigLote(c => ({ ...c, abreDomingo: v }))}
                                />
                                <Label htmlFor="abreDomingo">Abre Domingo</Label>
                              </div>

                              <div className="flex items-center space-x-2">
                                <Switch
                                  id="abreFeriado"
                                  checked={configLote.abreFeriado}
                                  onCheckedChange={(v) => setConfigLote(c => ({ ...c, abreFeriado: v }))}
                                />
                                <Label htmlFor="abreFeriado">Abre Feriado</Label>
                              </div>
                            </div>
                          </div>

                          <Button onClick={handleConfigurarLojasEmLote} className="w-full">
                            <Save className="h-4 w-4 mr-2" />
                            Aplicar Configuração
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Resumo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Lojas de Rua</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {lojasConfig.filter(c => c.tipoLoja === 'RUA').length}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Geralmente fecham domingos e feriados
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Lojas de Shopping</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {lojasConfig.filter(c => c.tipoLoja === 'SHOPPING').length}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Geralmente abrem domingos e feriados
                      </p>
                    </div>

                    <div className="space-y-2">
                      <span className="text-sm text-muted-foreground">Sem configuração</span>
                      <p className="text-2xl font-bold">
                        {empresas.length - lojasConfig.length}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ========== EXCEÇÕES ========== */}
            <TabsContent value="excecoes">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Adicionar Exceção</CardTitle>
                    <CardDescription>
                      Defina datas específicas em que uma loja abre ou fecha diferente do padrão
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Loja</Label>
                      <Select 
                        value={novaExcecao.codEmpresa ? String(novaExcecao.codEmpresa) : ""} 
                        onValueChange={(v) => setNovaExcecao(e => ({ ...e, codEmpresa: Number(v) }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a loja..." />
                        </SelectTrigger>
                        <SelectContent>
                          {empresas.map(emp => (
                            <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                              {emp.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input 
                        type="date"
                        value={novaExcecao.data}
                        onChange={(e) => setNovaExcecao(ex => ({ ...ex, data: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="aberto"
                        checked={novaExcecao.aberto}
                        onCheckedChange={(v) => setNovaExcecao(ex => ({ ...ex, aberto: v }))}
                      />
                      <Label htmlFor="aberto">
                        {novaExcecao.aberto ? "Loja ABERTA nesta data" : "Loja FECHADA nesta data"}
                      </Label>
                    </div>
                    <div className="space-y-2">
                      <Label>Motivo (opcional)</Label>
                      <Input 
                        placeholder="Ex: Inventário"
                        value={novaExcecao.motivo}
                        onChange={(e) => setNovaExcecao(ex => ({ ...ex, motivo: e.target.value }))}
                      />
                    </div>
                    <Button onClick={handleSalvarExcecao} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Exceção
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Exceções Cadastradas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {excecoes.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">
                        Nenhuma exceção cadastrada.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Loja</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {excecoes.map(e => {
                            const empresa = empresas.find(emp => emp.codEmpresa === e.codEmpresa);
                            return (
                              <TableRow key={e.id}>
                                <TableCell>{empresa?.nome || e.codEmpresa}</TableCell>
                                <TableCell>
                                  {new Date(e.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={e.aberto ? "default" : "destructive"}>
                                    {e.aberto ? "ABERTA" : "FECHADA"}
                                  </Badge>
                                  {e.motivo && (
                                    <p className="text-xs text-muted-foreground mt-1">{e.motivo}</p>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Excluir exceção?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Esta ação não pode ser desfeita.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => excluirExcecao(e.id)}>
                                          Excluir
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
