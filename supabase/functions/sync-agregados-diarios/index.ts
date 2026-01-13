// supabase/functions/sync-agregados-diarios/index.ts
// Sincroniza agregados diários de vendas da API Firebird para o Supabase
// Suporta carga histórica em lotes e sincronização incremental

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { firebirdGet } from '../_shared/firebirdApi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResumoFormaPagamento {
  empresa: string;
  empresa_cod_logico: number;
  vendedor: string;
  formapagamento: string;
  totalgeral: number;
  qtd_vendas: number;
  total_bruto: number;
  total_desconto: number;
  perc_desconto: number;
}

interface AgregadoDiario {
  data: string;
  cod_empresa: number;
  vendedor: string;
  forma_pagamento: string;
  total_vendido: number;
  total_bruto: number;
  total_desconto: number;
  qtd_vendas: number;
  atualizado_em: string;
}

// Formatar data para YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Adicionar meses a uma data
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// Obter último dia do mês
function getLastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

// Sincronizar um período específico
async function syncPeriodo(
  supabase: any,
  dataInicio: string,
  dataFim: string
): Promise<{ registros: number; erro?: string }> {
  console.log(`[sync] Buscando período ${dataInicio} a ${dataFim}...`);
  
  try {
    // Buscar dados da API Firebird (sempre sem cache para garantir dados frescos)
    const dados = await firebirdGet('/api/v1/vendas/resumo-formas-pagamento', {
      dataInicio,
      dataFim,
      cache: 0,
    }) as ResumoFormaPagamento[];
    
    console.log(`[sync] Recebidos ${dados.length} registros do Firebird`);
    
    if (dados.length === 0) {
      return { registros: 0 };
    }
    
    // A API retorna dados agregados por período, precisamos separar por dia
    // Como a query original não tem granularidade diária, vamos armazenar 
    // como um registro único para o período (usando dataFim como referência)
    // NOTA: Para granularidade diária real, a API precisaria retornar por dia
    
    const agora = new Date().toISOString();
    
    // Agrupar por empresa + vendedor + forma de pagamento
    const agregados: AgregadoDiario[] = dados.map((d) => ({
      data: dataFim, // Usar data fim como referência do período
      cod_empresa: d.empresa_cod_logico,
      vendedor: (d.vendedor || '').trim(),
      forma_pagamento: d.formapagamento || '',
      total_vendido: d.totalgeral || 0,
      total_bruto: d.total_bruto || 0,
      total_desconto: d.total_desconto || 0,
      qtd_vendas: d.qtd_vendas || 0,
      atualizado_em: agora,
    }));
    
    // Upsert no Supabase em lotes de 500
    const batchSize = 500;
    let totalInseridos = 0;
    
    for (let i = 0; i < agregados.length; i += batchSize) {
      const batch = agregados.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('vendas_agregado_diario')
        .upsert(batch, {
          onConflict: 'data,cod_empresa,vendedor,forma_pagamento',
          ignoreDuplicates: false,
        });
      
      if (error) {
        console.error(`[sync] Erro ao inserir batch ${i / batchSize + 1}:`, error);
        throw error;
      }
      
      totalInseridos += batch.length;
      console.log(`[sync] Inseridos ${totalInseridos}/${agregados.length} registros`);
    }
    
    return { registros: totalInseridos };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sync] Erro no período ${dataInicio} a ${dataFim}:`, message);
    return { registros: 0, erro: message };
  }
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Parâmetros: dataInicio, dataFim, maxMeses
    const url = new URL(req.url);
    const dataInicioParam = url.searchParams.get('dataInicio');
    const dataFimParam = url.searchParams.get('dataFim');
    const maxMeses = parseInt(url.searchParams.get('maxMeses') || '6', 10);
    const modoHistorico = url.searchParams.get('historico') === 'true';
    
    // Default: se não informado, sincroniza o dia atual
    const hoje = formatDate(new Date());
    const dataInicio = dataInicioParam || hoje;
    const dataFim = dataFimParam || hoje;
    
    console.log(`[sync-agregados-diarios] Iniciando sync`);
    console.log(`[sync-agregados-diarios] Período: ${dataInicio} a ${dataFim}`);
    console.log(`[sync-agregados-diarios] Max meses por chamada: ${maxMeses}`);
    console.log(`[sync-agregados-diarios] Modo histórico: ${modoHistorico}`);
    
    // Criar cliente Supabase com service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const resultados: Array<{
      periodo: string;
      registros: number;
      erro?: string;
    }> = [];
    
    if (modoHistorico) {
      // Modo histórico: processar em lotes mensais
      let currentDate = new Date(dataInicio + 'T00:00:00');
      const endDate = new Date(dataFim + 'T00:00:00');
      let mesesProcessados = 0;
      
      while (currentDate <= endDate && mesesProcessados < maxMeses) {
        // Calcular fim do mês ou dataFim (o que vier primeiro)
        const fimMes = getLastDayOfMonth(currentDate);
        const fimPeriodo = fimMes <= endDate ? fimMes : endDate;
        
        const inicioStr = formatDate(currentDate);
        const fimStr = formatDate(fimPeriodo);
        
        const result = await syncPeriodo(supabase, inicioStr, fimStr);
        
        resultados.push({
          periodo: `${inicioStr} a ${fimStr}`,
          registros: result.registros,
          erro: result.erro,
        });
        
        // Avançar para próximo mês
        currentDate = addMonths(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), 1);
        mesesProcessados++;
      }
      
      // Salvar progresso no etl_controle
      const ultimoMesSyncado = resultados.length > 0 
        ? resultados[resultados.length - 1].periodo.split(' a ')[1]
        : null;
      
      if (ultimoMesSyncado) {
        await supabase.from('etl_controle').upsert({
          entidade: 'vendas_agregado_diario',
          ultima_data: ultimoMesSyncado,
          atualizado_em: new Date().toISOString(),
        }, {
          onConflict: 'entidade',
        });
      }
      
      const totalRegistros = resultados.reduce((sum, r) => sum + r.registros, 0);
      const erros = resultados.filter(r => r.erro).length;
      
      return new Response(
        JSON.stringify({
          success: erros === 0,
          modo: 'historico',
          mesesProcessados,
          totalRegistros,
          resultados,
          proximoPeriodo: currentDate <= endDate ? formatDate(currentDate) : null,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      // Modo normal: sincronizar período único
      const result = await syncPeriodo(supabase, dataInicio, dataFim);
      
      return new Response(
        JSON.stringify({
          success: !result.erro,
          modo: 'normal',
          periodo: `${dataInicio} a ${dataFim}`,
          registros: result.registros,
          erro: result.erro,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-agregados-diarios] Erro fatal:', message);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
