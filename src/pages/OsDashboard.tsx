// src/pages/OsDashboard.tsx
// Monitor de Produção — empresa obrigatória, circuit breaker integrado, module-level cache

import React, { useState, useEffect, useCallback } from "react";
import { useOsMonitor, OsApiFilters } from "../hooks/useOsMonitor";
import { OsDashboardLayout, PedidoFornecedorInfo } from "../components/os-dashboard/OsDashboardLayout";
import { OsHubRecord, fetchSingleOsRecipe, saveToCache } from "@/services/osHubService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CampoDataOs } from "@/services/osService";
import { useBridgeStatus } from "@/hooks/useBridgeStatus";
import { useUserEmpresas } from "@/hooks/useUserEmpresas";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "react-router-dom";
import {
  pedidosMapCache,
  pedidosMapDataKey,
  setPedidosMapCache,
  setPedidosMapDataKey,
  registrarPedidoNoCache,
} from "@/utils/pedidosMapCache";

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
    vendedor: (r.vendedor as string) ?? "",
    odLongeEsf: r.oe_longe_esf != null ? Number(r.oe_longe_esf) : null,
    odLongeCil: r.oe_longe_cil != null ? Number(r.oe_longe_cil) : null,
    odLongeEixo: (r.oe_longe_eixo as number) ?? null,
    odPertoEsf: r.oe_perto_esf != null ? Number(r.oe_perto_esf) : null,
    odPertoCil: r.oe_perto_cil != null ? Number(r.oe_perto_cil) : null,
    odPertoEixo: (r.oe_perto_eixo as number) ?? null,
    odAdicao: r.oe_adicao != null ? Number(r.oe_adicao) : null,
    odDnp: r.oe_dnp != null ? Number(r.oe_dnp) : null,
    odAltura: r.oe_altura != null ? Number(r.oe_altura) : null,
    oeLongeEsf: r.od_longe_esf != null ? Number(r.od_longe_esf) : null,
    oeLongeCil: r.od_longe_cil != null ? Number(r.od_longe_cil) : null,
    oeLongeEixo: (r.od_longe_eixo as number) ?? null,
    oePertoEsf: r.od_perto_esf != null ? Number(r.od_perto_esf) : null,
    oePertoCil: r.od_perto_cil != null ? Number(r.od_perto_cil) : null,
    oePertoEixo: (r.od_perto_eixo as number) ?? null,
    oeAdicao: r.od_adicao != null ? Number(r.od_adicao) : null,
    oeDnp: r.od_dnp != null ? Number(r.od_dnp) : null,
    oeAltura: r.od_altura != null ? Number(r.od_altura) : null,
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
    lenteOdDescricao: null,
    lenteOeDescricao: null,
    codFormatoAro: null,
    descricaoArmacao: null,
    referenciaArmacao: null,
    cpf: (r.cpf as string)?.trim() || null,
    dataNascimento: (r.data_nascimento as string) || null,
    paciente: (r.paciente as string)?.trim() || null,
    temReceita: (r.tem_receita as boolean) ?? hasReceita,
    temImagem: (r.tem_imagem as boolean) ?? hasImagem,
    cacheLoadedAt: (r.cache_loaded_at as string) ?? undefined,
  };
}

