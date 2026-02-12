// supabase/functions/firebird-query/index.ts
// E0.3: JWT obrigatório + role admin

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // E0.3: Auth guard — admin only
    await authGuard(req, { requiredRole: "admin" });

    const bridgeUrl = Deno.env.get('FIREBIRD_BRIDGE_URL');
    
    if (!bridgeUrl) {
      return new Response(
        JSON.stringify({ error: 'FIREBIRD_BRIDGE_URL não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint') || 'kpis';
    const dataInicio = url.searchParams.get('dataInicio');
    const dataFim = url.searchParams.get('dataFim');
    const codEmpresa = url.searchParams.get('codEmpresa');

    const params = new URLSearchParams();
    if (dataInicio) params.append('dataInicio', dataInicio);
    if (dataFim) params.append('dataFim', dataFim);
    if (codEmpresa) params.append('codEmpresa', codEmpresa);

    const bridgeEndpoint = `${bridgeUrl}/api/${endpoint}?${params.toString()}`;
    
    const response = await fetch(bridgeEndpoint);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Erro no bridge');

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
