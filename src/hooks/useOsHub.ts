// src/hooks/useOsHub.ts
// Hook para o Hub de Receitas - estratégia cache-first com incremento

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  OsHubRecord,
  fetchOsHubFromFirebird,
  saveToCache,
  loadFromCache,
  getCacheStats,
} from '@/services/osHubService';
import { EmpresaParam } from '@/services/firebirdBridge';

export interface OsHubFilters {
  empresa: EmpresaParam;
  status: string;
  etapa: string;
  busca: string;
  temReceita: 'TODOS' | 'SIM' | 'NAO';
  temImagem: 'TODOS' | 'SIM' | 'NAO';
}

const PAGE_SIZE = 50;

export function useOsHub() {
  const [data, setData] = useState<OsHubRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selectedOs, setSelectedOs] = useState<OsHubRecord | null>(null);
  const [cacheStats, setCacheStats] = useState<{ total: number; lastUpdate: string | null }>({ total: 0, lastUpdate: null });

  const [filters, setFilters] = useState<OsHubFilters>({
    empresa: null,
    status: 'TODOS',
    etapa: 'TODAS',
    busca: '',
    temReceita: 'TODOS',
    temImagem: 'TODOS',
  });

  // Carregar stats do cache ao montar
  useEffect(() => {
    getCacheStats().then(setCacheStats).catch(() => {});
  }, []);

  // Filtros client-side
  const filteredData = useMemo(() => {
    let result = data;

    if (filters.status !== 'TODOS') {
      if (filters.status === 'ATRASADAS') {
        result = result.filter(os => os.statusAtraso === 'ATRASO' || os.statusAtraso === 'ATRASO_LEVE');
      } else {
        result = result.filter(os => os.statusAtraso === filters.status);
      }
    }

    if (filters.etapa !== 'TODAS') {
      result = result.filter(os => os.etapa === filters.etapa);
    }

    if (filters.temReceita !== 'TODOS') {
      result = result.filter(os => filters.temReceita === 'SIM' ? os.temReceita : !os.temReceita);
    }

    if (filters.temImagem !== 'TODOS') {
      result = result.filter(os => filters.temImagem === 'SIM' ? os.temImagem : !os.temImagem);
    }

    if (filters.busca.trim()) {
      const termo = filters.busca.toLowerCase().trim();
      result = result.filter(os =>
        os.numeroOs.toLowerCase().includes(termo) ||
        os.cliente.toLowerCase().includes(termo) ||
        String(os.codOs).includes(termo)
      );
    }

    return result;
  }, [data, filters]);

  // Listas únicas para filtros
  const etapasUnicas = useMemo(() =>
    Array.from(new Set(data.map(os => os.etapa).filter(Boolean))).sort()
  , [data]);

  // Carregar do cache (Supabase)
  const loadCache = useCallback(async (params: {
    codEmpresa?: EmpresaParam;
    dataInicio?: string;
    dataFim?: string;
  }) => {
    try {
      setLoading(true);
      setError(null);

      const codEmp = params.codEmpresa === 'ALL' ? 'ALL' : params.codEmpresa ? String(params.codEmpresa) : undefined;

      const { data: cached, count } = await loadFromCache({
        codEmpresa: codEmp,
        dataInicio: params.dataInicio,
        dataFim: params.dataFim,
        limit: 1000, // Load more for client-side filtering
      });

      setData(cached);
      setTotalCount(count);
      setPage(0);

      console.log('[useOsHub] Loaded from cache:', cached.length, 'of', count);
    } catch (err) {
      console.error('[useOsHub] Cache load error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar cache');
    } finally {
      setLoading(false);
    }
  }, []);

  // Sincronizar do Firebird → Cache
  const syncFromFirebird = useCallback(async (params: {
    empresa: EmpresaParam;
    dataInicio: string;
    dataFim: string;
  }) => {
    try {
      setSyncing(true);
      setError(null);

      console.log('[useOsHub] Syncing from Firebird:', params);
      const records = await fetchOsHubFromFirebird(params);

      if (records.length > 0) {
        await saveToCache(records);
      }

      // Recarregar do cache após sync
      setData(records);
      setTotalCount(records.length);
      setPage(0);

      // Atualizar stats
      const stats = await getCacheStats();
      setCacheStats(stats);

      console.log('[useOsHub] Sync complete:', records.length, 'records');
    } catch (err) {
      console.error('[useOsHub] Sync error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar com Firebird');
    } finally {
      setSyncing(false);
    }
  }, []);

  // Paginação nos dados filtrados
  const paginatedData = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filteredData.slice(start, start + PAGE_SIZE);
  }, [filteredData, page]);

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

  // Buscar OS por código (para detalhe)
  const findOsByCodOs = useCallback((codOs: number): OsHubRecord | null => {
    return data.find(os => os.codOs === codOs) ?? null;
  }, [data]);

  return {
    data: paginatedData,
    allData: filteredData,
    totalCount,
    loading,
    syncing,
    error,
    filters,
    setFilters,
    page,
    setPage,
    totalPages,
    pageSize: PAGE_SIZE,
    etapasUnicas,
    selectedOs,
    setSelectedOs,
    loadCache,
    syncFromFirebird,
    findOsByCodOs,
    cacheStats,
  };
}
