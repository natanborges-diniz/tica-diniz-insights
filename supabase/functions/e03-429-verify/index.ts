// E0.3 final 429 test
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
    // Get token
    const client = createClient(supabaseUrl, anonKey);
    const { data: auth } = await client.auth.signInWithPassword({
      email: "vendedor@teste.com",
      password: "Teste123!",
    });
    const token = auth.session.access_token;

    // Now make the 11th call (we already have 10 rate limit records)
    const call11 = await fetch(`${supabaseUrl}/functions/v1/ai-central`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pergunta: "11th call" }),
    });

    const text11 = await call11.text();

    // Now make the 12th call (should be 429)
    const call12 = await fetch(`${supabaseUrl}/functions/v1/ai-central`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pergunta: "12th call — should be 429" }),
    });

    const text12 = await call12.text();

    return new Response(
      JSON.stringify({
        "11th_call": {
          status: call11.status,
          is_429: call11.status === 429,
        },
        "12th_call": {
          status: call12.status,
          is_429: call12.status === 429,
          body: text12.substring(0, 150),
        },
        note: "Expected: 11th=200 or 429, 12th=429",
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
