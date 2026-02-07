// src/pages/OsDashboard.tsx
// Monitor de Produção — auto-load ALL, busca receita on-demand via &os=

import React, { useState } from "react";
import { useOsMonitor } from "../hooks/useOsMonitor";
import { OsDashboardLayout } from "../components/os-dashboard/OsDashboardLayout";
import { OsHubRecord, fetchSingleOsRecipe, saveToCache } from "@/services/osHubService";
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
    // Cache não tem estes campos extras
    dp: null,
    pertoDp: null,
    distanciaLeitura: null,
    distanciaProgressao: null,
    distanciaVertice: null,
    ponte: null,
    aaVertical: null,
    caHorizontal: null,
    diametro: null,
    ta: null,
    md: null,
    he: null,
    st: null,
    prisma: (r.prisma as string) ?? null,
    prismaAngulo: null,
    prismaEixo: null,
    prisma1: (r.prisma1 as string) ?? null,
    prisma1Angulo: null,
    prisma1Eixo: null,
    imagemReceita: (r.imagem_receita as string) ?? null,
    urlImagemReceita: (r.url_imagem_receita as string) ?? null,
    imagemArmacao: (r.imagem_armacao as string) ?? null,
    urlImagemArmacao: (r.url_imagem_armacao as string) ?? null,
    imagemTracer: (r.imagem_tracer as string) ?? null,
    arquivoTracer: null,
    observacaoOs: (r.observacao_os as string) ?? null,
    observacaoLente: (r.observacao_lente as string) ?? null,
    observacaoPendencia: (r.observacao_pendencia as string) ?? null,
    observacaoReceita: null,
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
      console.log("[OsDashboard] handleOpenRecipe codOs:", codOs, "codEmpresa:", codEmpresa);

      // 1) Always fetch from Firebird with &os= for complete data (medidas, prismas, armação)
      // Cache doesn't have all extended fields
      toast({ title: "Buscando receita...", description: "Consultando dados completos." });

      const found = await fetchSingleOsRecipe(codOs, codEmpresa);

      if (found) {
        setSelectedHubOs(found);
        // Save to cache for basic fields (fire and forget)
        saveToCache([found]).catch(err =>
          console.warn("[OsDashboard] Failed to cache recipe:", err)
        );
      } else {
        // Fallback to cache for basic info
        const { data: row } = await supabase
          .from("os_hub_receitas")
          .select("*")
          .eq("cod_os", codOs)
          .maybeSingle();

        if (row) {
          console.log("[OsDashboard] Firebird miss, using cache for OS:", codOs);
          setSelectedHubOs(mapCacheRowToHubRecord(row as Record<string, unknown>));
        } else {
          toast({
            title: "Receita não encontrada",
            description: "Não foi possível localizar a receita para esta OS.",
            variant: "destructive",
          });
          setSelectedHubOs(null);
        }
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
