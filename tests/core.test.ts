import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis";
import { commandSchema, filtersSchema } from "@/lib/filters";
import { interpretCommandBasic, validateCommand } from "@/lib/ai/commands";
import {
  effectiveCategory,
  sanitizeAiClassification,
  aiClassificationResponseSchema,
} from "@/lib/classification";
import {
  ImportError,
  extractFromHtml,
  mergeDatasets,
  parseExportText,
} from "@/lib/instagram/parser";
import { normalizeMany, normalizeUsername } from "@/lib/instagram/username";
import { computeSelection, validateSelection, type AccountRecord } from "@/lib/selection";

describe("username normalization", () => {
  it("lowercases, trims and strips @ and URLs", () => {
    expect(normalizeUsername("  @John.Doe_1 ")).toBe("john.doe_1");
    expect(normalizeUsername("https://www.instagram.com/_u/Some.User/")).toBe("some.user");
  });
  it("rejects invalid values", () => {
    expect(normalizeUsername("has space")).toBeNull();
    expect(normalizeUsername("")).toBeNull();
    expect(normalizeUsername("a".repeat(31))).toBeNull();
    expect(normalizeUsername(42)).toBeNull();
    expect(normalizeUsername("<script>")).toBeNull();
  });
  it("dedupes and counts", () => {
    expect(normalizeMany(["A", "a", "@a", "b", "!!"])).toEqual({
      usernames: ["a", "b"],
      invalid: 1,
      duplicates: 2,
    });
  });
});

describe("instagram parsing", () => {
  const followersJson = JSON.stringify([
    { title: "", string_list_data: [{ href: "https://www.instagram.com/alice", value: "Alice", timestamp: 1 }] },
    { title: "", string_list_data: [{ href: "https://www.instagram.com/bob", value: "bob", timestamp: 2 }] },
  ]);
  const followingJson = JSON.stringify({
    relationships_following: [
      { title: "alice", string_list_data: [{ href: "https://www.instagram.com/_u/alice", timestamp: 1 }] },
      { title: "carol", string_list_data: [{ href: "https://www.instagram.com/_u/carol", timestamp: 1 }] },
    ],
  });

  it("parses followers_1.json", () => {
    const d = parseExportText("connections/followers_and_following/followers_1.json", followersJson);
    expect(d.kind).toBe("followers");
    expect(d.usernames).toEqual(["alice", "bob"]);
  });
  it("parses following.json using title", () => {
    const d = parseExportText("following.json", followingJson);
    expect(d.kind).toBe("following");
    expect(d.usernames).toEqual(["alice", "carol"]);
  });
  it("parses HTML without executing it", () => {
    const html = `<a href="https://www.instagram.com/dave">dave</a><script>alert(1)</script><a href="https://evil.com/x">x</a>`;
    expect(extractFromHtml(html)).toEqual(["dave"]);
    const d = parseExportText("followers_1.html", html);
    expect(d.usernames).toEqual(["dave"]);
  });
  it("rejects malformed and unsupported files", () => {
    expect(() => parseExportText("followers_1.json", "{not json")).toThrow(ImportError);
    expect(() => parseExportText("followers_1.json", '{"foo":1}')).toThrow(ImportError);
    expect(() => parseExportText("followers_1.txt", "x")).toThrow(ImportError);
  });
  it("merges multi-part files and warns about unknown datasets", () => {
    const m = mergeDatasets([
      parseExportText("followers_1.json", followersJson),
      parseExportText("followers_2.json", followersJson),
      parseExportText("following.json", followingJson),
      { fileName: "mystery.json", kind: "unknown", usernames: ["x"], invalid: 0, duplicates: 0 },
    ]);
    expect(m.followers).toEqual(["alice", "bob"]);
    expect(m.following).toEqual(["alice", "carol"]);
    expect(m.warnings.some((w) => w.includes("mystery.json"))).toBe(true);
  });
});

describe("follower comparison", () => {
  it("computes mutual / non-followers exactly", () => {
    const r = analyze(["a", "b", "c"], ["b", "c", "d", "e"]);
    expect(r.mutual).toEqual(["b", "c"]);
    expect(r.notFollowingBack).toEqual(["d", "e"]);
    expect(r.followersNotFollowedBack).toEqual(["a"]);
    expect(r.totalFollowers).toBe(3);
    expect(r.totalFollowing).toBe(4);
  });
  it("handles large inputs", () => {
    const followers = Array.from({ length: 50_000 }, (_, i) => `u${i}`);
    const following = Array.from({ length: 50_000 }, (_, i) => `u${i + 25_000}`);
    const r = analyze(followers, following);
    expect(r.mutual.length).toBe(25_000);
    expect(r.notFollowingBack.length).toBe(25_000);
  });
});

