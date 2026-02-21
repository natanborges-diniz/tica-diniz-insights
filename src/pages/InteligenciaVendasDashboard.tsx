import { TrendingUp, Store, Users, RefreshCw, Settings, Calendar, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useInteligenciaVendas, TabAtiva } from "@/hooks/useInteligenciaVendas";
import { useUserEmpresas } from "@/hooks/useUserEmpresas";
import { DiretrizesIA } from "@/components/ranking/DiretrizesIA";
import { InteligenciaKPICards } from "@/components/inteligencia/InteligenciaKPICards";
import { InteligenciaLojasTable } from "@/components/inteligencia/InteligenciaLojasTable";
import { InteligenciaVendedoresTable } from "@/components/inteligencia/InteligenciaVendedoresTable";

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function InteligenciaVendasDashboard() {
  const {
    filters,
    setFilters,
    tabAtiva,
    setTabAtiva,
    periodoDatas,
    rankingLojas,
    rankingVendedores,
    totais,
    loading,
    error,
    dataLoaded,
    fetchData,
    diretrizes,
    loadingDiretrizes,
    errorDiretrizes,
    gerarAnaliseIA,
  } = useInteligenciaVendas();

  const { empresas } = useUserEmpresas();

  const handleTabChange = (value: string) => {
    setTabAtiva(value as TabAtiva);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Inteligência de Vendas</h1>
            <p className="text-sm text-muted-foreground">
              Rankings, metas e análises de performance
            </p>
          </div>
        </div>
        <Link to="/config/metas">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Configurar Metas
          </Button>
        </Link>
      </div>

      {/* Filters - Padrão SalesFilters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Filtro de Empresa */}
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                Empresa
              </Label>
              <Select
                value={String(filters.empresa)}
                onValueChange={(v) => setFilters(f => ({ ...f, empresa: v === 'ALL' ? 'ALL' : v }))}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecione" />
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

            {/* Filtro de Data Início */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="dataInicio" className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Data Início
              </Label>
              <Input
                id="dataInicio"
                type="date"
                value={filters.dataInicio}
                onChange={(e) => setFilters(f => ({ ...f, dataInicio: e.target.value }))}
                className="w-[160px]"
              />
            </div>

            {/* Filtro de Data Fim */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="dataFim" className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Data Fim
              </Label>
              <Input
                id="dataFim"
                type="date"
                value={filters.dataFim}
                onChange={(e) => setFilters(f => ({ ...f, dataFim: e.target.value }))}
                className="w-[160px]"
              />
            </div>

            {/* Botão Atualizar */}
            <Button onClick={() => fetchData()} disabled={loading} className="flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          {/* Período ativo */}
          {dataLoaded && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span>Período:</span>
              <Badge variant="secondary">
                {periodoDatas.dataInicio} a {periodoDatas.dataFim}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && <LoadingSkeleton />}

      {/* Content */}
      {dataLoaded && !loading && (
        <Tabs value={tabAtiva} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="visao-geral" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="por-loja" className="flex items-center gap-2">
              <Store className="h-4 w-4" />
              Por Loja
            </TabsTrigger>
            <TabsTrigger value="por-vendedor" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Por Vendedor
            </TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="visao-geral" className="space-y-6">
            <InteligenciaKPICards totais={totais} tipo="geral" />
            
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Resumo Lojas */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Store className="h-5 w-5" />
                    Top 5 Lojas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InteligenciaLojasTable ranking={rankingLojas.slice(0, 5)} compact />
                </CardContent>
              </Card>

              {/* Resumo Vendedores */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Top 5 Vendedores
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InteligenciaVendedoresTable ranking={rankingVendedores.slice(0, 5)} compact />
                </CardContent>
              </Card>
            </div>

            {/* IA */}
            <DiretrizesIA
              diretrizes={diretrizes}
              loading={loadingDiretrizes}
              error={errorDiretrizes}
              onGerar={gerarAnaliseIA}
              disabled={rankingLojas.length === 0}
            />
          </TabsContent>

          {/* Por Loja */}
          <TabsContent value="por-loja" className="space-y-6">
            <InteligenciaKPICards totais={totais} tipo="loja" />
            <InteligenciaLojasTable ranking={rankingLojas} />
            <DiretrizesIA
              diretrizes={diretrizes}
              loading={loadingDiretrizes}
              error={errorDiretrizes}
              onGerar={gerarAnaliseIA}
              disabled={rankingLojas.length === 0}
            />
          </TabsContent>

          {/* Por Vendedor */}
          <TabsContent value="por-vendedor" className="space-y-6">
            <InteligenciaKPICards totais={totais} tipo="vendedor" />
            <InteligenciaVendedoresTable ranking={rankingVendedores} />
            <DiretrizesIA
              diretrizes={diretrizes}
              loading={loadingDiretrizes}
              error={errorDiretrizes}
              onGerar={gerarAnaliseIA}
              disabled={rankingVendedores.length === 0}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Empty State */}
      {!dataLoaded && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <TrendingUp className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">
            {!filters.empresa
              ? "Selecione uma empresa para visualizar os dados"
              : "Clique em \"Atualizar\" para carregar os dados"}
          </p>
          <p className="text-sm mt-2">
            Rankings, metas e análises serão gerados com base nas vendas do período
          </p>
        </div>
      )}
    </div>
  );
}
