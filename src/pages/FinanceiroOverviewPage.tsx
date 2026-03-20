import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Landmark, TrendingUp, TrendingDown, Wallet, AlertTriangle,
  Package, CreditCard, Tags, ArrowRight, FileText, ArrowLeftRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/system/states";

interface ResumoFinanceiro {
  totalReceberAberto: number;
  totalPagarAberto: number;
  saldoAberto: number;
  totalBaixadoReceber: number;
  totalBaixadoPagar: number;
  saldoBaixado: number;
  qtdVencidos: number;
  qtdPendentesValidacao: number;
  totalLancamentos: number;
  borderosAbertos: number;
  borderosTotalValor: number;
  recebiveisPendentes: number;
  totalTaxasCartao: number;
}

export default function FinanceiroOverviewPage() {
  const { codEmpresa } = useDefaultEmpresa();
  const navigate = useNavigate();

  const invokeAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke("financeiro-lancamentos", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (error) throw error;
    return data;
  };

  const { data: resumo, isLoading } = useQuery<ResumoFinanceiro>({
    queryKey: ["resumo-financeiro", codEmpresa],
    queryFn: () => invokeAction("resumo_financeiro", { cod_empresa: codEmpresa }),
    enabled: codEmpresa !== undefined && codEmpresa !== null,
    refetchInterval: 60000,
  });

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  if (isLoading || !resumo) return <LoadingState />;

  const shortcuts = [
    { label: "Hub Lançamentos", url: "/financeiro/hub", icon: Landmark, desc: "CRUD e borderôs" },
    { label: "DRE Gerencial", url: "/financeiro/dre", icon: FileText, desc: "Demonstrativo de resultado" },
    { label: "Fluxo de Caixa", url: "/financeiro/fluxo-caixa", icon: ArrowLeftRight, desc: "Projeções e realizado" },
    { label: "Cartões", url: "/financeiro/cartoes", icon: CreditCard, desc: "Conciliação de recebíveis" },
    { label: "Classificação", url: "/financeiro/classificacao", icon: Tags, desc: `${resumo.qtdPendentesValidacao} pendente(s)` },
  ];

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Visão Geral Financeira"
        subtitle="Painel consolidado de todos os módulos financeiros"
        icon={<Landmark className="h-5 w-5" />}
      />

      {/* KPI Grid */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">A Receber (Aberto)</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{fmtCurrency(resumo.totalReceberAberto)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">A Pagar (Aberto)</CardTitle>
            <TrendingDown className="h-4 w-4 text-danger" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-danger">{fmtCurrency(resumo.totalPagarAberto)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Projetado</CardTitle>
            <Wallet className={`h-4 w-4 ${resumo.saldoAberto >= 0 ? "text-success" : "text-danger"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${resumo.saldoAberto >= 0 ? "text-success" : "text-danger"}`}>
              {fmtCurrency(resumo.saldoAberto)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Realizado</CardTitle>
            <Wallet className={`h-4 w-4 ${resumo.saldoBaixado >= 0 ? "text-success" : "text-danger"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${resumo.saldoBaixado >= 0 ? "text-success" : "text-danger"}`}>
              {fmtCurrency(resumo.saldoBaixado)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Recebido: {fmtCurrency(resumo.totalBaixadoReceber)} · Pago: {fmtCurrency(resumo.totalBaixadoPagar)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas */}
      <div className="grid gap-4 md:grid-cols-4">
        {resumo.qtdVencidos > 0 && (
          <Card className="border-danger/30 bg-danger/5 cursor-pointer hover:bg-danger/10 transition-colors" onClick={() => navigate("/financeiro/hub")}>
            <CardContent className="flex items-center gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-danger shrink-0" />
              <div>
                <p className="text-sm font-medium text-danger">{resumo.qtdVencidos} vencido(s)</p>
                <p className="text-xs text-muted-foreground">Lançamentos em atraso</p>
              </div>
            </CardContent>
          </Card>
        )}
        {resumo.qtdPendentesValidacao > 0 && (
          <Card className="border-warning/30 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors" onClick={() => navigate("/financeiro/classificacao")}>
            <CardContent className="flex items-center gap-3 p-4">
              <Tags className="h-5 w-5 text-warning shrink-0" />
              <div>
                <p className="text-sm font-medium text-warning">{resumo.qtdPendentesValidacao} pendente(s)</p>
                <p className="text-xs text-muted-foreground">Aguardando classificação</p>
              </div>
            </CardContent>
          </Card>
        )}
        {resumo.borderosAbertos > 0 && (
          <Card className="border-primary/30 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => navigate("/financeiro/hub")}>
            <CardContent className="flex items-center gap-3 p-4">
              <Package className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{resumo.borderosAbertos} borderô(s) aberto(s)</p>
                <p className="text-xs text-muted-foreground">{fmtCurrency(resumo.borderosTotalValor)}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {resumo.recebiveisPendentes > 0 && (
          <Card className="border-primary/30 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => navigate("/financeiro/cartoes")}>
            <CardContent className="flex items-center gap-3 p-4">
              <CreditCard className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{resumo.recebiveisPendentes} recebível(is)</p>
                <p className="text-xs text-muted-foreground">Pendentes conciliação</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick access */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Acesso rápido</h2>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {shortcuts.map((s) => (
            <Card
              key={s.url}
              className="cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => navigate(s.url)}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <s.icon className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.desc}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Summary footer */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{resumo.totalLancamentos} lançamentos no período</span>
            {resumo.totalTaxasCartao > 0 && (
              <span>Taxas adquirentes: {fmtCurrency(resumo.totalTaxasCartao)}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
