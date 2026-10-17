import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiError, callOpenRouter } from "@/lib/ai/openrouter";
import { COMMAND_SYSTEM_PROMPT, commandSchema } from "@/lib/ai/commands";

const ok = (content: string) =>
  new Response(
    JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    { status: 200 },
  );

const call = () => callOpenRouter({ system: COMMAND_SYSTEM_PROMPT, user: "non-followers", schema: commandSchema });

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_MODEL", "test/model");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OpenRouter client", () => {
  it("returns validated data and token usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok(JSON.stringify({ action: "review_unfollow", filters: { notFollowingBack: true }, requiresConfirmation: true })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { data, usage } = await call();
    expect(data.filters.notFollowingBack).toBe(true);
    expect(data.filters.excludeProtected).toBe(true);
    expect(usage).toMatchObject({ promptTokens: 10, completionTokens: 5, model: "test/model" });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.model).toBe("test/model");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-key");
  });

  it("extracts JSON wrapped in prose", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ok('Sure! {"action":"show_accounts","filters":{"mutualOnly":true},"requiresConfirmation":true} done'),
      ),
    );
    expect((await call()).data.filters.mutualOnly).toBe(true);
  });

  it("retries on 429/5xx and then succeeds", async () => {
    const good = JSON.stringify({ action: "review_unfollow", filters: {}, requiresConfirmation: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(ok(good));
    vi.stubGlobal("fetch", fetchMock);
    await call();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable 4xx errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).rejects.toBeInstanceOf(AiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects model output that fails schema validation (no arbitrary actions)", async () => {
    // A fresh Response per attempt: bodies can only be read once and invalid output is retried.
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => ok(JSON.stringify({ action: "run_code", filters: {}, code: "rm -rf /" })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).rejects.toThrow(/expected format/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects non-JSON output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => ok("I cannot help with that")));
    await expect(call()).rejects.toBeInstanceOf(AiError);
  });

  it("fails fast with 503 when not configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(callOpenRouter({ system: "s", user: "u", schema: z.object({}) })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
