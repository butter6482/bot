import { NextResponse } from "next/server";
import { z } from "zod";
import { AI_CATEGORIES, aiClassificationResponseSchema, sanitizeAiClassification } from "@/lib/classification";
import { AiError, aiConfigured, callOpenRouter } from "@/lib/ai/openrouter";
import { enforceAiRateLimit, logAiRequest } from "@/lib/ai/rate-limit";
import { HttpError, dbError, handle, parseBody, requireUser } from "@/lib/api";
import { fetchAll } from "@/lib/data";
import { isValidUsername } from "@/lib/instagram/username";

const MAX_BATCH = 100;

const bodySchema = z.object({
  usernames: z.array(z.string().refine(isValidUsername)).min(1).max(MAX_BATCH),
  /** The user must explicitly accept that these usernames are sent to the AI provider. */
  consent: z.literal(true),
});

const SYSTEM = `You help flag which Instagram accounts a user follows are likely public-facing. You receive ONLY a list of usernames — no bios, no follower counts, no verification data.
For each username, assign one category: ${AI_CATEGORIES.join(", ")}.
STRICT RULES:
- Only assign a category other than "unknown" if you have specific, reliable knowledge that this exact username belongs to a well-known account (a celebrity, brand, artist, etc.).
- If you are not sure, use "unknown". Most usernames of ordinary people must be "unknown" or "personal" — never guess from how a name sounds.
- Never claim an account is verified, and never claim anything about the user's personal relationship to it.
- "confidence" is 0..1 and must reflect real certainty; use below 0.5 when guessing.
Return ONLY JSON: {"classifications":[{"username": string, "category": string, "confidence": number, "reason": string (max 12 words)}]}`;

export const POST = handle(async (req) => {
  const { supabase, user } = await requireUser();
  const body = await parseBody(req, bodySchema);

  if (!aiConfigured() || !process.env.OPENROUTER_MODEL) {
    throw new HttpError(503, "AI classification is not configured on this deployment.");
  }

  // Authorization: only accounts the user actually follows in their import may be classified,
  // and manual classifications are never overwritten.
  const requested = [...new Set(body.usernames)];
  const [{ data: imp }, manual] = await Promise.all([
    supabase
      .from("instagram_imports")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchAll<{ username: string }>((from, to) =>
      supabase.from("account_classifications").select("username").eq("source", "manual").range(from, to),
    ),
  ]);
  if (!imp) throw new HttpError(400, "Import your Instagram data first.");
  const { data: owned, error } = await supabase
    .from("instagram_accounts")
    .select("username")
    .eq("import_id", imp.id)
    .eq("is_following", true)
    .in("username", requested);
  dbError(error);
  const manualSet = new Set(manual.map((m) => m.username));
  const allowed = (owned ?? []).map((o) => o.username).filter((u) => !manualSet.has(u));
  if (allowed.length === 0) return NextResponse.json({ classified: [], skipped: requested.length });

  await enforceAiRateLimit(supabase, user.id);

  try {
    const { data, usage } = await callOpenRouter({
      system: SYSTEM,
      user: JSON.stringify({ usernames: allowed }),
      schema: aiClassificationResponseSchema,
    });
    await logAiRequest(supabase, user.id, "classify", "ok", usage);

    const allowedSet = new Set(allowed);
    const rows = data.classifications
      .filter((c) => allowedSet.has(c.username.toLowerCase()))
      .map((c) => {
        const s = sanitizeAiClassification(c);
        return {
          user_id: user.id,
          username: c.username.toLowerCase(),
          category: s.category,
          confidence: s.confidence,
          source: "ai" as const,
          reason: c.reason ?? null,
          updated_at: new Date().toISOString(),
        };
      });
    // Anything the model skipped is recorded as unknown so it is not re-sent endlessly.
    const answered = new Set(rows.map((r) => r.username));
    for (const u of allowed)
      if (!answered.has(u))
        rows.push({
          user_id: user.id,
          username: u,
          category: "unknown",
          confidence: 0,
          source: "ai",
          reason: null,
          updated_at: new Date().toISOString(),
        });

    const { error: upErr } = await supabase
      .from("account_classifications")
      .upsert(rows, { onConflict: "user_id,username" });
    dbError(upErr);
    return NextResponse.json({
      classified: rows.map((r) => ({ username: r.username, category: r.category, confidence: r.confidence })),
      usage,
    });
  } catch (err) {
    await logAiRequest(supabase, user.id, "classify", "error");
    if (err instanceof AiError) throw new HttpError(err.status === 429 ? 429 : 502, err.message);
    throw err;
  }
});
