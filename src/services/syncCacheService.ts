// src/services/syncCacheService.ts
// E0.4: Serviço de sincronização via supabase.functions.invoke() (JWT automático)
// Removido: fetch() manual, VITE_SUPABASE_PUBLISHABLE_KEY, whitelist duplicada

import { supabase } from "@/integrations/supabase/client";

export interface SyncStatus {
  sincronizando: boolean;
  ultimaDataCache: string | null;
  dataAlvo: string; // D-1
  diasFaltando: number;
  mensagem: string;
  progresso?: {
    empresaAtual: number;
    totalEmpresas: number;
    empresaNome: string;
  };
}

export interface SyncResult {
  success: boolean;
  registrosSincronizados: number;
  erro?: string;
  tempoMs: number;
}

/**
 * Retorna a data de ontem (D-1) no formato YYYY-MM-DD
 */
export function getDataOntem(): string {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  return ontem.toISOString().split('T')[0];
}

/**
 * Retorna a última data disponível no cache
 */
export async function getUltimaDataCache(): Promise<string | null> {
  const { data, error } = await supabase
    .from('vendas_agregado_diario')
    .select('data')
    .order('data', { ascending: false })
    .limit(1);
  
  if (error || !data || data.length === 0) {
    return null;
  }
  
  return data[0].data;
}

/**
 * Calcula quantos dias estão faltando no cache (até D-1)
 */
export function calcularDiasFaltando(ultimaDataCache: string | null, dataAlvo: string): number {
  if (!ultimaDataCache) {
    return 30;
  }
  
  const ultima = new Date(ultimaDataCache + 'T12:00:00');
  const alvo = new Date(dataAlvo + 'T12:00:00');
  
  const diffMs = alvo.getTime() - ultima.getTime();
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDias);
}

/**
 * Verifica o status atual da sincronização
 */
export async function verificarStatusSync(): Promise<SyncStatus> {
  const ultimaDataCache = await getUltimaDataCache();
  const dataAlvo = getDataOntem();
  const diasFaltando = calcularDiasFaltando(ultimaDataCache, dataAlvo);
  
  let mensagem = '';
  
  if (diasFaltando === 0) {
    mensagem = `Cache atualizado até ${ultimaDataCache}`;
  } else if (diasFaltando === 1) {
    mensagem = `Falta 1 dia para sincronizar (${dataAlvo})`;
  } else if (diasFaltando <= 7) {
    mensagem = `Faltam ${diasFaltando} dias para sincronizar`;
  } else {
    mensagem = `Cache desatualizado: faltam ${diasFaltando} dias`;
  }
  
  return {
    sincronizando: false,
    ultimaDataCache,
    dataAlvo,
    diasFaltando,
    mensagem,
  };
}

/**
 * E0.4: Sincroniza o cache via supabase.functions.invoke()
 * JWT do usuário logado é propagado automaticamente.
 * Apenas admin pode executar (validação server-side).
 * Usa modo histórico para sincronizar todas as empresas de uma vez.
 */
export async function sincronizarCache(
  onProgress?: (status: SyncStatus) => void
): Promise<SyncResult> {
  const startTime = performance.now();
  
  try {
    const ultimaDataCache = await getUltimaDataCache();
    const dataAlvo = getDataOntem();
    const diasFaltando = calcularDiasFaltando(ultimaDataCache, dataAlvo);
    
    console.log('[syncCacheService] Iniciando sincronização:', {
      ultimaDataCache,
      dataAlvo,
      diasFaltando,
    });
    
    if (diasFaltando === 0) {
      return {
        success: true,
        registrosSincronizados: 0,
        tempoMs: Math.round(performance.now() - startTime),
      };
    }
    
    // Calcular data de início (dia seguinte ao último no cache)
    let dataInicio: string;
    if (ultimaDataCache) {
      const proximoDia = new Date(ultimaDataCache + 'T12:00:00');
      proximoDia.setDate(proximoDia.getDate() + 1);
      dataInicio = proximoDia.toISOString().split('T')[0];
    } else {
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
      dataInicio = trintaDiasAtras.toISOString().split('T')[0];
    }
    
    console.log(`[syncCacheService] Sincronizando de ${dataInicio} até ${dataAlvo}`);
    
    // Notificar início
    if (onProgress) {
      onProgress({
        sincronizando: true,
        ultimaDataCache,
        dataAlvo,
        diasFaltando,
        mensagem: 'Iniciando sincronização...',
      });
    }
    
    // E0.4: Usar modo histórico — a Edge Function cuida de todas as empresas
    const { data, error } = await supabase.functions.invoke('sync-agregados-diarios', {
      body: {
        historico: true,
        dataInicio,
        dataFim: dataAlvo,
      },
    });
    
    const tempoMs = Math.round(performance.now() - startTime);
    
    if (error) {
      console.error('[syncCacheService] Erro na invocação:', error);
      return {
        success: false,
        registrosSincronizados: 0,
        erro: error.message || String(error),
        tempoMs,
      };
    }
    
    console.log('[syncCacheService] Resposta:', data);
    
    // Notificar conclusão
    if (onProgress) {
      onProgress({
        sincronizando: false,
        ultimaDataCache: dataAlvo,
        dataAlvo,
        diasFaltando: 0,
        mensagem: 'Sincronização enviada (processando em background)',
      });
    }
    
    return {
      success: data?.success ?? true,
      registrosSincronizados: data?.registros ?? 0,
      tempoMs,
    };
    
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[syncCacheService] Erro fatal:', message);
    
    return {
      success: false,
      registrosSincronizados: 0,
      erro: message,
      tempoMs: Math.round(performance.now() - startTime),
    };
  }
}

/**
 * Verifica se precisa sincronizar e dispara automaticamente se necessário
 */
export async function sincronizarSeNecessario(
  onProgress?: (status: SyncStatus) => void
): Promise<boolean> {
  const status = await verificarStatusSync();
  
  if (status.diasFaltando === 0) {
    console.log('[syncCacheService] Cache já está atualizado');
    return false;
  }
  
  console.log(`[syncCacheService] Cache desatualizado, iniciando sync (${status.diasFaltando} dias)`);
  
  sincronizarCache(onProgress).then(result => {
    if (result.success) {
      console.log(`[syncCacheService] Sync concluída: ${result.registrosSincronizados} registros`);
    } else {
      console.error('[syncCacheService] Sync falhou:', result.erro);
    }
  });
  
  return true;
}
