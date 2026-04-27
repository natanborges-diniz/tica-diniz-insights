import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge function para Gestão de Acessos REDE.
 *
 * Hoje a REDE não expõe um endpoint REST público para disparar o Opt-in:
 * o pedido nasce do sistema do parceiro e o aceite é feito manualmente
 * no portal da REDE pelo perfil master da loja.
 *
 * Esta função padroniza o ciclo operacional dentro do nosso admin:
 *   - solicitar_optin: marca a config como "AGUARDANDO_ACEITE" e registra a data
 *   - registrar_aceite: marca como "APROVADO" após confirmação manual
 *   - status: devolve o estado atual da ativação
 *   - reset: limpa o status (em caso de retrabalho)
 *
 * Quando a REDE publicar um endpoint REST oficial de Opt-in, basta
 * acrescentar a chamada HTTP dentro de "solicitar_optin".
 */

type Action = "solicitar_optin" | "registrar_aceite" | "status" | "reset";

interface RequestBody {
  action: Action;
  cod_empresa: number;
  reference?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const { action, cod_empresa, reference } = body || ({} as RequestBody);

    if (!action) throw new Error("action é obrigatório");
    if (typeof cod_empresa !== "number") throw new Error("cod_empresa é obrigatório");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: configRow, error: cfgErr } = await supabase
      .from("adquirentes_config")
      .select("*")
      .eq("adquirente", "REDE")
      .eq("cod_empresa", cod_empresa)
      .maybeSingle();

    if (cfgErr) throw new Error(`Erro ao buscar config: ${cfgErr.message}`);
    if (!configRow) throw new Error(`Configuração REDE inexistente para empresa ${cod_empresa}`);

    let updates: Record<string, unknown> | null = null;

    switch (action) {
      case "solicitar_optin": {
        updates = {
          gv_optin_status: "AGUARDANDO_ACEITE",
          gv_optin_requested_at: new Date().toISOString(),
          gv_optin_reference: reference || null,
          gv_approved_at: null,
        };
        break;
      }
      case "registrar_aceite": {
        updates = {
          gv_optin_status: "APROVADO",
          gv_approved_at: new Date().toISOString(),
        };
        break;
      }
      case "reset": {
        updates = {
          gv_optin_status: null,
          gv_optin_requested_at: null,
          gv_optin_reference: null,
          gv_approved_at: null,
        };
        break;
      }
      case "status": {
        return new Response(
          JSON.stringify({
            cod_empresa,
            optin_status: (configRow as any).gv_optin_status,
            optin_requested_at: (configRow as any).gv_optin_requested_at,
            optin_reference: (configRow as any).gv_optin_reference,
            approved_at: (configRow as any).gv_approved_at,
            last_healthcheck_at: (configRow as any).gv_last_healthcheck_at,
            last_healthcheck_status: (configRow as any).gv_last_healthcheck_status,
            last_healthcheck_message: (configRow as any).gv_last_healthcheck_message,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      default:
        throw new Error(`action '${action}' não suportada`);
    }

    if (updates) {
      const { error: upErr } = await supabase
        .from("adquirentes_config")
        .update(updates)
        .eq("id", configRow.id);
      if (upErr) throw new Error(`Erro ao atualizar config: ${upErr.message}`);
    }

    return new Response(
      JSON.stringify({ ok: true, cod_empresa, applied: updates }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[rede-gestao-acessos] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
