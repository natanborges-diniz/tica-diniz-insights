import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useModuleInsights } from "@/hooks/useModuleInsights";
import { ModuleInsightsPanel } from "@/components/ia/ModuleInsightsPanel";
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
  Building2, CalendarDays, AlertCircle, Target, Users, Copy,
  CalendarRange, BadgePercent
} from "lucide-react";
import { MetasSemanaisTab } from "@/components/metas/MetasSemanaisTab";
import { GruposTab } from "@/components/metas/GruposTab";
import { ComissoesPremiosTab } from "@/components/metas/ComissoesPremiosTab";
import { useCalendarioConfig } from "@/hooks/useCalendarioConfig";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { upsertMeta } from "@/services/metasService";
import { ActionBar, ActionBarStatus } from "@/components/system/ActionBar";
import { useDirtyGuard } from "@/components/system/dirty/useDirtyGuard";

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

  // Estado global da aba
  const [tabAtiva, setTabAtiva] = useState("semanas");
  
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

  // ========== DIRTY GUARD + ACTIONBAR ==========
  const { isDirty, setDirty, setClean, guardClose } = useDirtyGuard();
  const [actionStatus, setActionStatus] = useState<ActionBarStatus>("idle");
  const configInsights = useModuleInsights({ module: "config" });

  // As abas restantes salvam imediatamente — sem estado dirty por aba.
  const computedDirty = false;

  useEffect(() => {
    if (computedDirty) setDirty();
    else setClean();
  }, [computedDirty, setDirty, setClean]);

  // Guard tab change
  const handleTabChange = useCallback((newTab: string) => {
    if (isDirty) {
      const confirmed = window.confirm("Existem alterações não salvas. Deseja sair sem salvar?");
      if (!confirmed) return;
    }
    // Clear selections when switching tabs
    clearCurrentTabSelections();
    setTabAtiva(newTab);
  }, [isDirty]);

  // Guard ano change
  const handleAnoChange = useCallback((newAno: number) => {
    if (isDirty) {
      const confirmed = window.confirm("Existem alterações não salvas. Deseja sair sem salvar?");
      if (!confirmed) return;
    }
    clearCurrentTabSelections();
    setAno(newAno);
  }, [isDirty, setAno]);

  const clearCurrentTabSelections = () => {
    setActionStatus("idle");
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

  // ========== ACTIONBAR HANDLERS ==========
  const handleActionBarSave = () => {};

  const handleActionBarCancel = () => {
    clearCurrentTabSelections();
  };

  const actionBarLabel = "Salvar";

  const loading = loadingCalendario;

  return (
    <div className="min-h-screen bg-background pb-16">
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
                <Select value={String(ano)} onValueChange={(v) => handleAnoChange(Number(v))}>
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
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* IA Insights */}
        <ModuleInsightsPanel
          insights={configInsights.insights}
          loading={configInsights.loading}
          error={configInsights.error}
          onRetry={configInsights.refetch}
        />

        {loading ? (
          <Skeleton className="h-96" />
        ) : (
          <Tabs value={tabAtiva} onValueChange={handleTabChange} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 h-auto">
              <TabsTrigger value="semanas" className="flex flex-col gap-1 py-2">
                <CalendarRange className="h-4 w-4" />
                <span className="text-xs">Semanas</span>
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
              <TabsTrigger value="grupos" className="flex flex-col gap-1 py-2">
                <Building2 className="h-4 w-4" />
                <span className="text-xs">Grupos</span>
              </TabsTrigger>
              <TabsTrigger value="comissoes" className="flex flex-col gap-1 py-2">
                <BadgePercent className="h-4 w-4" />
                <span className="text-xs">Comissões & Prêmios</span>
              </TabsTrigger>
            </TabsList>

            {/* ========== METAS SEMANAIS (Fase 2) ========== */}
            <TabsContent value="semanas">
              <MetasSemanaisTab empresas={empresas} ano={ano} />
            </TabsContent>

            {/* ========== GRUPOS DE LOJAS (supervisores) ========== */}
            <TabsContent value="grupos">
              <GruposTab empresas={empresas} />
            </TabsContent>

            {/* ========== COMISSÕES & PRÊMIOS (master) ========== */}
            <TabsContent value="comissoes">
              <ComissoesPremiosTab />
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
                                      <Trash2 className="h-4 w-4 text-danger" />
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
                                    {config.tipoLoja} • {config.percentualAceitavel}% mín
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
                                        <Trash2 className="h-4 w-4 text-danger" />
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

      {/* ActionBar sticky — metas-lojas / metas-vendedores */}
      <ActionBar
        visible={isDirty}
        status={actionStatus}
        saveLabel={actionBarLabel}
        onSave={handleActionBarSave}
        onCancel={handleActionBarCancel}
      >
        {tabAtiva === "metas-lojas" && (
          <span>{lojasSelecionadas.length} loja(s) × {mesesMeta.length} mês(es)</span>
        )}
        {tabAtiva === "metas-vendedores" && (
          <span>{vendedoresSelecionados.length} vendedor(es) × {mesesMeta.length} mês(es)</span>
        )}
      </ActionBar>
    </div>
  );
}
