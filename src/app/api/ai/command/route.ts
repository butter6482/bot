import { NextResponse } from "next/server";
import { z } from "zod";
import { COMMAND_SYSTEM_PROMPT, commandSchema, interpretCommandBasic } from "@/lib/ai/commands";
import { AiError, aiConfigured, callOpenRouter } from "@/lib/ai/openrouter";
import { enforceAiRateLimit, logAiRequest } from "@/lib/ai/rate-limit";
import { handle, parseBody, requireUser } from "@/lib/api";

const bodySchema = z.object({ command: z.string().trim().min(2).max(500) });

/**
 * Turns a natural-language instruction into validated structured filters.
 * Only the instruction text is sent to the model — never usernames or account data.
 */
export const POST = handle(async (req) => {
  const { supabase, user } = await requireUser();
  const { command } = await parseBody(req, bodySchema);

  if (!aiConfigured() || !process.env.OPENROUTER_MODEL) {
    return NextResponse.json({
      command: interpretCommandBasic(command),
      source: "basic",
      notice: "AI is not configured on this deployment. Used the basic keyword interpreter.",
    });
  }

  await enforceAiRateLimit(supabase, user.id);

  try {
    const { data, usage } = await callOpenRouter({
      system: COMMAND_SYSTEM_PROMPT,
      user: command,
      schema: commandSchema,
    });
    await logAiRequest(supabase, user.id, "command", "ok", usage);
    return NextResponse.json({ command: data, source: "ai", usage });
  } catch (err) {
    await logAiRequest(supabase, user.id, "command", "error");
    if (err instanceof AiError) {
      return NextResponse.json({
        command: interpretCommandBasic(command),
        source: "basic",
        notice: `The AI service was unavailable (${err.message}) — used the basic keyword interpreter. Review the filters carefully.`,
      });
    }
    throw err;
  }
});
