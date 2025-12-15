import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Target, TrendingUp, TrendingDown, AlertTriangle, Calendar, RefreshCw, Settings } from "lucide-react";
import { useAcompanhamentoMetas, AcompanhamentoMeta } from "@/hooks/useAcompanhamentoMetas";
import { Skeleton } from "@/components/ui/skeleton";

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function getStatusColor(status: AcompanhamentoMeta['status']): string {
  switch (status) {
    case 'ACIMA_MEDIA': return 'bg-green-500';
    case 'NO_RITMO': return 'bg-blue-500';
    case 'EM_RISCO': return 'bg-yellow-500';
    case 'CRITICO': return 'bg-red-500';
    default: return 'bg-muted';
  }
}

function getStatusLabel(status: AcompanhamentoMeta['status']): string {
  switch (status) {
    case 'ACIMA_MEDIA': return 'Acima da média';
    case 'NO_RITMO': return 'No ritmo';
    case 'EM_RISCO': return 'Em risco';
    case 'CRITICO': return 'Crítico';
    default: return 'Indefinido';
  }
}

export default function MetasAcompanhamentoDashboard() {
  const {
    filters,
    setFilters,
    acompanhamento,
    metrics,
    empresas,
    periodoInfo,
    loading,
    error,
    fetchAcompanhamento,
  } = useAcompanhamentoMetas();

  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1];

  useEffect(() => {
    fetchAcompanhamento();
  }, []);

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
                  <Target className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">Acompanhamento de Metas</h1>
                  <p className="text-sm text-muted-foreground">
                    Monitore o progresso das metas de vendas
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/metas/config">
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Configurações
                </Button>
              </Link>
              <Link to="/metas">
                <Button variant="outline" size="sm">
                  <Target className="h-4 w-4 mr-2" />
                  Cadastrar Metas
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Filtros */}
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={String(filters.ano)} onValueChange={(v) => setFilters(f => ({ ...f, ano: Number(v) }))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map(a => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(filters.mes)} onValueChange={(v) => setFilters(f => ({ ...f, mes: Number(v) }))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map(m => (
                  <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select 
              value={filters.empresa === 'ALL' ? 'ALL' : String(filters.empresa)} 
              onValueChange={(v) => setFilters(f => ({ ...f, empresa: v === 'ALL' ? 'ALL' : Number(v) }))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todas as lojas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as lojas</SelectItem>
                {empresas.map(e => (
                  <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={fetchAcompanhamento} disabled={loading} variant="default">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>

            {periodoInfo.descricao && (
              <Badge variant="outline" className="ml-auto">
                <Calendar className="h-3 w-3 mr-1" />
                {periodoInfo.descricao}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <main className="container mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg">
            {error}
          </div>
        )}

        {/* KPIs */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Meta Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(metrics.metaTotal)}</div>
                <Progress value={metrics.percentualAtingido} className="mt-2 h-2" />
                <p className="text-xs text-muted-foreground mt-1">{formatPercent(metrics.percentualAtingido)} atingido</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Vendido</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(metrics.totalVendido)}</div>
                <p className="text-xs text-muted-foreground mt-1">Falta: {formatCurrency(metrics.valorRestante)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Média Diária Real</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(metrics.mediaDiariaGeral)}</div>
                <p className="text-xs text-muted-foreground mt-1">Meta diária: {formatCurrency(metrics.metaDiariaGeral)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Status das Lojas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    <span className="text-xl font-bold">{metrics.lojasAcimaMedia}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    <span className="text-xl font-bold">{metrics.lojasEmRisco}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Acima da média / Em risco</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabela de Acompanhamento */}
        <Card>
          <CardHeader>
            <CardTitle>Acompanhamento por Loja</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : acompanhamento.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma meta cadastrada para este período</p>
                <Link to="/metas">
                  <Button variant="link">Cadastrar metas</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {acompanhamento.map((item) => (
                  <div 
                    key={item.codEmpresa} 
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">{item.nomeEmpresa}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={getStatusColor(item.status)}>
                            {getStatusLabel(item.status)}
                          </Badge>
                          {item.alertas.length > 0 && (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {item.alertas.length} alerta(s)
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{formatPercent(item.percentualAtingido)}</div>
                        <p className="text-xs text-muted-foreground">da meta</p>
                      </div>
                    </div>

                    <Progress value={Math.min(item.percentualAtingido, 100)} className="h-2 mb-3" />

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Meta</p>
                        <p className="font-medium">{formatCurrency(item.metaTotal)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Vendido</p>
                        <p className="font-medium text-green-600">{formatCurrency(item.totalVendido)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Média diária</p>
                        <p className="font-medium">{formatCurrency(item.mediaDiariaReal)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Meta diária necessária</p>
                        <p className={`font-medium ${item.metaDiariaNecessaria > item.mediaDiariaReal ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(item.metaDiariaNecessaria)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span>{item.diasUteisRestantes} dias úteis restantes</span>
                      <span>•</span>
                      <span>Falta: {formatCurrency(item.valorRestante)}</span>
                    </div>

                    {item.alertas.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {item.alertas.map((alerta, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-yellow-600">
                            <AlertTriangle className="h-3 w-3" />
                            {alerta}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
