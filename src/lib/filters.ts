import { z } from "zod";

/**
 * Structured filter. Every execution path (AI, presets, visual builder) produces this shape,
 * and it is validated before any selection logic runs.
 */
export const filtersSchema = z
  .object({
    notFollowingBack: z.boolean().default(false),
    mutualOnly: z.boolean().default(false),
    excludeVerified: z.boolean().default(false),
    excludeCelebrities: z.boolean().default(false),
    excludeArtists: z.boolean().default(false),
    excludeCreators: z.boolean().default(false),
    excludeBrands: z.boolean().default(false),
    excludeFavorites: z.boolean().default(false),
    excludeFriends: z.boolean().default(false),
    /** Accounts you marked "protected". On by default as a safety net. */
    excludeProtected: z.boolean().default(true),
    /** Include accounts whose classification is unknown/low-confidence in the selection. */
    includeUnknown: z.boolean().default(false),
  })
  .refine((f) => !(f.notFollowingBack && f.mutualOnly), {
    message: "A filter cannot require both 'not following back' and 'mutual'.",
  });

export type Filters = z.infer<typeof filtersSchema>;

export const DEFAULT_FILTERS: Filters = filtersSchema.parse({ notFollowingBack: true });

export const commandSchema = z.object({
  action: z.enum(["review_unfollow", "show_accounts"]),
  filters: filtersSchema,
  requiresConfirmation: z.literal(true).default(true),
  explanation: z.string().max(500).optional(),
});
export type Command = z.infer<typeof commandSchema>;

export interface FilterPreset {
  id: string;
  name: string;
  filters: Filters;
}

const f = (patch: Partial<Filters>): Filters => filtersSchema.parse({ notFollowingBack: true, ...patch });

export const BUILTIN_PRESETS: FilterPreset[] = [
  { id: "non-followers", name: "All non-followers", filters: f({}) },
  {
    id: "except-favorites",
    name: "Non-followers except favorites",
    filters: f({ excludeFavorites: true }),
  },
  {
    id: "except-celebrities",
    name: "Non-followers except celebrities",
    filters: f({ excludeCelebrities: true, excludeVerified: true }),
  },
  {
    id: "except-protected",
    name: "Non-followers except protected accounts",
    filters: f({ excludeProtected: true, excludeFavorites: true, excludeFriends: true }),
  },
];

/** Human-readable list of active criteria (shown verbatim in the UI). */
export function describeFilters(filters: Filters): string[] {
  const out: string[] = [];
  if (filters.notFollowingBack) out.push("Accounts I follow that don't follow me back");
  if (filters.mutualOnly) out.push("Mutual followers only");
  if (!filters.notFollowingBack && !filters.mutualOnly) out.push("All accounts I follow");
  if (filters.excludeFavorites) out.push("Exclude favorites");
  if (filters.excludeFriends) out.push("Exclude friends");
  if (filters.excludeProtected) out.push("Exclude protected accounts");
  if (filters.excludeVerified) out.push("Exclude accounts tagged verified");
  if (filters.excludeCelebrities) out.push("Exclude celebrities, public figures, musicians, athletes");
  if (filters.excludeArtists) out.push("Exclude artists and musicians");
  if (filters.excludeCreators) out.push("Exclude content creators");
  if (filters.excludeBrands) out.push("Exclude brands and businesses");
  out.push(
    filters.includeUnknown
      ? "Include accounts with unknown classification"
      : "Hold back accounts with unknown classification for review",
  );
  return out;
}

export function filtersNeedClassification(filters: Filters): boolean {
  return (
    filters.excludeCelebrities ||
    filters.excludeArtists ||
    filters.excludeCreators ||
    filters.excludeBrands
  );
}
