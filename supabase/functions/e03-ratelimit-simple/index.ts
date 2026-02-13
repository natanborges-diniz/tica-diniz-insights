// E0.3 rate limit test — limited calls to avoid timeout
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    // Get token
    const client = createClient(supabaseUrl, anonKey);
    const { data: auth, error: authErr } = await client.auth.signInWithPassword({
      email: "vendedor@teste.com",
      password: "Teste123!",
    });
    if (authErr) throw new Error(`Login failed: ${authErr.message}`);
    const token = auth.session.access_token;

    // Clear old rate limit entries for this user
    const svc = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: userRoles } = await svc
      .from("user_roles")
      .select("user_id")
      .eq("role", "vendedor")
      .limit(1);
    const userId = userRoles?.[0]?.user_id;

    if (userId) {
      await svc
        .from("rate_limits")
        .delete()
        .eq("function_name", "ai-central")
        .eq("user_id", userId);
    }

    // Make 11 calls
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const resp = await fetch(`${supabaseUrl}/functions/v1/ai-central`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pergunta: `rate limit test ${i}` }),
      });
      statuses.push(resp.status);
      if (resp.status === 429) break; // Stop at first 429
    }

    return new Response(
      JSON.stringify({
        statuses,
        got_429_limit: statuses.includes(429),
        first_429_at_call: statuses.indexOf(429) + 1 || "not triggered",
        expected: "11th call should return 429",
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
