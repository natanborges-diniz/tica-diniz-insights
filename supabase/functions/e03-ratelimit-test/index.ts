// E0.3 validation — rate limit test only
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  async function getToken(email: string, password: string): Promise<string> {
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`Login failed for ${email}: ${error.message}`);
    return data.session.access_token;
  }

  async function callFn(fnName: string, token: string, body: Record<string, unknown> = {}): Promise<number> {
    const resp = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    await resp.text();
    return resp.status;
  }

  try {
    const vendedorToken = await getToken("vendedor@teste.com", "Teste123!");

    // Clear existing rate limit entries
    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await svc.from("rate_limits").delete().eq("function_name", "ai-central").eq("user_id", "00798c8c-d300-462f-b590-cfd47283e484");

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const s = await callFn("ai-central", vendedorToken, { pergunta: `rl test ${i}` });
      statuses.push(s);
    }

    return new Response(JSON.stringify({
      statuses,
      got_429: statuses.includes(429),
      first_429_at_call: statuses.indexOf(429) + 1,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
