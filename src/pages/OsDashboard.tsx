// src/pages/OsDashboard.tsx
// Monitor de Produção — auto-load ALL, fallback Firebird para receitas

import React, { useState } from "react";
import { useOsMonitor } from "../hooks/useOsMonitor";
import { OsDashboardLayout } from "../components/os-dashboard/OsDashboardLayout";
import { OsHubRecord, fetchOsHubFromFirebird, saveToCache } from "@/services/osHubService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const hoje = new Date();
const fim = hoje.toISOString().slice(0, 10);
const inicioDate = new Date(hoje);
inicioDate.setDate(inicioDate.getDate() - 30);
const inicio = inicioDate.toISOString().slice(0, 10);

function mapCacheRowToHubRecord(r: Record<string, unknown>): OsHubRecord {
  const hasReceita = !!(
    r.od_longe_esf || r.od_longe_cil || r.od_perto_esf ||
    r.oe_longe_esf || r.oe_longe_cil || r.oe_perto_esf ||
    r.od_adicao || r.oe_adicao
  );
  const hasImagem = !!(r.url_imagem_receita || r.url_imagem_armacao || r.imagem_tracer);

  return {
    codOs: r.cod_os as number,
    numeroOs: (r.numero_os as string) ?? "",
    empresa: (r.empresa as string) ?? "",
    codEmpresa: r.cod_empresa as number,
    cliente: (r.cliente as string) ?? "",
    codCliente: (r.cod_cliente as number) ?? null,
    telefone: (r.telefone as string) ?? null,
    etapa: (r.etapa as string) ?? "",
    statusAtraso: (r.status_atraso as string) ?? "SEM_DATA",
    atrasoDias: (r.atraso_dias as number) ?? 0,
    dataEmissao: (r.data_emissao as string) ?? null,
    dataPrevisao: (r.data_previsao as string) ?? null,
    dataEntrada: (r.data_entrada as string) ?? null,
    dataSaida: (r.data_saida as string) ?? null,
    total: Number(r.total) || 0,
    usuario: (r.usuario as string) ?? "",
    odLongeEsf: r.od_longe_esf != null ? Number(r.od_longe_esf) : null,
    odLongeCil: r.od_longe_cil != null ? Number(r.od_longe_cil) : null,
    odLongeEixo: (r.od_longe_eixo as number) ?? null,
    odPertoEsf: r.od_perto_esf != null ? Number(r.od_perto_esf) : null,
    odPertoCil: r.od_perto_cil != null ? Number(r.od_perto_cil) : null,
    odPertoEixo: (r.od_perto_eixo as number) ?? null,
    odAdicao: r.od_adicao != null ? Number(r.od_adicao) : null,
    odDnp: r.od_dnp != null ? Number(r.od_dnp) : null,
    odAltura: r.od_altura != null ? Number(r.od_altura) : null,
    oeLongeEsf: r.oe_longe_esf != null ? Number(r.oe_longe_esf) : null,
    oeLongeCil: r.oe_longe_cil != null ? Number(r.oe_longe_cil) : null,
    oeLongeEixo: (r.oe_longe_eixo as number) ?? null,
    oePertoEsf: r.oe_perto_esf != null ? Number(r.oe_perto_esf) : null,
    oePertoCil: r.oe_perto_cil != null ? Number(r.oe_perto_cil) : null,
    oePertoEixo: (r.oe_perto_eixo as number) ?? null,
    oeAdicao: r.oe_adicao != null ? Number(r.oe_adicao) : null,
    oeDnp: r.oe_dnp != null ? Number(r.oe_dnp) : null,
    oeAltura: r.oe_altura != null ? Number(r.oe_altura) : null,
    prisma: (r.prisma as string) ?? null,
    prisma1: (r.prisma1 as string) ?? null,
    imagemReceita: (r.imagem_receita as string) ?? null,
    urlImagemReceita: (r.url_imagem_receita as string) ?? null,
    imagemArmacao: (r.imagem_armacao as string) ?? null,
    urlImagemArmacao: (r.url_imagem_armacao as string) ?? null,
    imagemTracer: (r.imagem_tracer as string) ?? null,
    observacaoOs: (r.observacao_os as string) ?? null,
    observacaoLente: (r.observacao_lente as string) ?? null,
    observacaoPendencia: (r.observacao_pendencia as string) ?? null,
    temReceita: (r.tem_receita as boolean) ?? hasReceita,
    temImagem: (r.tem_imagem as boolean) ?? hasImagem,
    cacheLoadedAt: (r.cache_loaded_at as string) ?? undefined,
  };
}

