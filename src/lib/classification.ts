import { z } from "zod";

export const CATEGORIES = [
  "celebrity",
  "public_figure",
  "musician",
  "athlete",
  "artist",
  "creator",
  "brand",
  "business",
  "verified",
  "personal",
  "unknown",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const categorySchema = z.enum(CATEGORIES);

/** Categories an AI model may assign. It can never assert verification or personal relationships. */
export const AI_CATEGORIES = CATEGORIES.filter((c) => c !== "verified") as Exclude<
  Category,
  "verified"
>[];

export const MIN_AI_CONFIDENCE = 0.75;

export const CATEGORY_LABELS: Record<Category, string> = {
  celebrity: "Celebrity",
  public_figure: "Public figure",
  musician: "Musician",
  athlete: "Athlete",
  artist: "Artist",
  creator: "Content creator",
  brand: "Brand",
  business: "Business",
  verified: "Verified",
  personal: "Personal",
  unknown: "Unknown",
};

export type ClassificationSource = "ai" | "manual";

export interface Classification {
  category: Category;
  confidence: number | null; // null for manual
  source: ClassificationSource;
}

/** Groups used by exclusion filters. */
export const GROUPS = {
  celebrities: ["celebrity", "public_figure", "musician", "athlete"],
  artists: ["artist", "musician"],
  creators: ["creator"],
  brands: ["brand", "business"],
  verified: ["verified"],
} as const satisfies Record<string, readonly Category[]>;

/**
 * Resolves the usable classification of an account. A manual classification always wins.
 * AI results below the confidence threshold are demoted to "unknown" — we never guess.
 */
export function effectiveCategory(c: Classification | null | undefined): Category {
  if (!c) return "unknown";
  if (c.source === "manual") return c.category;
  if ((c.confidence ?? 0) < MIN_AI_CONFIDENCE) return "unknown";
  return c.category;
}

/** Validates a model's raw classification output, enforcing the evidence policy. */
export const aiClassificationItemSchema = z.object({
  username: z.string(),
  category: z.enum(AI_CATEGORIES as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(240).optional(),
});
export const aiClassificationResponseSchema = z.object({
  classifications: z.array(aiClassificationItemSchema),
});

export function sanitizeAiClassification(item: {
  category: string;
  confidence: number;
}): { category: Category; confidence: number } {
  if (item.confidence < MIN_AI_CONFIDENCE) return { category: "unknown", confidence: item.confidence };
  return { category: item.category as Category, confidence: item.confidence };
}
