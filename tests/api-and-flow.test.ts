import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyze } from "@/lib/analysis";
import { interpretCommandBasic } from "@/lib/ai/commands";
import { mergeDatasets, parseExportText } from "@/lib/instagram/parser";
import { computeSelection, validateSelection, type AccountRecord } from "@/lib/selection";

const state: { user: { id: string } | null; inserts: unknown[] } = { user: null, inserts: [] };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      insert: (rows: unknown) => {
        state.inserts.push(rows);
        return { select: () => ({ single: async () => ({ data: { id: "imp-1" }, error: null }) }), then: undefined };
      },
      select: () => ({ order: async () => ({ data: [], error: null }) }),
    }),
  }),
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  state.user = null;
  state.inserts = [];
});

const post = (body: unknown) =>
  new Request("http://x/api/imports", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

describe("API authorization & import validation", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const { GET, POST } = await import("@/app/api/imports/route");
    expect((await GET(new Request("http://x"))).status).toBe(401);
    expect((await POST(post({ followers: ["a"], following: ["b"] }))).status).toBe(401);
    const tags = await import("@/app/api/tags/route");
    expect((await tags.POST(post({}))).status).toBe(401);
    const review = await import("@/app/api/review/route");
    expect((await review.POST(post({}))).status).toBe(401);
  });

  it("validates the import payload for signed-in users", async () => {
    state.user = { id: "u1" };
    const { POST } = await import("@/app/api/imports/route");
    expect((await POST(new Request("http://x", { method: "POST", body: "not json" }))).status).toBe(400);
    expect((await POST(post({ followers: "nope", following: [] }))).status).toBe(400);
    expect((await POST(post({ followers: ["!!", "  "], following: ["??"] }))).status).toBe(400);
  });

  it("rejects oversized imports", async () => {
    state.user = { id: "u1" };
    const { POST } = await import("@/app/api/imports/route");
    const huge = Array.from({ length: 100_001 }, (_, i) => `u${i}`);
    expect((await POST(post({ followers: huge, following: [] }))).status).toBe(400);
  });

  it("tag endpoint rejects invalid usernames", async () => {
    state.user = { id: "u1" };
    const tags = await import("@/app/api/tags/route");
    const res = await tags.POST(post({ usernames: ["bad name"], kind: "favorite", enabled: true }));
    expect(res.status).toBe(400);
  });
});

describe("end-to-end pipeline (pure)", () => {
  it("export → analysis → instruction → selection → server validation", () => {
    const followers = JSON.stringify([
      { title: "", string_list_data: [{ value: "mutual_pal" }] },
      { title: "", string_list_data: [{ value: "fan_only" }] },
    ]);
    const following = JSON.stringify({
      relationships_following: ["mutual_pal", "stranger_1", "stranger_2", "best_friend", "famous_one"].map((n) => ({
        title: n,
        string_list_data: [{ href: `https://www.instagram.com/_u/${n}` }],
      })),
    });
    const merged = mergeDatasets([parseExportText("followers_1.json", followers), parseExportText("following.json", following)]);
    const a = analyze(merged.followers, merged.following);
    expect(a.notFollowingBack).toEqual(["stranger_1", "stranger_2", "best_friend", "famous_one"]);

    const followersSet = new Set(merged.followers);
    const accounts: AccountRecord[] = merged.following.map((u) => ({
      username: u,
      iFollow: true,
      followsMe: followersSet.has(u),
      tags: u === "best_friend" ? ["friend"] : [],
      classification: u === "famous_one" ? { category: "celebrity", confidence: 0.97, source: "ai" } : { category: "personal", confidence: null, source: "manual" },
    }));

    const cmd = interpretCommandBasic("Deja de seguir a todos los que no me siguen, excepto famosos y mis amigos.");
    const sel = computeSelection(accounts, cmd.filters);
    expect(sel.decisions.filter((d) => d.decision === "eligible").map((d) => d.username)).toEqual(["stranger_1", "stranger_2"]);

    const check = validateSelection(["stranger_1", "famous_one", "best_friend"], sel);
    expect(check.accepted).toEqual(["stranger_1"]);
  });
});
