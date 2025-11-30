import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { firebirdGet } from '../_shared/firebirdApi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Iniciando sync de vendas...');

    // Cria cliente Supabase com service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Sistema de sincronização incremental via stg.etl_controle
    const hoje = new Date();
    const dataFim = hoje.toISOString().slice(0, 10); // YYYY-MM-DD
    
    // Buscar última data sincronizada
    const { data: controle, error: controleError } = await supabase
      .from('etl_controle')
      .select('ultima_data')
      .eq('entidade', 'vendas')
      .single();

    let dataInicio: string;
    
    if (controleError || !controle) {
      // Primeira execução: buscar últimos 365 dias
      const umAnoAtras = new Date(hoje.getTime() - 365 * 24 * 60 * 60 * 1000);
      dataInicio = umAnoAtras.toISOString().slice(0, 10);
      console.log('Primeira sincronização de vendas. Buscando últimos 365 dias.');
    } else {
      // Sincronização incremental: buscar desde última data (com 1 dia de segurança)
      const ultimaData = new Date(controle.ultima_data);
      const dataSeguranca = new Date(ultimaData.getTime() - 1 * 24 * 60 * 60 * 1000);
      dataInicio = dataSeguranca.toISOString().slice(0, 10);
      console.log(`Sincronização incremental desde ${controle.ultima_data}`);
    }

    console.log(`Sincronizando vendas de ${dataInicio} até ${dataFim}`);

    // Busca vendas da API Firebird
    const json = await firebirdGet('/api/vendas', {
      dataInicio,
      dataFim,
      // loja: opcional
      // limit/pagina: se existirem
    });

    // Adapta o caminho conforme formato real da resposta
    const vendas = json.data ?? json.vendas ?? json;

    if (!Array.isArray(vendas)) {
      console.error('Formato inesperado de resposta de vendas:', json);
      throw new Error('Resposta de vendas não é um array');
    }

    console.log(`Recebidas ${vendas.length} vendas da API`);

    const vendasRows: any[] = [];
    const itensRows: any[] = [];

    // Processa cada venda e seus itens
    for (const v of vendas) {
      const idVenda = v.idVenda ?? v.id ?? v.numero;

      vendasRows.push({
        id_venda: idVenda,
        numero: v.numero ?? String(idVenda),
        data_emissao: v.dataEmissao ?? v.data ?? null,
        data_lancamento: v.dataLancamento ?? null,
        cod_pessoa: v.cliente?.codPessoa ?? v.codCliente ?? null,
        cod_empresa: v.empresa?.codEmpresa ?? v.codEmpresa ?? null,
        status: v.status ?? null,
        total: v.total ?? v.valorTotal ?? null,
      });

      // Processa itens da venda
      if (Array.isArray(v.itens)) {
        for (const it of v.itens) {
          itensRows.push({
            id_venda: idVenda,
            seq_item: it.seqItem ?? it.sequencia ?? 1,
            cod_produto: it.produto?.codProduto ?? it.codProduto ?? null,
            quantidade: it.quantidade ?? 1,
            valor_unitario: it.valorUnitario ?? null,
            valor_desconto: it.valorDesconto ?? 0,
            valor_total: it.valorTotal ?? null,
          });
        }
      }
    }

    console.log(`Gravando ${vendasRows.length} vendas e ${itensRows.length} itens...`);

    // Grava vendas
    if (vendasRows.length > 0) {
      const { error } = await supabase
        .from('venda')
        .upsert(vendasRows, { onConflict: 'id_venda' });

      if (error) {
        console.error('Erro ao fazer upsert em stg.venda:', error);
        throw error;
      }
    }

    // Grava itens das vendas
    if (itensRows.length > 0) {
      const { error } = await supabase
        .from('venda_item')
        .upsert(itensRows, { onConflict: 'id_venda,seq_item' });

      if (error) {
        console.error('Erro ao fazer upsert em stg.venda_item:', error);
        throw error;
      }
    }

    // Atualizar controle de ETL
    const { error: controleUpdateError } = await supabase
      .from('etl_controle')
      .upsert({
        entidade: 'vendas',
        ultima_data: dataFim,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'entidade' });

    if (controleUpdateError) {
      console.error('Erro ao atualizar stg.etl_controle:', controleUpdateError);
      // Não falha a operação toda, apenas loga o erro
    }

    console.log('Sync de vendas concluído com sucesso.');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sincronização concluída com sucesso`,
        periodo: { dataInicio, dataFim },
        totalVendas: vendasRows.length,
        totalItens: itensRows.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Erro no sync de vendas:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
