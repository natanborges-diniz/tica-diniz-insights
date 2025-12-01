import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { firebirdGet } from '../_shared/firebirdApi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Iniciando sync de clientes...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Busca clientes da API Firebird
    const json = await firebirdGet('/api/clientes');
    const clientes = json.data ?? json.clientes ?? json;

    if (!Array.isArray(clientes)) {
      console.error('Formato inesperado de resposta de clientes:', json);
      throw new Error('Resposta de clientes não é um array');
    }

    console.log(`Recebidos ${clientes.length} clientes da API`);

    // Mapeia para o formato da tabela stg.pessoa
    const rows = clientes.map((c: any) => ({
      cod_pessoa: c.codPessoa ?? c.id ?? c.codigo,
      nome: c.nome ?? c.razaoSocial,
      identificador: c.cpfCnpj ?? c.cpf ?? c.cnpj ?? null,
      tipo: c.tipo ?? null,
      cidade: c.cidade ?? null,
      uf: c.uf ?? null,
      telefone: c.telefone ?? c.celular ?? null,
      email: c.email ?? null,
      ativo: c.ativo ?? true,
      vendedor: c.vendedor ?? false,
    })).filter((r: any) => r.cod_pessoa != null);

    console.log(`Gravando ${rows.length} clientes em stg.pessoa...`);

    const { error } = await supabase
      .from('pessoa')
      .upsert(rows, { onConflict: 'cod_pessoa' });

    if (error) {
      console.error('Erro ao fazer upsert em stg.pessoa:', error);
      throw error;
    }

    console.log('Sync de clientes concluído com sucesso.');

    return new Response(
      JSON.stringify({
        success: true,
        message: `${rows.length} clientes sincronizados com sucesso`,
        totalRecebidos: clientes.length,
        totalGravados: rows.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Erro no sync de clientes:', error);
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