describe("filters & command validation", () => {
  it("applies safe defaults", () => {
    const f = filtersSchema.parse({});
    expect(f.excludeProtected).toBe(true);
    expect(f.includeUnknown).toBe(false);
  });
  it("rejects contradictory filters and unknown commands", () => {
    expect(() => filtersSchema.parse({ notFollowingBack: true, mutualOnly: true })).toThrow();
    expect(() => validateCommand({ action: "delete_everything", filters: {} })).toThrow();
    expect(() => validateCommand("rm -rf")).toThrow();
  });
  it("accepts the documented AI output shape", () => {
    const c = commandSchema.parse({
      action: "review_unfollow",
      filters: { notFollowingBack: true, excludeVerified: true, excludeCelebrities: true, excludeFavorites: true, excludeFriends: true },
      requiresConfirmation: true,
    });
    expect(c.filters.excludeCelebrities).toBe(true);
  });
  it("basic interpreter understands English and Spanish", () => {
    const en = interpretCommandBasic("Find non-followers, but keep my favorites and exclude celebrities");
    expect(en.filters.notFollowingBack).toBe(true);
    expect(en.filters.excludeFavorites).toBe(true);
    expect(en.filters.excludeCelebrities).toBe(true);
    const es = interpretCommandBasic("Deja de seguir a todos los que no me siguen, excepto famosos.");
    expect(es.filters.notFollowingBack).toBe(true);
    expect(es.filters.excludeCelebrities).toBe(true);
    const mutual = interpretCommandBasic("show my mutual followers");
    expect(mutual.filters.mutualOnly).toBe(true);
    expect(mutual.filters.notFollowingBack).toBe(false);
    expect(mutual.action).toBe("show_accounts");
  });
});

describe("classification uncertainty", () => {
  it("demotes low-confidence AI results to unknown", () => {
    expect(effectiveCategory({ category: "celebrity", confidence: 0.5, source: "ai" })).toBe("unknown");
    expect(effectiveCategory({ category: "celebrity", confidence: 0.9, source: "ai" })).toBe("celebrity");
    expect(sanitizeAiClassification({ category: "celebrity", confidence: 0.4 }).category).toBe("unknown");
  });
  it("manual classification always wins", () => {
    expect(effectiveCategory({ category: "personal", confidence: null, source: "manual" })).toBe("personal");
    expect(effectiveCategory(null)).toBe("unknown");
  });
  it("AI cannot assert verification", () => {
    expect(
      aiClassificationResponseSchema.safeParse({
        classifications: [{ username: "x", category: "verified", confidence: 1 }],
      }).success,
    ).toBe(false);
  });
});

const acct = (u: string, o: Partial<AccountRecord> = {}): AccountRecord => ({
  username: u,
  followsMe: false,
  iFollow: true,
  tags: [],
  classification: null,
  ...o,
});

describe("bulk selection", () => {
  const accounts: AccountRecord[] = [
    acct("mutual1", { followsMe: true }),
    acct("plain1"),
    acct("plain2"),
    acct("fav", { tags: ["favorite"] }),
    acct("prot", { tags: ["protected"] }),
    acct("friend", { tags: ["friend"] }),
    acct("star", { classification: { category: "celebrity", confidence: 0.95, source: "ai" } }),
    acct("maybe", { classification: { category: "celebrity", confidence: 0.4, source: "ai" } }),
    acct("known", { classification: { category: "personal", confidence: null, source: "manual" } }),
    acct("verified", { classification: { category: "verified", confidence: null, source: "manual" } }),
    acct("fan", { iFollow: false, followsMe: true }),
  ];

  it("plain non-followers need no classification; protected are always excluded", () => {
    const r = computeSelection(accounts, filtersSchema.parse({ notFollowingBack: true }));
    const eligible = r.decisions.filter((d) => d.decision === "eligible").map((d) => d.username);
    expect(eligible).toContain("plain1");
    expect(eligible).not.toContain("prot");
    expect(eligible).not.toContain("mutual1");
    expect(eligible).not.toContain("fan");
    expect(r.counts.analyzed).toBe(10);
  });

  it("holds unknown accounts back when classification filters are on", () => {
    const r = computeSelection(
      accounts,
      filtersSchema.parse({ notFollowingBack: true, excludeCelebrities: true, excludeFavorites: true, excludeFriends: true, excludeVerified: true }),
    );
    const by = (d: string) => r.decisions.filter((x) => x.decision === d).map((x) => x.username).sort();
    expect(by("eligible")).toEqual(["known"]);
    expect(by("excluded")).toEqual(["fav", "friend", "prot", "star", "verified"]);
    expect(by("uncertain")).toEqual(["maybe", "plain1", "plain2"]);
    expect(r.counts.eligible + r.counts.excluded + r.counts.uncertain).toBe(r.counts.matchingRelationship);
  });

  it("includeUnknown moves unknowns into the selection", () => {
    const r = computeSelection(
      accounts,
      filtersSchema.parse({ notFollowingBack: true, excludeCelebrities: true, includeUnknown: true }),
    );
    expect(r.counts.uncertain).toBe(0);
    expect(r.decisions.find((d) => d.username === "plain1")?.decision).toBe("eligible");
    expect(r.decisions.find((d) => d.username === "star")?.decision).toBe("excluded");
  });

  it("server-side validation rejects non-eligible usernames", () => {
    const r = computeSelection(accounts, filtersSchema.parse({ notFollowingBack: true, excludeCelebrities: true }));
    const v = validateSelection(["known", "star", "prot", "ghost", "plain1"], r);
    expect(v.accepted).toEqual(["known"]);
    expect(v.rejected.sort()).toEqual(["ghost", "plain1", "prot", "star"]);
    const v2 = validateSelection(["plain1"], r, new Set(["plain1"]));
    expect(v2.accepted).toEqual(["plain1"]);
  });

  it("scales to thousands of accounts with exact counts", () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      acct(`u${i}`, {
        followsMe: i >= 300,
        classification: i < 40 ? { category: "celebrity", confidence: 0.9, source: "ai" } : i < 70 ? null : { category: "personal", confidence: null, source: "manual" },
      }),
    );
    const r = computeSelection(many, filtersSchema.parse({ notFollowingBack: true, excludeCelebrities: true }));
    expect(r.counts).toMatchObject({ analyzed: 1000, matchingRelationship: 300, excluded: 40, uncertain: 30, eligible: 230 });
  });
});
