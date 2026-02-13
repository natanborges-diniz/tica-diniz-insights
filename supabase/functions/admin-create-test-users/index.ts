// Temporary function to create test users for E0.3 validation
// DELETE after testing
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: Record<string, unknown> = {};

  // Create gestor@teste.com
  const { data: g, error: ge } = await supabase.auth.admin.createUser({
    email: "gestor@teste.com",
    password: "Teste123!",
    email_confirm: true,
  });
  if (ge) {
    results.gestor_create = ge.message;
  } else {
    results.gestor_id = g.user.id;
    // Set cod_empresa=2
    await supabase.from("profiles").update({ cod_empresa: 2 }).eq("id", g.user.id);
    // Add gestor role
    await supabase.from("user_roles").insert({ user_id: g.user.id, role: "gestor" });
    results.gestor = "created with role=gestor, cod_empresa=2";
  }

  // Create vendedor@teste.com
  const { data: v, error: ve } = await supabase.auth.admin.createUser({
    email: "vendedor@teste.com",
    password: "Teste123!",
    email_confirm: true,
  });
  if (ve) {
    results.vendedor_create = ve.message;
  } else {
    results.vendedor_id = v.user.id;
    await supabase.from("profiles").update({ cod_empresa: 2 }).eq("id", v.user.id);
    await supabase.from("user_roles").insert({ user_id: v.user.id, role: "vendedor" });
    results.vendedor = "created with role=vendedor, cod_empresa=2";
  }

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
