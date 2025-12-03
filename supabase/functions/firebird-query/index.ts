import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Construir URL do bridge
    const params = new URLSearchParams();
    if (dataInicio) params.append('dataInicio', dataInicio);
    if (dataFim) params.append('dataFim', dataFim);
    if (codEmpresa) params.append('codEmpresa', codEmpresa);

    const bridgeEndpoint = `${bridgeUrl}/api/${endpoint}?${params.toString()}`;
    
    console.log(`Chamando bridge: ${bridgeEndpoint}`);
    
    const response = await fetch(bridgeEndpoint);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro no bridge');
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
