// E0.3 rate limit test — manual insertion and single call test
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const vendedorUserId = "00798c8c-d300-462f-b590-cfd47283e484";

  try {
    // Service client to manipulate rate limits
    const svc = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Clear existing entries
    await svc
      .from("rate_limits")
      .delete()
      .eq("function_name", "ai-central")
      .eq("user_id", vendedorUserId);

    // Insert 10 dummy rate limit entries (simulating 10 previous calls)
    const now = new Date();
    const entries = [];
    for (let i = 0; i < 10; i++) {
      entries.push({
        user_id: vendedorUserId,
        function_name: "ai-central",
        called_at: new Date(now.getTime() - (5 - i * 0.3) * 60 * 1000).toISOString(),
      });
    }
    const { error: insertErr } = await svc
      .from("rate_limits")
      .insert(entries);

    if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

    // Get token
    const client = createClient(supabaseUrl, anonKey);
    const { data: auth } = await client.auth.signInWithPassword({
      email: "vendedor@teste.com",
      password: "Teste123!",
    });
    const token = auth.session.access_token;

    // Now call ai-central — 11th call should be 429
    const resp = await fetch(`${supabaseUrl}/functions/v1/ai-central`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pergunta: "this is the 11th call, should get 429" }),
    });

    const respText = await resp.text();

    return new Response(
      JSON.stringify({
        B_rate_limit_429: {
          status: resp.status,
          body: respText.substring(0, 200),
          is_429: resp.status === 429,
        },
        setup: "Inserted 10 rate limit records, this is the 11th call",
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
