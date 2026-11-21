import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "";
const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", Vary: "Origin" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const PATHS: Record<string, string> = { credit: "credit-risk", anomaly: "anomaly", nlp: "nlp" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const base = Deno.env.get("ML_SERVICE_URL"), secret = Deno.env.get("ML_SHARED_SECRET");
  if (!base || !secret || !origin) return json({ error: "ML service not configured" }, 503);
  try {
    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await user.auth.getUser();
    if (!u.user) return json({ error: "Unauthorized" }, 401);
    const { kind, input } = await req.json().catch(() => ({}));
    const path = PATHS[String(kind)];
    if (!path || typeof input !== "object" || input === null || JSON.stringify(input).length > 2000) return json({ error: "Invalid request" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("actor_id", u.user.id).eq("action", "ml_call").gte("created_at", since);
    if ((count ?? 0) >= 20) return json({ error: "Too many requests" }, 429);
    await admin.from("audit_logs").insert({ actor_id: u.user.id, action: "ml_call" });

    const r = await fetch(`${base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-ML-Secret": secret }, body: JSON.stringify(input), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return json({ error: r.status === 422 ? "Invalid input" : "ML service error" }, r.status === 422 ? 422 : 502);
    const result = await r.json();
    if (kind !== "nlp") await admin.from("model_predictions").insert({ user_id: u.user.id, kind, result, score: result.default_probability ?? result.anomaly_score, is_demo: true, model_version: result.model_version });
    return json(result);
  } catch (e) { console.error("ml-proxy failed", e); return json({ error: "ML request failed" }, 500); }
});
