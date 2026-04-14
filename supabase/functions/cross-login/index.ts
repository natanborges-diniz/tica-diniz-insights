import { corsHeaders } from "../_shared/authGuard.ts";
import { authGuard } from "../_shared/authGuard.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CF_FUNCTIONS_URL = "https://kvggebtnqmxydtwaumqz.supabase.co/functions/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, email } = await authGuard(req, { requiredRole: "authenticated" });

    if (!email) {
      return new Response(
        JSON.stringify({ error: "E-mail não encontrado no token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", userId)
      .single();

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
      body: JSON.stringify({ email, nome: profile?.nome || undefined }),
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
