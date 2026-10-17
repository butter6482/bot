import {
  GROUPS,
  effectiveCategory,
  type Category,
  type Classification,
} from "./classification";
import { filtersNeedClassification, type Filters } from "./filters";

export type TagKind = "favorite" | "friend" | "protected";

export interface AccountRecord {
  username: string;
  followsMe: boolean;
  iFollow: boolean;
  tags: TagKind[];
  classification: Classification | null;
}

export type Decision = "eligible" | "excluded" | "uncertain";

export interface AccountDecision {
  username: string;
  decision: Decision;
  category: Category;
  /** Why the account was included/excluded/held back. */
  reasons: string[];
}

export interface SelectionResult {
  decisions: AccountDecision[];
  counts: {
    analyzed: number; // accounts I follow
    matchingRelationship: number; // after the relationship filter
    excluded: number;
    uncertain: number;
    eligible: number;
    protected: number; // accounts I follow carrying any protection tag
    excludedByReason: Record<string, number>;
  };
}

function inGroup(category: Category, group: readonly Category[]): boolean {
  return group.includes(category);
}

/**
 * Pure, deterministic selection. Takes the account table plus validated filters and splits the
 * accounts I follow into eligible / excluded / uncertain. No AI involved.
 */
export function computeSelection(accounts: AccountRecord[], filters: Filters): SelectionResult {
  const decisions: AccountDecision[] = [];
  const excludedByReason: Record<string, number> = {};
  let analyzed = 0;
  let protectedCount = 0;
  const needsClass = filtersNeedClassification(filters);

  for (const a of accounts) {
    if (!a.iFollow) continue;
    analyzed++;
    if (a.tags.length > 0) protectedCount++;

    if (filters.notFollowingBack && a.followsMe) continue;
    if (filters.mutualOnly && !a.followsMe) continue;

    const category = effectiveCategory(a.classification);
    const reasons: string[] = [];

    const exclude = (reason: string) => {
      reasons.push(reason);
    };

    if (filters.excludeProtected && a.tags.includes("protected")) exclude("Protected account");
    if (filters.excludeFavorites && a.tags.includes("favorite")) exclude("Favorite");
    if (filters.excludeFriends && a.tags.includes("friend")) exclude("Friend");
    if (filters.excludeVerified && inGroup(category, GROUPS.verified)) exclude("Tagged verified");
    if (filters.excludeCelebrities && inGroup(category, GROUPS.celebrities))
      exclude(`Classified as ${category.replace("_", " ")}`);
    if (filters.excludeArtists && inGroup(category, GROUPS.artists))
      exclude(`Classified as ${category}`);
    if (filters.excludeCreators && inGroup(category, GROUPS.creators))
      exclude("Classified as content creator");
    if (filters.excludeBrands && inGroup(category, GROUPS.brands))
      exclude(`Classified as ${category}`);

    if (reasons.length > 0) {
      for (const r of reasons) excludedByReason[r] = (excludedByReason[r] ?? 0) + 1;
      decisions.push({ username: a.username, decision: "excluded", category, reasons });
      continue;
    }

    // Classification-dependent filters cannot be trusted for unknown accounts.
    if (needsClass && category === "unknown" && !filters.includeUnknown) {
      decisions.push({
        username: a.username,
        decision: "uncertain",
        category,
        reasons: ["Classification unknown — not enough evidence to include automatically"],
      });
      continue;
    }

    decisions.push({
      username: a.username,
      decision: "eligible",
      category,
      reasons: [
        filters.notFollowingBack
          ? "Doesn't follow you back"
          : filters.mutualOnly
            ? "Mutual follower"
            : "Matches filters",
      ],
    });
  }

  const count = (d: Decision) => decisions.filter((x) => x.decision === d).length;
  return {
    decisions,
    counts: {
      analyzed,
      matchingRelationship: decisions.length,
      excluded: count("excluded"),
      uncertain: count("uncertain"),
      eligible: count("eligible"),
      protected: protectedCount,
      excludedByReason,
    },
  };
}

/** Intersects a client-provided selection with what the server recomputed as eligible. */
export function validateSelection(
  requested: string[],
  result: SelectionResult,
  allowUncertain: ReadonlySet<string> = new Set(),
): { accepted: string[]; rejected: string[] } {
  const ok = new Set(
    result.decisions
      .filter((d) => d.decision === "eligible" || (d.decision === "uncertain" && allowUncertain.has(d.username)))
      .map((d) => d.username),
  );
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const u of new Set(requested)) (ok.has(u) ? accepted : rejected).push(u);
  return { accepted, rejected };
}
