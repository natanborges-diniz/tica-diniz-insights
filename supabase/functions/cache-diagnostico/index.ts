// supabase/functions/cache-diagnostico/index.ts
// Endpoint de diagnóstico do cache de vendas

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CacheStatus {
  tipo: 'diario' | 'mensal' | 'vazio';
  totalRegistros: number;
  ultimaData: string | null;
  primeiraData: string | null;
  mesesDisponiveis: string[];
  mesesFaltando: string[];
  ultimaSincronizacao: string | null;
}

function getUltimoDiaMes(ano: number, mes: number): string {
  const ultimoDia = new Date(ano, mes + 1, 0);
  return ultimoDia.toISOString().split('T')[0];
}

function isUltimoDiaMes(data: string): boolean {
  const d = new Date(data + 'T12:00:00');
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() === ultimoDia;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar estatísticas do cache
    const { data: cacheData, error: cacheError, count } = await supabase
      .from('vendas_agregado_diario')
      .select('data, atualizado_em', { count: 'exact' })
      .order('data', { ascending: false })
      .limit(500);

    if (cacheError) {
      throw new Error(`Erro ao consultar cache: ${cacheError.message}`);
    }

    // Calcular estatísticas
    const datasUnicas = [...new Set((cacheData || []).map(d => d.data))];
    const atualizacoes = (cacheData || [])
      .map(d => d.atualizado_em)
      .filter(Boolean)
      .sort()
      .reverse();

    // Verificar tipo de dados
    const todasMensais = datasUnicas.length > 0 && 
      datasUnicas.every(d => isUltimoDiaMes(d));

    // Calcular meses esperados (últimos 13 meses)
    const hoje = new Date();
    const mesesEsperados: string[] = [];
    for (let i = 0; i <= 12; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      mesesEsperados.push(getUltimoDiaMes(d.getFullYear(), d.getMonth()));
    }

    // Meses disponíveis vs faltando
    const mesesDisponiveis = datasUnicas.filter(d => isUltimoDiaMes(d));
    const mesesFaltando = mesesEsperados.filter(m => !mesesDisponiveis.includes(m));

    // Buscar última sincronização do ETL
    const { data: etlData } = await supabase
      .from('etl_controle')
      .select('atualizado_em')
      .eq('entidade', 'vendas_agregado_mensal')
      .single();

    const status: CacheStatus = {
      tipo: datasUnicas.length === 0 ? 'vazio' : (todasMensais ? 'mensal' : 'diario'),
      totalRegistros: count || 0,
      ultimaData: datasUnicas[0] || null,
      primeiraData: datasUnicas[datasUnicas.length - 1] || null,
      mesesDisponiveis: mesesDisponiveis.slice(0, 12),
      mesesFaltando,
      ultimaSincronizacao: etlData?.atualizado_em || atualizacoes[0] || null,
    };

    // Gerar recomendações
    const recomendacoes: string[] = [];
    
    if (status.tipo === 'vazio') {
      recomendacoes.push('Cache vazio - execute sincronização completa');
    } else if (mesesFaltando.length > 0) {
      recomendacoes.push(`Sincronizar ${mesesFaltando.length} meses faltando: ${mesesFaltando.slice(0, 3).join(', ')}`);
    }

    if (status.tipo === 'mensal' && !mesesFaltando.includes(getUltimoDiaMes(hoje.getFullYear(), hoje.getMonth()))) {
      recomendacoes.push('Mês atual não sincronizado - dados podem estar desatualizados');
    }

    // Calcular saúde do cache (0-100)
    const saudeCache = status.tipo === 'vazio' 
      ? 0 
      : Math.round((mesesDisponiveis.length / mesesEsperados.length) * 100);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        status,
        saude: {
          score: saudeCache,
          label: saudeCache >= 90 ? 'Excelente' : 
                 saudeCache >= 70 ? 'Bom' : 
                 saudeCache >= 50 ? 'Regular' : 
                 saudeCache > 0 ? 'Crítico' : 'Vazio',
        },
        recomendacoes,
        debug: {
          datasVerificadas: datasUnicas.length,
          mesesEsperados: mesesEsperados.length,
        },
      }, null, 2),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        } 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Erro no diagnóstico:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 500, 
        headers: {
          ...corsHeaders, 
          "Content-Type": "application/json" 
        } 
      }
    );
  }
});
