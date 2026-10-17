import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Classification, Category } from "./classification";
import type { AccountRecord, TagKind } from "./selection";
import { dbError } from "./api";

const PAGE = 1000;

/** PostgREST caps responses (1000 rows by default), so page through everything. */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    dbError(error);
    if (!data) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export interface LoadedData {
  importId: string | null;
  importedAt: string | null;
  accounts: AccountRecord[];
}

/** Loads the latest import joined with the user's tags and classifications (RLS-scoped client). */
export async function loadAccounts(supabase: SupabaseClient): Promise<LoadedData> {
  const { data: imp, error } = await supabase
    .from("instagram_imports")
    .select("id,created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  dbError(error);
  if (!imp) return { importId: null, importedAt: null, accounts: [] };

  const [rows, tags, classes] = await Promise.all([
    fetchAll<{ username: string; is_follower: boolean; is_following: boolean }>((from, to) =>
      supabase
        .from("instagram_accounts")
        .select("username,is_follower,is_following")
        .eq("import_id", imp.id)
        .order("username")
        .range(from, to),
    ),
    fetchAll<{ username: string; kind: TagKind }>((from, to) =>
      supabase.from("protected_accounts").select("username,kind").order("username").range(from, to),
    ),
    fetchAll<{ username: string; category: Category; confidence: number | null; source: "ai" | "manual" }>(
      (from, to) =>
        supabase
          .from("account_classifications")
          .select("username,category,confidence,source")
          .order("username")
          .range(from, to),
    ),
  ]);

  const tagMap = new Map<string, TagKind[]>();
  for (const t of tags) tagMap.set(t.username, [...(tagMap.get(t.username) ?? []), t.kind]);
  const classMap = new Map<string, Classification>();
  for (const c of classes)
    classMap.set(c.username, {
      category: c.category,
      confidence: c.confidence === null ? null : Number(c.confidence),
      source: c.source,
    });

  return {
    importId: imp.id,
    importedAt: imp.created_at,
    accounts: rows.map((r) => ({
      username: r.username,
      followsMe: r.is_follower,
      iFollow: r.is_following,
      tags: tagMap.get(r.username) ?? [],
      classification: classMap.get(r.username) ?? null,
    })),
  };
}
