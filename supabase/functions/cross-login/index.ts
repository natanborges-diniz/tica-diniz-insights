import { corsHeaders } from "../_shared/authGuard.ts";
import { authGuard } from "../_shared/authGuard.ts";

const CF_FUNCTIONS_URL = "https://kvggebtnqmxydtwaumqz.supabase.co/functions/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await authGuard(req, { requiredRole: "authenticated" });

    if (!email) {
      return new Response(
        JSON.stringify({ error: "E-mail não encontrado no token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceSecret = Deno.env.get("INTERNAL_SERVICE_SECRET");
    if (!serviceSecret) {
      console.error("[cross-login] INTERNAL_SERVICE_SECRET não configurado");
      return new Response(
        JSON.stringify({ error: "Configuração de serviço ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cfResponse = await fetch(`${CF_FUNCTIONS_URL}/sso-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Key": serviceSecret,
      },
      body: JSON.stringify({ email }),
    });

    if (!cfResponse.ok) {
      const errBody = await cfResponse.text();
      console.error("[cross-login] CF sso-login error:", cfResponse.status, errBody);
      return new Response(
        JSON.stringify({ error: "Falha ao gerar link de acesso" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { url } = await cfResponse.json();

    return new Response(
      JSON.stringify({ url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[cross-login] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