const OsDashboardPage: React.FC = () => {
  const { isAdmin, codEmpresa } = useAuth();
  const bridge = useBridgeStatus();
  const { empresas, isLoading: empresasLoading, canSeeAll } = useUserEmpresas();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    data,
    filteredData,
    loading,
    error,
    loaded,
    lastApiFilters,
    metrics,
    filteredMetrics,
    filters,
    setFilters,
    empresasUnicas,
    etapasUnicas,
    reload,
  } = useOsMonitor();

  const [selectedHubOs, setSelectedHubOs] = useState<OsHubRecord | null>(null);
  const [loadingRecipeCodOs, setLoadingRecipeCodOs] = useState<number | null>(null);

  // Reabrir sheet ao voltar da tela de pedido (?openOs=X&codEmpresa=Y)
  useEffect(() => {
    const openOs = searchParams.get("openOs");
    const openCodEmpresa = searchParams.get("codEmpresa");
    if (openOs && openCodEmpresa) {
      handleOpenRecipe(Number(openOs), Number(openCodEmpresa));
      // Limpa os params da URL sem recarregar a página
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete("openOs");
        next.delete("codEmpresa");
        return next;
      }, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // Pedidos map — cache singleton compartilhado, só rebusca quando rawData muda
  // ============================================================
  const [pedidosMap, setPedidosMap] = useState<Record<number, PedidoFornecedorInfo>>(() => ({ ...pedidosMapCache }));

  // Ao montar (ex: voltando da tela de pedido), sincroniza o cache singleton → estado local
  useEffect(() => {
    setPedidosMap({ ...pedidosMapCache });
  }, []);

  useEffect(() => {
    if (data.length === 0) return;
    const newKey = data.map(os => os.codOs).sort().join(",");
    if (newKey === pedidosMapDataKey && Object.keys(pedidosMapCache).length > 0) {
      // Mesmo conjunto de OS — reutiliza cache sem bater no banco
      setPedidosMap({ ...pedidosMapCache });
      return;
    }
    setPedidosMapDataKey(newKey);
    const codOsList = data.map(os => os.codOs);
    (async () => {
      const map: Record<number, PedidoFornecedorInfo> = {};
      for (let i = 0; i < codOsList.length; i += 100) {
        const batch = codOsList.slice(i, i + 100);
        const { data: rows } = await supabase
          .from("pedidos_fornecedor")
          .select("cod_os, numero_pedido, fornecedor, status, created_at, response")
          .in("cod_os", batch)
          .order("created_at", { ascending: false }); // mais recente primeiro
        if (rows) {
          for (const r of rows) {
            const existing = map[r.cod_os];
            const respObj = r.response as Record<string, unknown> | null;
            const voucher = (respObj?.voucherGerado as string) || null;
            // Prioridade: pedido confirmado (com número) > qualquer outro
            if (!existing) {
              map[r.cod_os] = { numero_pedido: r.numero_pedido, fornecedor: r.fornecedor, status: r.status || "", created_at: r.created_at, voucher };
            } else if (!existing.numero_pedido && r.numero_pedido) {
              map[r.cod_os] = { numero_pedido: r.numero_pedido, fornecedor: r.fornecedor, status: r.status || "", created_at: r.created_at, voucher };
            }
            // Se já tem confirmado, ignora os demais
          }
        }
      }
      setPedidosMapCache(map);
      setPedidosMap(map);
    })();
  }, [data]);

  // ============================================================

  const handleLoad = (apiFilters: OsApiFilters) => {
    reload(apiFilters);
  };

  const handleOpenRecipe = async (codOs: number, codEmpresa?: number) => {
    try {
      setLoadingRecipeCodOs(codOs);
      toast({ title: "Buscando receita...", description: "Consultando dados completos." });

      // Find monitor record to merge patient data
      const monitorOs = data.find(os => os.codOs === codOs);

      const found = await fetchSingleOsRecipe(codOs, codEmpresa);

      if (found) {
        // Merge patient data from monitor if hub-receitas didn't return them
        if (monitorOs) {
          if (!found.cpf && monitorOs.cpf) found.cpf = monitorOs.cpf;
          if (!found.paciente && monitorOs.paciente) found.paciente = monitorOs.paciente;
          if (!found.dataNascimento && monitorOs.dataNascimento) found.dataNascimento = monitorOs.dataNascimento;
        }
        setSelectedHubOs(found);
        saveToCache([found]).catch(err =>
          console.warn("[OsDashboard] Failed to cache recipe:", err)
        );
      } else {
        const { data: row } = await supabase
          .from("os_hub_receitas")
          .select("*")
          .eq("cod_os", codOs)
          .maybeSingle();

        if (row) {
          const hubRecord = mapCacheRowToHubRecord(row as Record<string, unknown>);
          // Merge patient data from monitor
          if (monitorOs) {
            if (!hubRecord.cpf && monitorOs.cpf) hubRecord.cpf = monitorOs.cpf;
            if (!hubRecord.paciente && monitorOs.paciente) hubRecord.paciente = monitorOs.paciente;
            if (!hubRecord.dataNascimento && monitorOs.dataNascimento) hubRecord.dataNascimento = monitorOs.dataNascimento;
          }
          setSelectedHubOs(hubRecord);
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
      setLoadingRecipeCodOs(null);
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
      loaded={loaded}
      metrics={filteredMetrics}
      rawMetrics={metrics}
      filters={filters}
      onChangeFilters={handleChangeFilters}
      onLoad={handleLoad}
      onRefresh={() => lastApiFilters && reload(lastApiFilters)}
      empresasUnicas={empresasUnicas}
      etapasUnicas={etapasUnicas}
      pedidosMap={pedidosMap}
      selectedHubOs={selectedHubOs}
      onOpenRecipe={handleOpenRecipe}
      onCloseRecipe={() => setSelectedHubOs(null)}
      loadingRecipeCodOs={loadingRecipeCodOs}
      // Bridge status
      bridgeHealth={bridge.health}
      bridgeCircuitOpen={bridge.isCircuitOpen}
      bridgeErrorMessage={bridge.errorMessage}
      bridgeLastCheckedAt={bridge.lastCheckedAt}
      onBridgeRetry={bridge.refresh}
      // Empresa
      empresasDisponiveis={empresas}
      empresasLoading={empresasLoading}
      defaultCodEmpresa={codEmpresa}
      canSeeAll={canSeeAll}
    />
  );
};

export default OsDashboardPage;