const OsDashboardPage: React.FC = () => {
  const {
    data,
    filteredData,
    loading,
    error,
    metrics,
    filteredMetrics,
    filters,
    setFilters,
    empresasUnicas,
    etapasUnicas,
    reload,
  } = useOsMonitor({
    empresa: "ALL",
    dataInicio: inicio,
    dataFim: fim,
  });

  const [selectedHubOs, setSelectedHubOs] = useState<OsHubRecord | null>(null);
  const [loadingRecipe, setLoadingRecipe] = useState(false);

  const handleOpenRecipe = async (codOs: number, codEmpresa?: number) => {
    try {
      setLoadingRecipe(true);
      console.log("[OsDashboard] handleOpenRecipe called with codOs:", codOs, "codEmpresa:", codEmpresa);

      // 1) Try cache first
      const { data: row } = await supabase
        .from("os_hub_receitas")
        .select("*")
        .eq("cod_os", codOs)
        .maybeSingle();

      if (row && row.tem_receita) {
        console.log("[OsDashboard] Recipe found in cache (with prescription) for OS:", codOs);
        setSelectedHubOs(mapCacheRowToHubRecord(row as Record<string, unknown>));
        return;
      }
      if (row) {
        console.log("[OsDashboard] Cache hit but tem_receita=false for OS:", codOs, "- will fallback to Firebird");
      }

      // 2) Fallback: fetch from Firebird directly
      const empresaFallback = codEmpresa && codEmpresa > 0 ? codEmpresa : "ALL";
      console.log("[OsDashboard] Cache miss for OS:", codOs, "- fallback with codEmpresa:", empresaFallback);
      toast({
        title: "Buscando receita...",
        description: "Consultando dados do ERP diretamente.",
      });

      // Use 2-month window (narrower = faster response)
      const fallbackStart = new Date();
      fallbackStart.setMonth(fallbackStart.getMonth() - 2);
      const records = await fetchOsHubFromFirebird({
        empresa: empresaFallback,
        dataInicio: fallbackStart.toISOString().slice(0, 10),
        dataFim: new Date().toISOString().slice(0, 10),
      });

      const found = records.find(r => r.codOs === codOs);
      if (found) {
        setSelectedHubOs(found);
        // Save to cache for next time (fire and forget)
        saveToCache([found]).catch(err => 
          console.warn("[OsDashboard] Failed to cache recipe:", err)
        );
      } else {
        toast({
          title: "Receita não encontrada",
          description: "Não foi possível localizar a receita para esta OS.",
          variant: "destructive",
        });
        setSelectedHubOs(null);
      }
    } catch (err) {
      console.error("[OsDashboard] Error loading recipe:", err);
      toast({
        title: "Erro ao buscar receita",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoadingRecipe(false);
    }
  };

  const handleChangeFilters = (next: Partial<typeof filters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  };

  return (
    <OsDashboardLayout
      data={filteredData}
      rawData={data}
      loading={loading}
      error={error}
      metrics={filteredMetrics}
      rawMetrics={metrics}
      filters={filters}
      onChangeFilters={handleChangeFilters}
      onRefresh={() => reload({ empresa: "ALL", dataInicio: inicio, dataFim: fim })}
      empresasUnicas={empresasUnicas}
      etapasUnicas={etapasUnicas}
      selectedHubOs={selectedHubOs}
      onOpenRecipe={handleOpenRecipe}
      onCloseRecipe={() => setSelectedHubOs(null)}
      loadingRecipe={loadingRecipe}
    />
  );
};

export default OsDashboardPage;
