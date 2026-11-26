import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "";
const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", Vary: "Origin" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const PATHS = new Map([["credit", "credit-risk"], ["anomaly", "anomaly"], ["nlp", "nlp"]]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed", code: "method" }, 405);
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const base = (Deno.env.get("ML_SERVICE_URL") ?? "").replace(/\/+$/, "");
  const secret = Deno.env.get("ML_SHARED_SECRET") ?? "";
  if (!base.startsWith("https://") || !secret || !origin) return json({ error: "ML service not configured", code: "not_configured" }, 503);
  try {
    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await user.auth.getUser();
    if (!u.user) return json({ error: "Please sign in again.", code: "unauthorized" }, 401);

    const raw = await req.text();
    if (raw.length > 4096) return json({ error: "Request too large.", code: "too_large" }, 413);
    let body: any = {};
    try { body = JSON.parse(raw); } catch { /* handled below */ }
    const { kind, input } = body ?? {};
    const path = typeof kind === "string" ? PATHS.get(kind) : undefined;
    if (!path || typeof input !== "object" || input === null || Array.isArray(input) || JSON.stringify(input).length > 2000) return json({ error: "Invalid request.", code: "bad_request" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count, error: ce } = await admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("actor_id", u.user.id).eq("action", "ml_call").gte("created_at", since);
    if (ce) { console.error("rate limit query failed", ce); return json({ error: "Could not check rate limit: " + ce.message, code: "db_error" }, 500); }
    if ((count ?? 0) >= 20) return json({ error: "Too many requests. Try again in a minute.", code: "rate_limited" }, 429);
    const { error: le } = await admin.from("audit_logs").insert({ actor_id: u.user.id, action: "ml_call" });
    if (le) console.error("audit insert failed", le);

    let r: Response;
    try {
      r = await fetch(`${base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-ML-Secret": secret }, body: JSON.stringify(input), signal: AbortSignal.timeout(8000) });
    } catch (e) {
      console.error("ml fetch failed", e);
      const slow = (e as Error)?.name === "TimeoutError";
      return json({ error: slow ? "The ML service took too long to respond." : "Could not reach the ML service.", code: slow ? "ml_timeout" : "ml_unreachable" }, slow ? 504 : 502);
    }
    if (!r.ok) {
      console.error("ml service status", r.status);
      return r.status === 422 ? json({ error: "Invalid input.", code: "invalid_input" }, 422) : json({ error: "ML service error.", code: "ml_error", upstream_status: r.status }, 502);
    }
    let result: any;
    try { result = await r.json(); } catch { return json({ error: "ML service returned an invalid response.", code: "ml_bad_response" }, 502); }

    if (kind !== "nlp") {
      const { error: pe } = await admin.from("model_predictions").insert({ user_id: u.user.id, kind, result, score: result.default_probability ?? result.anomaly_score, is_demo: true, model_version: result.model_version });
      if (pe) console.error("prediction save failed", pe);
    }
    return json(result);
  } catch (e) { console.error("ml-proxy failed", e); return json({ error: "ML request failed.", code: "ml_failed" }, 500); }
});