import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/api";
import type { AiUsage } from "./openrouter";

const PER_MINUTE = 6;
const PER_DAY = 200;

/** DB-backed limiter (works across serverless instances). Throws 429 when exceeded. */
export async function enforceAiRateLimit(supabase: SupabaseClient, userId: string) {
  const now = Date.now();
  const since = (ms: number) => new Date(now - ms).toISOString();
  const count = async (ms: number) => {
    const { count } = await supabase
      .from("ai_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since(ms));
    return count ?? 0;
  };
  const [minute, day] = await Promise.all([count(60_000), count(86_400_000)]);
  if (minute >= PER_MINUTE) throw new HttpError(429, "Too many AI requests. Wait a minute and try again.");
  if (day >= PER_DAY) throw new HttpError(429, "Daily AI request limit reached.");
}

export async function logAiRequest(
  supabase: SupabaseClient,
  userId: string,
  kind: "command" | "classify",
  status: "ok" | "error",
  usage?: AiUsage,
) {
  await supabase.from("ai_requests").insert({
    user_id: userId,
    kind,
    status,
    model: usage?.model ?? process.env.OPENROUTER_MODEL ?? null,
    prompt_tokens: usage?.promptTokens ?? 0,
    completion_tokens: usage?.completionTokens ?? 0,
    latency_ms: usage?.latencyMs ?? null,
  });
}
