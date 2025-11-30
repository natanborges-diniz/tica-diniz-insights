import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    console.log('Iniciando transformação DW (stg → dw → dq)...');

    // Cria cliente Supabase com service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Chamar a stored procedure que faz toda a transformação
    console.log('Executando stored procedure dw.processar_transformacao_dw()...');
    
    const { data, error } = await supabase.rpc('processar_transformacao_dw');

    if (error) {
      console.error('Erro ao executar transformação DW:', error);
      throw error;
    }

    console.log('Transformação DW concluída com sucesso!');
    console.log('Registros processados:', data);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transformação DW concluída com sucesso',
        registros_processados: data,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Erro na transformação DW:', error);
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
