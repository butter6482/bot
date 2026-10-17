import "server-only";
import type { z } from "zod";

export class AiError extends Error {
  constructor(
    message: string,
    public status: number = 502,
  ) {
    super(message);
  }
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  model: string;
  latencyMs: number;
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new AiError("The model did not return valid JSON.");
  }
}

/**
 * Calls OpenRouter server-side and returns Zod-validated JSON.
 * Retries on 429/5xx/timeouts with backoff. The key never leaves the server.
 */
export async function callOpenRouter<T extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: T;
}): Promise<{ data: z.infer<T>; usage: AiUsage }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey) throw new AiError("OPENROUTER_API_KEY is not configured.", 503);
  if (!model) throw new AiError("OPENROUTER_MODEL is not configured.", 503);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Unfollow AI",
          ...(process.env.NEXT_PUBLIC_SITE_URL
            ? { "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL }
            : {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
        }),
      });

      if (res.status === 429 || res.status >= 500) {
        throw new AiError(`OpenRouter responded with ${res.status}.`, res.status === 429 ? 429 : 502);
      }
      if (!res.ok) {
        // 4xx other than 429 won't improve on retry.
        throw Object.assign(new AiError(`OpenRouter rejected the request (${res.status}).`, 502), {
          fatal: true,
        });
      }

      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new AiError("Empty response from the model.");

      const parsed = opts.schema.safeParse(extractJson(content));
      if (!parsed.success) throw new AiError("The model response did not match the expected format.");

      return {
        data: parsed.data,
        usage: {
          promptTokens: body.usage?.prompt_tokens ?? 0,
          completionTokens: body.usage?.completion_tokens ?? 0,
          model,
          latencyMs: Date.now() - started,
        },
      };
    } catch (err) {
      lastError = err;
      if ((err as { fatal?: boolean }).fatal) break;
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError instanceof AiError) throw lastError;
  if (lastError instanceof Error && lastError.name === "AbortError")
    throw new AiError("The AI request timed out.", 504);
  throw new AiError("The AI request failed.");
}
