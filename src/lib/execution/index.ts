/**
 * Execution layer. The selection engine (src/lib/selection.ts) only decides WHICH accounts are
 * proposed; how a proposal is acted on is a separate, pluggable concern.
 *
 * Today only the manual review provider exists, because no authorized automatic-unfollow
 * integration is available (see docs/INSTAGRAM_FEASIBILITY.md). A future authorized provider can
 * implement `ExecutionProvider` without changing selection, storage or UI logic.
 */
export interface ExecutionProvider {
  id: string;
  label: string;
  /** What this provider can truthfully do. */
  capabilities: {
    automaticUnfollow: boolean;
    verifiesResult: boolean;
  };
  /** Only providers with automaticUnfollow=true implement this. It must report real per-account outcomes. */
  execute?(usernames: string[]): Promise<{ username: string; ok: boolean; error?: string }[]>;
}

export const manualReviewProvider: ExecutionProvider = {
  id: "manual-review",
  label: "Manual review on Instagram",
  capabilities: { automaticUnfollow: false, verifiesResult: false },
};

export const activeProvider: ExecutionProvider = manualReviewProvider;
