// src/pages/CentralIADashboard.tsx
// Página dedicada da Central de IA - Análise Multi-Dimensional

import { useCentralIA } from "@/hooks/useCentralIA";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Brain, 
  Sparkles, 
  AlertCircle, 
  RefreshCw, 
  Building2, 
  Calendar, 
  Database,
  Package,
  CreditCard,
  TrendingUp,
  Layers,
  CheckCircle2,
  XCircle,
  Factory,
  ShoppingCart
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ModuleHeader } from "@/components/system/ModuleHeader";

export default function CentralIADashboard() {
  const {
    empresas,
    loadingEmpresas,
    filters,
    setFilters,
    dadosColetados,
    analise,
    coletando,
    gerando,
    error,
    executarAnaliseCompleta,
    limpar,
  } = useCentralIA();

  const isLoading = coletando || gerando;

  return (
    <div className="container mx-auto py-6 space-y-6">
        <ModuleHeader
          title="Central de Inteligência Artificial"
          subtitle="Análise multi-dimensional consolidada do negócio"
          icon={<Brain className="h-7 w-7 text-primary" />}
        />

        {/* Filtros e Controles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configuração da Análise</CardTitle>
            <CardDescription>
              Defina o período e escopo dos dados para a análise inteligente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Empresa */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Empresa
                </Label>
                <Select 
                  value={filters.empresa === 'ALL' ? 'ALL' : String(filters.empresa)}
                  onValueChange={(value) => setFilters(prev => ({
                    ...prev,
                    empresa: value === 'ALL' ? 'ALL' : value
                  }))}
                  disabled={loadingEmpresas}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">Todas as Empresas</SelectItem>
                    {empresas.map((emp) => (
                      <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                        {emp.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Data Início */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Data Início
                </Label>
                <Input
                  type="date"
                  value={filters.dataInicio}
                  onChange={(e) => setFilters(prev => ({ ...prev, dataInicio: e.target.value }))}
                />
              </div>

              {/* Data Fim */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Data Fim
                </Label>
                <Input
                  type="date"
                  value={filters.dataFim}
                  onChange={(e) => setFilters(prev => ({ ...prev, dataFim: e.target.value }))}
                />
              </div>

              {/* Incluir Estoque */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Incluir Estoque
                </Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch
                    checked={filters.incluirEstoque}
                    onCheckedChange={(checked) => setFilters(prev => ({ ...prev, incluirEstoque: checked }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {filters.incluirEstoque ? 'Sim' : 'Não'}
                  </span>
                </div>
              </div>

              {/* Incluir Análise SKU */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Factory className="h-4 w-4 text-muted-foreground" />
                  Análise Fornecedores
                </Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch
                    checked={filters.incluirAnaliseSku}
                    onCheckedChange={(checked) => setFilters(prev => ({ ...prev, incluirAnaliseSku: checked }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {filters.incluirAnaliseSku ? 'Sim' : 'Não'}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Botões de Ação */}
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={executarAnaliseCompleta}
                disabled={isLoading}
                size="lg"
                className="gap-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    {coletando ? 'Coletando dados...' : 'Gerando análise...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Gerar Análise Completa
                  </>
                )}
              </Button>

              {(dadosColetados || analise) && (
                <Button
                  variant="outline"
                  onClick={limpar}
                  disabled={isLoading}
                >
                  Limpar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Status dos Dados Coletados */}
        {dadosColetados && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                Dados Coletados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Vendas */}
                <div className="flex items-center gap-2">
                  {dadosColetados.vendas ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">Vendas</p>
                    {dadosColetados.vendas && (
                      <p className="text-sm text-muted-foreground">
                        R$ {dadosColetados.vendas.totalFaturamento.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Formas de Pagamento */}
                <div className="flex items-center gap-2">
                  {dadosColetados.formasPagamento ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium flex items-center gap-1">
                      <CreditCard className="h-4 w-4" />
                      Pagamentos
                    </p>
                    {dadosColetados.formasPagamento && (
                      <p className="text-sm text-muted-foreground">
                        {dadosColetados.formasPagamento.length} formas
                      </p>
                    )}
                  </div>
                </div>

                {/* Famílias */}
                <div className="flex items-center gap-2">
                  {dadosColetados.familias ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium flex items-center gap-1">
                      <Layers className="h-4 w-4" />
                      Famílias
                    </p>
                    {dadosColetados.familias && (
                      <p className="text-sm text-muted-foreground">
                        {dadosColetados.familias.length} categorias
                      </p>
                    )}
                  </div>
                </div>

                {/* Estoque */}
                <div className="flex items-center gap-2">
                  {dadosColetados.estoque ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium flex items-center gap-1">
                      <Package className="h-4 w-4" />
                      Estoque
                    </p>
                    {dadosColetados.estoque && (
                      <p className="text-sm text-muted-foreground">
                        {dadosColetados.estoque.totalItens} itens
                      </p>
                    )}
                  </div>
                </div>

                {/* Fornecedores/Marcas */}
                <div className="flex items-center gap-2">
                  {dadosColetados.fornecedoresMarcas && dadosColetados.fornecedoresMarcas.length > 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium flex items-center gap-1">
                      <Factory className="h-4 w-4" />
                      Fornecedores
                    </p>
                    {dadosColetados.fornecedoresMarcas && dadosColetados.fornecedoresMarcas.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {dadosColetados.fornecedoresMarcas.length} combinações
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Resumo de Fornecedores */}
              {dadosColetados.fornecedoresMarcas && dadosColetados.fornecedoresMarcas.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Recomendação de Compras
                  </p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <p className="text-xl font-bold text-primary">
                        {dadosColetados.fornecedoresMarcas.filter(f => f.recomendacaoCompra === 'PRIORIZAR').length}
                      </p>
                      <p className="text-xs text-muted-foreground">Priorizar</p>
                    </div>
                    <div className="p-2 rounded-lg bg-muted">
                      <p className="text-xl font-bold">
                        {dadosColetados.fornecedoresMarcas.filter(f => f.recomendacaoCompra === 'MANTER').length}
                      </p>
                      <p className="text-xs text-muted-foreground">Manter</p>
                    </div>
                    <div className="p-2 rounded-lg bg-destructive/10">
                      <p className="text-xl font-bold text-destructive">
                        {dadosColetados.fornecedoresMarcas.filter(f => f.recomendacaoCompra === 'EVITAR').length}
                      </p>
                      <p className="text-xs text-muted-foreground">Evitar</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Resumo rápido */}
              {dadosColetados.vendas && (
                <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary">
                      {dadosColetados.vendas.qtdVendas.toLocaleString('pt-BR')}
                    </p>
                    <p className="text-sm text-muted-foreground">Vendas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">
                      R$ {dadosColetados.vendas.ticketMedio.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-sm text-muted-foreground">Ticket Médio</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${dadosColetados.vendas.percentualDesconto > 15 ? 'text-destructive' : 'text-primary'}`}>
                      {dadosColetados.vendas.percentualDesconto.toFixed(1)}%
                    </p>
                    <p className="text-sm text-muted-foreground">Desconto Médio</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">
                      {dadosColetados.vendas.porLoja?.length || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Lojas</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Erro */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Resultado da Análise */}
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-6 w-6 text-primary" />
                <CardTitle>Diretrizes Estratégicas</CardTitle>
              </div>
              {analise && (
                <Badge variant="outline" className="gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Análise Tática
                </Badge>
              )}
            </div>
            <CardDescription>
              Recomendações geradas por inteligência artificial com base nos dados coletados
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Loading */}
            {gerando && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Processando análise com IA...</span>
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[90%]" />
                <Skeleton className="h-4 w-[80%]" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-4 w-[85%]" />
                <Skeleton className="h-4 w-[75%]" />
              </div>
            )}

            {/* Resultado */}
            {!gerando && analise && (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{analise}</ReactMarkdown>
              </div>
            )}

            {/* Estado inicial */}
            {!gerando && !analise && !dadosColetados && (
              <div className="text-center py-12 text-muted-foreground">
                <Brain className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Central de IA Pronta</p>
                <p className="text-sm mt-2 max-w-md mx-auto">
                  Configure o período e clique em "Gerar Análise Completa" para obter 
                  diretrizes estratégicas baseadas em vendas, pagamentos, produtos e estoque.
                </p>
              </div>
            )}

            {/* Dados coletados, aguardando análise */}
            {!gerando && !analise && dadosColetados && (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Dados coletados com sucesso!</p>
                <p className="text-sm mt-2">Clique em "Gerar Análise Completa" novamente ou aguarde a geração automática.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  
  );
}
