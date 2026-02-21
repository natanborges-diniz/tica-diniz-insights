// supabase/functions/_shared/authGuard.ts
// Shared auth guard for Edge Functions — E0.3 Hardening
// Validates JWT, checks role, applies rate limiting

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type RequiredRole = "authenticated" | "gestor" | "admin";

interface AuthResult {
  userId: string;
  email?: string;
}

interface AuthGuardOptions {
  requiredRole: RequiredRole;
  rateLimitFunctionName?: string; // If set, applies rate limiting (10 calls/5min)
}

/**
 * Validates JWT and role. Returns AuthResult or throws a Response.
 * Usage:
 *   const auth = await authGuard(req, { requiredRole: 'admin' });
 *   // if we reach here, auth is valid
 */
export async function authGuard(
  req: Request,
  options: AuthGuardOptions
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized — token ausente" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Create client scoped to the user's token
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Validate JWT via getUser
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData?.user) {
    console.error("[authGuard] getUser failed:", userError?.message);
    throw new Response(
      JSON.stringify({ error: "Unauthorized — token inválido" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const userId = userData.user.id;
  const email = userData.user.email;

  if (!userId) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized — user_id ausente no token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Role check (using service_role client to query user_roles)
  if (options.requiredRole !== "authenticated") {
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // For 'admin': must have admin role
    // For 'gestor': must have admin OR gestor role
    const rolesToCheck =
      options.requiredRole === "admin"
        ? ["admin"]
        : ["admin", "gestor"];

    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", rolesToCheck);

    if (!roles || roles.length === 0) {
      throw new Response(
        JSON.stringify({
          error: `Forbidden — role mínima: ${options.requiredRole}`,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // Rate limiting for AI functions
  if (options.rateLimitFunctionName) {
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { count } = await serviceClient
      .from("rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("function_name", options.rateLimitFunctionName)
      .gte("called_at", fiveMinAgo);

    if (count !== null && count >= 10) {
      throw new Response(
        JSON.stringify({
          error: "Rate limit excedido — máximo 10 chamadas a cada 5 minutos",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record this call
    await serviceClient.from("rate_limits").insert({
      user_id: userId,
      function_name: options.rateLimitFunctionName,
    });

    // Cleanup old entries (fire and forget)
    serviceClient.rpc("cleanup_rate_limits").then(() => {}).catch(() => {});
  }

  return { userId, email };
}
