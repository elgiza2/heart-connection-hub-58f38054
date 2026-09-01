/** @doc agent-tick — server-side heartbeat that advances durable agent runs. */
/**
 * Server-side heartbeat for the agent kernel.
 *
 * Called every minute by pg_cron, so long tasks keep going (hours) whether or
 * not the user has the app open. Guarded by a shared secret.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { tickAllRuns } from "../_shared/agentkernel/kernel.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("AGENT_TICK_SECRET");
  const provided =
    req.headers.get("x-agent-tick-secret") ??
    new URL(req.url).searchParams.get("secret") ??
    "";
  // Fail closed: without a configured secret this endpoint would run with the
  // service role and be callable by anyone who knows the URL.
  if (!expected) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (provided !== expected) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  try {
    const advanced = await tickAllRuns(supabase, 25);
    return new Response(JSON.stringify({ ok: true, advanced }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("agent-tick failed", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "tick failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
