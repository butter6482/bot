export interface AnalysisResult {
  totalFollowers: number;
  totalFollowing: number;
  mutual: string[];
  notFollowingBack: string[]; // I follow them, they don't follow me
  followersNotFollowedBack: string[]; // they follow me, I don't follow them
}

/** Deterministic O(n + m) comparison using Sets. Inputs must already be normalized. */
export function analyze(followers: Iterable<string>, following: Iterable<string>): AnalysisResult {
  const followerSet = new Set(followers);
  const followingSet = new Set(following);

  const mutual: string[] = [];
  const notFollowingBack: string[] = [];
  for (const u of followingSet) {
    if (followerSet.has(u)) mutual.push(u);
    else notFollowingBack.push(u);
  }
  const followersNotFollowedBack: string[] = [];
  for (const u of followerSet) {
    if (!followingSet.has(u)) followersNotFollowedBack.push(u);
  }

  return {
    totalFollowers: followerSet.size,
    totalFollowing: followingSet.size,
    mutual,
    notFollowingBack,
    followersNotFollowedBack,
  };
}
