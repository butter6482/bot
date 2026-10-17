const USERNAME_RE = /^[a-z0-9._]{1,30}$/;

/**
 * Normalizes an Instagram username: trims, lowercases, strips a leading "@"
 * and any instagram.com profile URL wrapper. Returns null if the result is
 * not a syntactically valid username.
 */
export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;

  const urlMatch = value.match(
    /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:_u\/)?([a-z0-9._]+)\/?(?:[?#].*)?$/,
  );
  if (urlMatch) value = urlMatch[1];

  if (value.startsWith("@")) value = value.slice(1);
  return USERNAME_RE.test(value) ? value : null;
}

export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value);
}

/** Normalizes and de-duplicates, preserving first-seen order. Invalid entries are counted. */
export function normalizeMany(raw: Iterable<unknown>): {
  usernames: string[];
  invalid: number;
  duplicates: number;
} {
  const seen = new Set<string>();
  const usernames: string[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const item of raw) {
    const u = normalizeUsername(item);
    if (!u) {
      invalid++;
      continue;
    }
    if (seen.has(u)) {
      duplicates++;
      continue;
    }
    seen.add(u);
    usernames.push(u);
  }
  return { usernames, invalid, duplicates };
}

export function profileUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}
