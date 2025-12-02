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

    // Busca clientes da API Firebird v1 com paginação
    let allClientes: any[] = [];
    let pagina = 1;
    const limite = 1000;
    let hasMore = true;

    while (hasMore) {
      console.log(`Buscando página ${pagina} de clientes...`);
      
      const json = await firebirdGet('/api/v1/clientes', {
        limite,
        pagina,
      });

      const clientes = json.data ?? json.clientes ?? json;

      if (!Array.isArray(clientes)) {
        console.error('Formato inesperado de resposta de clientes:', json);
        throw new Error('Resposta de clientes não é um array');
      }

      console.log(`Página ${pagina}: ${clientes.length} clientes`);
      allClientes = allClientes.concat(clientes);

      // Se retornou menos que o limite, não há mais páginas
      hasMore = clientes.length === limite;
      pagina++;

      // Limite de segurança para evitar loop infinito
      if (pagina > 100) {
        console.log('Limite de páginas atingido (100)');
        break;
      }
    }

    console.log(`Total recebido: ${allClientes.length} clientes da API`);

    // Mapeia para o formato da tabela stg.pessoa (conforme novo guia API v1)
    const rows = allClientes.map((c: any) => ({
      cod_pessoa: c.cod_pessoa ?? c.codPessoa ?? c.id,
      nome: c.nome ?? c.razao_social ?? c.razaoSocial,
      identificador: c.cpf ?? c.cnpj ?? c.cpfCnpj ?? null,
      tipo: c.pessoa_empresa ? 'PJ' : 'PF',
      cidade: c.cidade ?? null,
      uf: c.uf ?? c.estado ?? null,
      telefone: c.telefone ?? c.celular ?? null,
      email: c.email ?? null,
      ativo: c.ativo ?? true,
      vendedor: c.pessoa_vendedor ?? c.pessoaVendedor ?? false,
    })).filter((r: any) => r.cod_pessoa != null);

    console.log(`Gravando ${rows.length} clientes em stg.pessoa...`);

    // Grava em lotes de 500 para evitar timeout
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      console.log(`Gravando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(rows.length / batchSize)}...`);
      
      const { error } = await supabase
        .from('pessoa')
        .upsert(batch, { onConflict: 'cod_pessoa' });

      if (error) {
        console.error('Erro ao fazer upsert em stg.pessoa:', error);
        throw error;
      }
    }

    console.log('Sync de clientes concluído com sucesso.');

    return new Response(
      JSON.stringify({
        success: true,
        message: `${rows.length} clientes sincronizados com sucesso`,
        totalRecebidos: allClientes.length,
        totalGravados: rows.length,
        paginas: pagina - 1,
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
