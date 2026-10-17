import { commandSchema, filtersSchema, type Command } from "../filters";

export const COMMAND_SYSTEM_PROMPT = `You translate a user's natural-language request about which Instagram accounts they follow they want to review into a strict JSON filter. You never see account data.

Return ONLY a JSON object with exactly this shape:
{
  "action": "review_unfollow" | "show_accounts",
  "filters": {
    "notFollowingBack": boolean,   // accounts the user follows that do not follow back
    "mutualOnly": boolean,         // only mutual followers (never together with notFollowingBack)
    "excludeVerified": boolean,
    "excludeCelebrities": boolean, // celebrities, public figures, musicians, athletes
    "excludeArtists": boolean,
    "excludeCreators": boolean,    // content creators / influencers
    "excludeBrands": boolean,      // brands and businesses
    "excludeFavorites": boolean,
    "excludeFriends": boolean,
    "excludeProtected": boolean,   // default true unless the user explicitly asks to include protected accounts
    "includeUnknown": boolean      // default false
  },
  "requiresConfirmation": true,
  "explanation": string            // one short sentence in the user's language
}
Rules: use "review_unfollow" when the user wants to stop following / clean up, "show_accounts" when they only want to look. "Keep my favorites/friends" => excludeFavorites/excludeFriends. Set only flags the user asked for. Do not invent flags. Output JSON only.`;

export { commandSchema };

const has = (text: string, ...words: RegExp[]) => words.some((w) => w.test(text));

/**
 * Keyword-based interpreter used ONLY when the AI provider is unavailable.
 * Results are labelled as "basic" in the UI so they are never mistaken for AI output.
 */
export function interpretCommandBasic(input: string): Command {
  const t = input.toLowerCase();
  const wantsMutual = has(t, /\bmutual/, /\bme siguen\b(?!.*no)/) && !has(t, /\bdon'?t follow/, /\bno me sigu/, /\bnot following/, /\bnon-?follow/);
  const notBack = !wantsMutual
    ? has(
        t,
        /don'?t follow (me )?back/,
        /not follow(ing)? (me )?back/,
        /non-?followers?/,
        /no me sigu/,
        /no te sigu/,
        /not following/,
        /unfollow/,
        /dejar de seguir/,
        /deja de seguir/,
      ) || !has(t, /\bmutual/)
    : false;

  const filters = filtersSchema.parse({
    notFollowingBack: notBack,
    mutualOnly: wantsMutual,
    excludeVerified: has(t, /verified/, /verificad/),
    excludeCelebrities: has(t, /celebrit/, /famos/, /public figure/, /figuras? públic/, /musician/, /músic/, /athlete/, /deportist/),
    excludeArtists: has(t, /artist/, /musician/, /músic/),
    excludeCreators: has(t, /creator/, /creador/, /influenc/),
    excludeBrands: has(t, /brand/, /marca/, /business/, /negocio/, /empresa/),
    excludeFavorites: has(t, /favorit/),
    excludeFriends: has(t, /friend/, /amig/),
    excludeProtected: !has(t, /include protected/, /incluye.*protegid/),
  });

  return {
    action: has(t, /\bshow\b/, /\bmuestra/, /\bver\b/) && !has(t, /unfollow|dejar|deja de/) ? "show_accounts" : "review_unfollow",
    filters,
    requiresConfirmation: true,
    explanation: "Interpreted with the basic keyword parser (AI unavailable).",
  };
}

/** Validates any candidate command (AI or otherwise) before it can drive filtering. */
export function validateCommand(raw: unknown): Command {
  return commandSchema.parse(raw);
}
