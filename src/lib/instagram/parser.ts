import { normalizeMany } from "./username";

export type DatasetKind = "followers" | "following" | "unknown";

export interface ParsedDataset {
  fileName: string;
  kind: DatasetKind;
  usernames: string[];
  invalid: number;
  duplicates: number;
}

export class ImportError extends Error {}

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Decide which dataset a file belongs to from its (base) file name. */
export function kindFromFileName(fileName: string): DatasetKind {
  const base = fileName.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (/^followers(_\d+)?\.(json|html?)$/.test(base)) return "followers";
  if (/^following(_\d+)?\.(json|html?)$/.test(base)) return "following";
  return "unknown";
}

type Json = unknown;

function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Walks the known Instagram export shapes and collects candidate usernames.
 * Shapes handled:
 *  - followers_N.json: [{ title, string_list_data: [{ href, value, timestamp }] }]
 *  - following.json:   { relationships_following: [{ title: "user", string_list_data: [{ href, timestamp }] }] }
 *  - older exports:    { relationships_followers | relationships_following: [ { string_list_data: [{ value }] } ] }
 */
export function extractFromJson(data: Json): { candidates: string[]; hint: DatasetKind } {
  let hint: DatasetKind = "unknown";
  let list: Json[] = [];

  if (Array.isArray(data)) {
    list = data;
  } else if (isRecord(data)) {
    if (Array.isArray(data.relationships_following)) {
      list = data.relationships_following;
      hint = "following";
    } else if (Array.isArray(data.relationships_followers)) {
      list = data.relationships_followers;
      hint = "followers";
    } else {
      throw new ImportError("Unrecognized JSON structure: no followers/following list found.");
    }
  } else {
    throw new ImportError("Unrecognized JSON structure.");
  }

  const candidates: string[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const items = Array.isArray(entry.string_list_data)
      ? entry.string_list_data.filter(isRecord)
      : [];
    const values = items.flatMap((i) => (typeof i.value === "string" ? [i.value] : []));
    if (values.length > 0) {
      candidates.push(...values);
    } else if (typeof entry.title === "string" && entry.title.trim()) {
      // Newer "following" exports keep the username in `title`.
      candidates.push(entry.title);
    } else {
      candidates.push(...items.flatMap((i) => (typeof i.href === "string" ? [i.href] : [])));
    }
  }
  return { candidates, hint };
}

const HTML_LINK_RE =
  /<a\b[^>]*\bhref\s*=\s*["']https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{1,30})\/?["'][^>]*>/gi;

/**
 * Extracts usernames from an HTML export using a regular expression only.
 * The markup is never parsed into a DOM nor executed.
 */
export function extractFromHtml(html: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  HTML_LINK_RE.lastIndex = 0;
  while ((m = HTML_LINK_RE.exec(html))) out.push(m[1]);
  return out;
}

export function parseExportText(fileName: string, text: string): ParsedDataset {
  const lower = fileName.toLowerCase();
  let candidates: string[];
  let hint: DatasetKind = "unknown";

  if (lower.endsWith(".json")) {
    let data: Json;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ImportError(`${fileName}: file is not valid JSON.`);
    }
    ({ candidates, hint } = extractFromJson(data));
  } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    candidates = extractFromHtml(text);
  } else {
    throw new ImportError(`${fileName}: unsupported file type. Use JSON, HTML or ZIP.`);
  }

  const kind = kindFromFileName(fileName) !== "unknown" ? kindFromFileName(fileName) : hint;
  const { usernames, invalid, duplicates } = normalizeMany(candidates);
  return { fileName, kind, usernames, invalid, duplicates };
}

export interface MergedImport {
  followers: string[];
  following: string[];
  files: ParsedDataset[];
  warnings: string[];
}

/** Merges datasets (e.g. followers_1.json + followers_2.json) and removes duplicates. */
export function mergeDatasets(datasets: ParsedDataset[]): MergedImport {
  const followers = new Set<string>();
  const following = new Set<string>();
  const warnings: string[] = [];
  for (const d of datasets) {
    if (d.kind === "followers") d.usernames.forEach((u) => followers.add(u));
    else if (d.kind === "following") d.usernames.forEach((u) => following.add(u));
    else warnings.push(`${d.fileName}: could not tell if this is followers or following; skipped.`);
    if (d.invalid > 0) warnings.push(`${d.fileName}: ${d.invalid} invalid entries ignored.`);
  }
  if (followers.size === 0) warnings.push("No followers dataset detected.");
  if (following.size === 0) warnings.push("No following dataset detected.");
  return { followers: [...followers], following: [...following], files: datasets, warnings };
}
