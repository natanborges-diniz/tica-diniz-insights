// supabase/functions/sync-clientes/index.ts
// E0.3: JWT obrigatório + role admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { firebirdGet } from '../_shared/firebirdApi.ts';
import { authGuard, corsHeaders } from '../_shared/authGuard.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // E0.3: Auth guard — admin only
    await authGuard(req, { requiredRole: "admin" });

    const url = new URL(req.url);
    let maxPaginas = parseInt(url.searchParams.get('maxPaginas') || '10');
    let limiteRegistros = parseInt(url.searchParams.get('limite') || '500');
    let resetProgresso = url.searchParams.get('reset') === 'true';

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        maxPaginas = body.maxPaginas ?? maxPaginas;
        limiteRegistros = body.limite ?? limiteRegistros;
        resetProgresso = body.reset ?? resetProgresso;
      } catch {}
    }

    console.log(`Iniciando sync de clientes (max ${maxPaginas} páginas, ${limiteRegistros} por página)...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: controle } = await supabase
      .from('etl_controle').select('pagina_atual').eq('entidade', 'clientes').maybeSingle();

    let paginaInicial = 1;
    if (!resetProgresso && controle?.pagina_atual && controle.pagina_atual > 1) {
      paginaInicial = controle.pagina_atual;
    }

    let allClientes: any[] = [];
    let pagina = paginaInicial;
    let paginasProcessadas = 0;
    let hasMore = true;

    while (hasMore && paginasProcessadas < maxPaginas) {
      const json = await firebirdGet('/api/v1/clientes', { limite: limiteRegistros, pagina });
      const clientes = json.data ?? json.clientes ?? json;
      if (!Array.isArray(clientes)) throw new Error('Resposta não é um array');
      if (clientes.length > 0) allClientes = allClientes.concat(clientes);
      hasMore = clientes.length === limiteRegistros;
      pagina++; paginasProcessadas++;
    }

    const rows = allClientes.map((c: any) => ({
      cod_pessoa: c.cod_pessoa ?? c.codPessoa ?? c.id,
      nome: c.nome ?? c.razao_social ?? c.razaoSocial,
      identificador: c.cpf ?? c.cnpj ?? c.cpfCnpj ?? null,
      tipo: c.pessoa_empresa ? 'PJ' : 'PF',
      cidade: c.cidade ?? null, uf: c.uf ?? c.estado ?? null,
      telefone: c.telefone ?? c.celular ?? null, email: c.email ?? null,
      ativo: c.ativo ?? true, vendedor: c.pessoa_vendedor ?? c.pessoaVendedor ?? false,
    })).filter((r: any) => r.cod_pessoa != null);

    const batchSize = 250;
    for (let i = 0; i < rows.length; i += batchSize) {
      const { error } = await supabase.from('pessoa').upsert(rows.slice(i, i + batchSize), { onConflict: 'cod_pessoa' });
      if (error) throw error;
    }

    const proximaPagina = hasMore ? pagina : 1;
    await supabase.from('etl_controle').upsert({
      entidade: 'clientes', ultima_data: new Date().toISOString().slice(0, 10),
      pagina_atual: proximaPagina, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'entidade' });

    const concluido = !hasMore;
    return new Response(JSON.stringify({
      success: true, totalGravados: rows.length, concluido,
      paginaInicial, paginaFinal: pagina - 1, paginasProcessadas,
      proximaPagina: hasMore ? pagina : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Erro no sync de clientes:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
