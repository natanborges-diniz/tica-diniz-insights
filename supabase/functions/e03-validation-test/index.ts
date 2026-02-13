// E0.3 validation — role tests with full response bodies
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const results: Record<string, unknown> = {};

  async function getToken(email: string, password: string): Promise<string> {
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`Login failed for ${email}: ${error.message}`);
    return data.session.access_token;
  }

  async function callFn(fnName: string, token: string | null, body: Record<string, unknown> = {}): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = { "Content-Type": "application/json", apikey: anonKey };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const resp = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    const text = await resp.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: resp.status, body: parsed };
  }

  try {
    const gestorToken = await getToken("gestor@teste.com", "Teste123!");
    
    // Only test hoya-proxy with gestor to see full response
    const a3 = await callFn("hoya-proxy", gestorToken, { action: "listar-produtos" });
    results["A3_gestor_hoya-proxy"] = { status: a3.status, body: a3.body };
    
    // The key insight: if the authGuard passed (no "Forbidden" or "Unauthorized — token" in body),
    // then it's a downstream Hoya API error, not an auth error
    const bodyStr = JSON.stringify(a3.body);
    const isAuthGuardError = bodyStr.includes("Unauthorized") && bodyStr.includes("token");
    const isForbiddenError = bodyStr.includes("Forbidden") && bodyStr.includes("role");
    results["is_authguard_rejection"] = isAuthGuardError || isForbiddenError;
    results["passed_authguard"] = !isAuthGuardError && !isForbiddenError;

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
