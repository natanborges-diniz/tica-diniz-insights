// src/services/syncCacheService.ts
// Serviço para sincronização automática do cache de vendas até D-1

import { supabase } from "@/integrations/supabase/client";

// Empresas ativas no sistema (mesmo array da Edge Function)
const EMPRESAS_ATIVAS = [1, 2, 4, 6, 9, 13, 14, 15, 16, 17, 18];

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
    // Se não tem cache, considera 30 dias para não travar
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
 * Sincroniza o cache chamando a Edge Function sync-agregados-diarios
 * Sincroniza de (ultimaDataCache + 1) até D-1
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
      // Se não tem cache, sincronizar últimos 30 dias
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
        progresso: {
          empresaAtual: 0,
          totalEmpresas: EMPRESAS_ATIVAS.length,
          empresaNome: '',
        },
      });
    }
    
    // Sincronizar cada empresa individualmente (como requerido pela Edge Function)
    let totalRegistros = 0;
    let erros: string[] = [];
    
    for (let i = 0; i < EMPRESAS_ATIVAS.length; i++) {
      const empresa = EMPRESAS_ATIVAS[i];
      
      if (onProgress) {
        onProgress({
          sincronizando: true,
          ultimaDataCache,
          dataAlvo,
          diasFaltando,
          mensagem: `Sincronizando empresa ${empresa}...`,
          progresso: {
            empresaAtual: i + 1,
            totalEmpresas: EMPRESAS_ATIVAS.length,
            empresaNome: `Loja ${empresa}`,
          },
        });
      }
      
      try {
        // Chamar Edge Function para esta empresa via fetch (supabase.functions.invoke não suporta query params)
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-agregados-diarios?empresa=${empresa}&dataInicio=${dataInicio}&dataFim=${dataAlvo}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[syncCacheService] Erro empresa ${empresa}:`, errorText);
          erros.push(`Empresa ${empresa}: ${response.status}`);
          continue;
        }
        
        const result = await response.json();
        
        if (result.registros) {
          totalRegistros += result.registros;
        }
        
        console.log(`[syncCacheService] Empresa ${empresa}: ${result.registros || 0} registros`);
        
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[syncCacheService] Erro empresa ${empresa}:`, message);
        erros.push(`Empresa ${empresa}: ${message}`);
      }
      
      // Pequena pausa entre empresas para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    const tempoMs = Math.round(performance.now() - startTime);
    
    console.log(`[syncCacheService] Sincronização concluída: ${totalRegistros} registros em ${tempoMs}ms`);
    
    return {
      success: erros.length === 0,
      registrosSincronizados: totalRegistros,
      erro: erros.length > 0 ? erros.join('; ') : undefined,
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
 * Retorna true se iniciou sincronização, false se cache já está atualizado
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
  
  // Sincronizar em background
  sincronizarCache(onProgress).then(result => {
    if (result.success) {
      console.log(`[syncCacheService] Sync concluída: ${result.registrosSincronizados} registros`);
    } else {
      console.error('[syncCacheService] Sync falhou:', result.erro);
    }
  });
  
  return true;
}
