"use client";
import { useMemo, useState } from "react";
import { Heart, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge, Card, Input, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { CATEGORY_LABELS, effectiveCategory } from "@/lib/classification";
import { normalizeUsername, profileUrl } from "@/lib/instagram/username";
import type { TagKind } from "@/lib/selection";
import { useAccounts } from "@/lib/use-accounts";

const KINDS: { kind: TagKind; label: string; icon: typeof Heart; help: string }[] = [
  { kind: "favorite", label: "Favorites", icon: Heart, help: "Accounts you always want to keep." },
  { kind: "friend", label: "Friends", icon: Users, help: "Real-life friends — only you can know this." },
  { kind: "protected", label: "Protected", icon: ShieldCheck, help: "Never included in a selection (on by default)." },
];

export default function ListsPage() {
  const { data, loading, reload } = useAccounts();
  const [input, setInput] = useState("");
  const [kind, setKind] = useState<TagKind>("favorite");

  const byKind = useMemo(() => {
    const m: Record<TagKind, string[]> = { favorite: [], friend: [], protected: [] };
    data?.accounts.forEach((a) => a.tags.forEach((t) => m[t].push(a.username)));
    return m;
  }, [data]);
  const manual = useMemo(() => (data?.accounts ?? []).filter((a) => a.classification?.source === "manual"), [data]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const names = input.split(/[\s,]+/).map(normalizeUsername).filter((u): u is string => Boolean(u));
    if (!names.length) return toast.error("Enter at least one valid username.");
    try {
      await api("/api/tags", { method: "POST", json: { usernames: names, kind, enabled: true } });
      setInput("");
      await reload();
      toast.success(`Added ${names.length} account(s).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add.");
    }
  }

  async function remove(username: string, k: TagKind) {
    await api("/api/tags", { method: "POST", json: { usernames: [username], kind: k, enabled: false } });
    await reload();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Protected lists</h1>
        <p className="text-sm text-muted">Tag accounts so filters can keep them. Classifications you set manually always win over AI.</p>
      </header>

      <Card>
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Usernames" placeholder="usernames, separated by spaces or commas" value={input} onChange={(e) => setInput(e.target.value)} />
          <select aria-label="List" value={kind} onChange={(e) => setKind(e.target.value as TagKind)} className="h-10 rounded-lg border border-border bg-elevated px-3 text-sm">
            {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
          <Button type="submit">Add</Button>
        </form>
      </Card>

      {loading ? <Skeleton className="h-40 w-full" /> : (
        <div className="grid gap-4 md:grid-cols-3">
          {KINDS.map((k) => (
            <Card key={k.kind}>
              <div className="flex items-center gap-2 font-medium"><k.icon className="size-4 text-secondary" /> {k.label} <Badge>{byKind[k.kind].length}</Badge></div>
              <p className="mt-1 text-xs text-muted">{k.help}</p>
              <ul className="mt-3 max-h-72 space-y-1 overflow-auto text-sm">
                {byKind[k.kind].length === 0 && <li className="text-xs text-muted">Empty.</li>}
                {byKind[k.kind].map((u) => (
                  <li key={u} className="flex items-center justify-between gap-2">
                    <a href={profileUrl(u)} target="_blank" rel="noopener noreferrer" className="truncate hover:text-secondary">@{u}</a>
                    <button onClick={() => void remove(u, k.kind)} className="text-xs text-muted hover:text-danger" aria-label={`Remove ${u}`}>Remove</button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <h2 className="font-medium">Manual classifications ({manual.length})</h2>
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          {manual.length === 0 && <li className="text-muted">None yet. Set a classification from any row in the Unfollow Manager.</li>}
          {manual.map((a) => <li key={a.username}><Badge tone="primary">@{a.username} · {CATEGORY_LABELS[effectiveCategory(a.classification)]}</Badge></li>)}
        </ul>
      </Card>
    </div>
  );
}
