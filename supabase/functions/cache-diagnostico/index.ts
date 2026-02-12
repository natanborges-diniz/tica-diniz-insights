// supabase/functions/cache-diagnostico/index.ts
// E0.3: JWT obrigatório + role admin

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // E0.3: Auth guard — admin only
    await authGuard(req, { requiredRole: "admin" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: cacheData, error: cacheError, count } = await supabase
      .from('vendas_agregado_diario')
      .select('data, atualizado_em', { count: 'exact' })
      .order('data', { ascending: false })
      .limit(500);

    if (cacheError) throw new Error(`Erro ao consultar cache: ${cacheError.message}`);

    const datasUnicas = [...new Set((cacheData || []).map(d => d.data))];
    const atualizacoes = (cacheData || []).map(d => d.atualizado_em).filter(Boolean).sort().reverse();

    const todasMensais = datasUnicas.length > 0 && datasUnicas.every(d => isUltimoDiaMes(d));

    const hoje = new Date();
    const mesesEsperados: string[] = [];
    for (let i = 0; i <= 12; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      mesesEsperados.push(getUltimoDiaMes(d.getFullYear(), d.getMonth()));
    }

    const mesesDisponiveis = datasUnicas.filter(d => isUltimoDiaMes(d));
    const mesesFaltando = mesesEsperados.filter(m => !mesesDisponiveis.includes(m));

    const { data: etlData } = await supabase
      .from('etl_controle').select('atualizado_em').eq('entidade', 'vendas_agregado_mensal').single();

    const status: CacheStatus = {
      tipo: datasUnicas.length === 0 ? 'vazio' : (todasMensais ? 'mensal' : 'diario'),
      totalRegistros: count || 0,
      ultimaData: datasUnicas[0] || null,
      primeiraData: datasUnicas[datasUnicas.length - 1] || null,
      mesesDisponiveis: mesesDisponiveis.slice(0, 12),
      mesesFaltando,
      ultimaSincronizacao: etlData?.atualizado_em || atualizacoes[0] || null,
    };

    const recomendacoes: string[] = [];
    if (status.tipo === 'vazio') recomendacoes.push('Cache vazio - execute sincronização completa');
    else if (mesesFaltando.length > 0) recomendacoes.push(`Sincronizar ${mesesFaltando.length} meses faltando`);

    const saudeCache = status.tipo === 'vazio' ? 0 : Math.round((mesesDisponiveis.length / mesesEsperados.length) * 100);

    return new Response(JSON.stringify({
      success: true, timestamp: new Date().toISOString(), status,
      saude: { score: saudeCache, label: saudeCache >= 90 ? 'Excelente' : saudeCache >= 70 ? 'Bom' : saudeCache >= 50 ? 'Regular' : saudeCache > 0 ? 'Crítico' : 'Vazio' },
      recomendacoes,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Erro no diagnóstico:', error);
    return new Response(JSON.stringify({
      success: false, error: error instanceof Error ? error.message : String(error),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
