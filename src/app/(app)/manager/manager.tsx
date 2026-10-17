"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  Download,
  ExternalLink,
  Heart,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Stat } from "@/components/stat";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card, Input, Skeleton } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { api } from "@/lib/client";
import { CATEGORIES, CATEGORY_LABELS, effectiveCategory, type Category } from "@/lib/classification";
import {
  BUILTIN_PRESETS,
  DEFAULT_FILTERS,
  describeFilters,
  filtersNeedClassification,
  type Command,
  type Filters,
  type FilterPreset,
} from "@/lib/filters";
import { profileUrl } from "@/lib/instagram/username";
import { computeSelection, type AccountDecision, type TagKind } from "@/lib/selection";
import { useAccounts } from "@/lib/use-accounts";
import { cn } from "@/lib/utils";

type Tab = "eligible" | "uncertain" | "excluded";
const PAGE_SIZE = 150;

const FILTER_TOGGLES: { key: keyof Filters; label: string }[] = [
  { key: "notFollowingBack", label: "Doesn't follow me back" },
  { key: "mutualOnly", label: "Mutual follower" },
  { key: "excludeFavorites", label: "Keep favorites" },
  { key: "excludeProtected", label: "Keep protected" },
  { key: "excludeFriends", label: "Keep friends" },
  { key: "excludeVerified", label: "Keep tagged verified" },
  { key: "excludeCelebrities", label: "Keep celebrities" },
  { key: "excludeArtists", label: "Keep artists" },
  { key: "excludeCreators", label: "Keep creators" },
  { key: "excludeBrands", label: "Keep brands" },
  { key: "includeUnknown", label: "Include unknown" },
];

export function Manager() {
  const router = useRouter();
  const params = useSearchParams();
  const { data, error, loading, reload } = useAccounts();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [command, setCommand] = useState(params.get("q") ?? "");
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [source, setSource] = useState<{ kind: "ai" | "basic"; notice?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("eligible");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const autoRan = useRef(false);

  const applyFilters = useCallback((f: Filters) => {
    setFilters(f);
    setOverrides(new Map());
    setLimit(PAGE_SIZE);
  }, []);

  const runCommand = useCallback(
    async (text: string) => {
      setInterpreting(true);
      try {
        const res = await api<{ command: Command; source: "ai" | "basic"; notice?: string }>("/api/ai/command", {
          method: "POST",
          json: { command: text },
        });
        applyFilters(res.command.filters);
        setLastCommand(text);
        setSource({ kind: res.source, notice: res.notice });
        if (res.notice) toast.warning(res.notice);
        else toast.success("Filters generated. Review them below.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not interpret the instruction.");
      } finally {
        setInterpreting(false);
      }
    },
    [applyFilters],
  );

  useEffect(() => {
    api<{ presets: FilterPreset[] }>("/api/filters")
      .then((r) => setPresets(r.presets))
      .catch(() => {});
  }, []);

  // Run the instruction passed from the dashboard exactly once, after data is available.
  useEffect(() => {
    const q = params.get("q");
    if (q && data?.importId && !autoRan.current) {
      autoRan.current = true;
      void runCommand(q);
    }
  }, [params, data?.importId, runCommand]);

  const selection = useMemo(() => (data ? computeSelection(data.accounts, filters) : null), [data, filters]);
  const byTag = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.username, a])), [data]);

  const isSelected = useCallback(
    (d: AccountDecision) => {
      const o = overrides.get(d.username);
      if (o !== undefined) return o && d.decision !== "excluded";
      return d.decision === "eligible";
    },
    [overrides],
  );

  const selected = useMemo(() => (selection ? selection.decisions.filter(isSelected) : []), [selection, isSelected]);
  const selectedSet = useMemo(() => new Set(selected.map((d) => d.username)), [selected]);

  const toggle = (u: string, on: boolean) => setOverrides((m) => new Map(m).set(u, on));
  const selectAllEligible = () => setOverrides(new Map());
  const deselectAll = () =>
    setOverrides(new Map(selection!.decisions.filter((d) => d.decision !== "excluded").map((d) => [d.username, false])));
  const deselectTag = (kind: TagKind) =>
    setOverrides((m) => {
      const n = new Map(m);
      for (const d of selection!.decisions) if (byTag.get(d.username)?.tags.includes(kind)) n.set(d.username, false);
      return n;
    });

  async function tag(username: string, kind: TagKind) {
    const has = byTag.get(username)?.tags.includes(kind);
    try {
      await api("/api/tags", { method: "POST", json: { usernames: [username], kind, enabled: !has } });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update tag.");
    }
  }

  async function setCategory(username: string, category: Category | "") {
    try {
      await api("/api/tags", { method: "PUT", json: { usernames: [username], category: category || null } });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update classification.");
    }
  }

  async function savePreset() {
    const name = prompt("Name this filter preset");
    if (!name?.trim()) return;
    try {
      await api("/api/filters", { method: "POST", json: { name: name.trim(), filters } });
      const r = await api<{ presets: FilterPreset[] }>("/api/filters");
      setPresets(r.presets);
      toast.success("Preset saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save preset.");
    }
  }

  function exportSelection() {
    const rows = ["username,profile_url,category,reason", ...selected.map((d) => [d.username, profileUrl(d.username), d.category, `"${d.reasons.join("; ")}"`].join(","))];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "unfollow-selection.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function approve() {
    if (!selection) return;
    setBusy(true);
    try {
      const uncertain = selected.filter((d) => d.decision === "uncertain").map((d) => d.username);
      const res = await api<{ id: string }>("/api/review", {
        method: "POST",
        json: {
          name: lastCommand ? lastCommand.slice(0, 60) : `Selection ${new Date().toLocaleDateString()}`,
          command: lastCommand ?? undefined,
          filters,
          usernames: selected.map((d) => d.username),
          includeUncertain: uncertain,
        },
      });
      router.push(`/review/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the review.");
      setBusy(false);
    }
  }

  // ── derived view ──
  const list = useMemo(() => {
    if (!selection) return [];
    const q = search.trim().toLowerCase();
    return selection.decisions.filter((d) => d.decision === tab && (!q || d.username.includes(q)));
  }, [selection, tab, search]);

  const unclassifiedUncertain = useMemo(
    () => (selection ? selection.decisions.filter((d) => d.decision === "uncertain" && !byTag.get(d.username)?.classification) : []),
    [selection, byTag],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error) return <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>;
  if (!data?.importId || !selection) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <Users className="mx-auto size-8 text-secondary" />
        <h1 className="mt-3 text-lg font-semibold">Import your data first</h1>
        <p className="mt-1 text-sm text-muted">The Unfollow Manager works from your Instagram export.</p>
        <Link href="/import" className={cn(buttonVariants(), "mt-4")}>Import data</Link>
      </Card>
    );
  }

  const c = selection.counts;
  const needsClass = filtersNeedClassification(filters);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Unfollow Manager</h1>
        <p className="text-sm text-muted">Describe what you want. Review the exact criteria. Approve the whole selection at once.</p>
      </header>

      {/* AI command */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (command.trim().length >= 2) void runCommand(command.trim());
        }}
        className="space-y-2"
      >
        <label htmlFor="command" className="sr-only">AI command</label>
        <div className="flex flex-col gap-2 rounded-2xl border border-primary/40 bg-surface p-2 shadow-[0_0_40px_-12px_var(--primary)] sm:flex-row">
          <div className="flex flex-1 items-center gap-3 px-3">
            <Sparkles className="size-5 shrink-0 text-secondary" />
            <input
              id="command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              maxLength={500}
              placeholder="Describe which accounts you want to review..."
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <Button type="submit" disabled={interpreting || command.trim().length < 2}>
            {interpreting ? <Loader2 className="animate-spin" /> : <ArrowRight />} Interpret
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {["Find everyone who doesn't follow me back.", "Non-followers, but keep celebrities and my favorites.", "Exclude artists and content creators."].map((ex) => (
            <button key={ex} type="button" onClick={() => setCommand(ex)} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-foreground">
              {ex}
            </button>
          ))}
        </div>
        {source && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Badge tone={source.kind === "ai" ? "primary" : "warning"}>{source.kind === "ai" ? "AI interpreted" : "Basic interpreter"}</Badge>
            {source.notice ?? "Your instruction text (not your account list) was sent to the AI provider."}
          </p>
        )}
      </form>

      {/* Filter builder */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Smart filters</h2>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filter presets"
              className="h-8 rounded-lg border border-border bg-elevated px-2 text-xs"
              value=""
              onChange={(e) => {
                const p = [...BUILTIN_PRESETS, ...presets].find((x) => x.id === e.target.value);
                if (p) applyFilters(p.filters);
              }}
            >
              <option value="">Load preset…</option>
              {[...BUILTIN_PRESETS, ...presets].map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button size="sm" variant="secondary" onClick={savePreset}><Bookmark /> Save preset</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filters">
          {FILTER_TOGGLES.map(({ key, label }) => {
            const on = Boolean(filters[key]);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = { ...filters, [key]: !on };
                  if (key === "notFollowingBack" && !on) next.mutualOnly = false;
                  if (key === "mutualOnly" && !on) next.notFollowingBack = false;
                  applyFilters(next);
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  on ? "border-primary bg-primary/20 text-secondary" : "border-border text-muted hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <ul className="mt-4 space-y-1 text-xs text-muted" aria-label="Exact selection criteria">
          {describeFilters(filters).map((d) => <li key={d}>• {d}</li>)}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Verification can&apos;t be read from Instagram exports — only accounts you tag as “Verified” are excluded by that filter.
        </p>
      </Card>

      {/* Counts */}
      <section aria-label="Selection summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Accounts analyzed" value={c.analyzed} hint="Accounts you follow" />
        <Stat label="Matching relationship" value={c.matchingRelationship} />
        <Stat label="Protected / tagged" value={c.protected} />
        <Stat label="Eligible" value={c.eligible} hint={`${c.excluded} excluded · ${c.uncertain} uncertain`} />
        <Stat label="Selected" value={selected.length} />
      </section>
      {Object.keys(c.excludedByReason).length > 0 && (
        <p className="text-xs text-muted">
          Excluded: {Object.entries(c.excludedByReason).map(([r, n]) => `${n.toLocaleString()} ${r.toLowerCase()}`).join(" · ")}
        </p>
      )}

      {/* Bulk actions */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Button size="sm" variant="secondary" onClick={selectAllEligible}>Select all eligible</Button>
        <Button size="sm" variant="secondary" onClick={deselectAll}>Deselect all</Button>
        <Button size="sm" variant="secondary" onClick={() => deselectTag("favorite")}>Exclude favorites</Button>
        <Button size="sm" variant="secondary" onClick={() => deselectTag("protected")}>Exclude protected</Button>
        <Button size="sm" variant="secondary" onClick={() => setTab("uncertain")}>Review uncertain ({c.uncertain})</Button>
        <Button size="sm" variant="secondary" onClick={exportSelection} disabled={selected.length === 0}><Download /> Export</Button>
        {needsClass && unclassifiedUncertain.length > 0 && (
          <Button size="sm" variant="secondary" onClick={() => setClassifyOpen(true)}><Sparkles /> Classify with AI</Button>
        )}
      </Card>

      {/* Tabs + list */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2" role="tablist">
          <div className="flex gap-1">
            {(["eligible", "uncertain", "excluded"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => { setTab(t); setLimit(PAGE_SIZE); }}
                className={cn("rounded-lg px-3 py-1.5 text-sm capitalize", tab === t ? "bg-elevated text-foreground" : "text-muted hover:text-foreground")}
              >
                {t} <span className="font-mono text-xs">{c[t].toLocaleString()}</span>
              </button>
            ))}
          </div>
          <Input aria-label="Search usernames" placeholder="Search…" className="h-8 max-w-48" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(PAGE_SIZE); }} />
        </div>

        <Card className="mt-3 divide-y divide-border p-0" role="tabpanel">
          {list.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              {tab === "eligible" ? "No eligible accounts for these filters." : tab === "uncertain" ? "Nothing uncertain — every matching account is classified or not needed." : "No excluded accounts."}
            </div>
          ) : (
            list.slice(0, limit).map((d) => {
              const rec = byTag.get(d.username)!;
              const cat = effectiveCategory(rec.classification);
              return (
                <div key={d.username} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {d.decision !== "excluded" && (
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      aria-label={`Select ${d.username}`}
                      checked={selectedSet.has(d.username)}
                      onChange={(e) => toggle(d.username, e.target.checked)}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <a href={profileUrl(d.username)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 truncate text-sm font-medium hover:text-secondary">
                      @{d.username} <ExternalLink className="size-3" />
                    </a>
                    <p className="truncate text-xs text-muted">{d.reasons.join("; ")}</p>
                  </div>
                  <Badge tone={cat === "unknown" ? "neutral" : "primary"}>
                    {CATEGORY_LABELS[cat]}
                    {rec.classification?.source === "ai" && cat !== "unknown" && ` · ${Math.round((rec.classification.confidence ?? 0) * 100)}%`}
                    {rec.classification?.source === "manual" && " · manual"}
                  </Badge>
                  <select
                    aria-label={`Classification for ${d.username}`}
                    className="h-8 rounded-lg border border-border bg-elevated px-2 text-xs"
                    value={rec.classification?.source === "manual" ? rec.classification.category : ""}
                    onChange={(e) => void setCategory(d.username, e.target.value as Category | "")}
                  >
                    <option value="">{rec.classification?.source === "ai" ? "AI / auto" : "Set…"}</option>
                    {CATEGORIES.map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}
                  </select>
                  <div className="flex gap-1">
                    <button aria-label="Toggle favorite" aria-pressed={rec.tags.includes("favorite")} onClick={() => void tag(d.username, "favorite")} className={cn("rounded-md p-1.5", rec.tags.includes("favorite") ? "text-danger" : "text-muted hover:text-foreground")}><Heart className="size-4" /></button>
                    <button aria-label="Toggle friend" aria-pressed={rec.tags.includes("friend")} onClick={() => void tag(d.username, "friend")} className={cn("rounded-md p-1.5", rec.tags.includes("friend") ? "text-success" : "text-muted hover:text-foreground")}><Users className="size-4" /></button>
                    <button aria-label="Toggle protected" aria-pressed={rec.tags.includes("protected")} onClick={() => void tag(d.username, "protected")} className={cn("rounded-md p-1.5", rec.tags.includes("protected") ? "text-secondary" : "text-muted hover:text-foreground")}><ShieldCheck className="size-4" /></button>
                  </div>
                </div>
              );
            })
          )}
        </Card>
        {list.length > limit && (
          <div className="mt-3 text-center">
            <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
              Show more ({(list.length - limit).toLocaleString()} left)
            </Button>
          </div>
        )}
      </div>

      {/* Sticky approve bar */}
      <div className="sticky bottom-20 z-30 md:bottom-4">
        <Card className="flex flex-col items-center justify-between gap-3 border-primary/40 bg-elevated/95 p-4 backdrop-blur sm:flex-row">
          <p className="text-sm"><span className="font-mono font-semibold">{selected.length.toLocaleString()}</span> accounts selected for review</p>
          <Button size="lg" disabled={selected.length === 0} onClick={() => setConfirmOpen(true)}>
            Review Selected Accounts <ArrowRight />
          </Button>
        </Card>
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title="Approve this selection?"
          description="This creates a review list. It does not unfollow anything on Instagram."
        >
          <ul className="space-y-1 rounded-lg bg-elevated p-3 text-xs text-muted">
            {describeFilters(filters).map((d) => <li key={d}>• {d}</li>)}
          </ul>
          <p className="mt-3 text-sm"><strong>{selected.length.toLocaleString()}</strong> accounts will be added.
            {selected.some((d) => d.decision === "uncertain") && <span className="text-warning"> Includes {selected.filter((d) => d.decision === "uncertain").length} uncertain accounts you chose manually.</span>}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button onClick={approve} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Approve &amp; start review</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ClassifyDialog
        open={classifyOpen}
        onOpenChange={setClassifyOpen}
        usernames={unclassifiedUncertain.map((d) => d.username)}
        onDone={reload}
      />
    </div>
  );
}

function ClassifyDialog({
  open,
  onOpenChange,
  usernames,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  usernames: string[];
  onDone: () => Promise<void>;
}) {
  const [consent, setConsent] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const MAX_PER_RUN = 300;
  const batch = usernames.slice(0, MAX_PER_RUN);

  async function run() {
    setRunning(true);
    setProgress(0);
    try {
      for (let i = 0; i < batch.length; i += 100) {
        await api("/api/ai/classify", { method: "POST", json: { usernames: batch.slice(i, i + 100), consent: true } });
        setProgress(Math.min(i + 100, batch.length));
      }
      await onDone();
      toast.success("Classification finished. Low-confidence results stay “unknown”.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Classification failed.");
      await onDone();
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Classify with AI" description="Optional. Helps spot well-known accounts. Results are suggestions with a confidence score.">
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-warning/10 p-3 text-xs text-warning">
            Disclosure: the {batch.length.toLocaleString()} usernames below will be sent to the AI provider (OpenRouter) — usernames only, no follower lists, no other data.
            {usernames.length > MAX_PER_RUN && ` ${usernames.length - MAX_PER_RUN} more can be done in a later run.`}
          </p>
          <p className="text-xs text-muted">A username alone is weak evidence. The model is told to answer “unknown” unless it is certain; anything under 75% confidence is treated as unknown and stays held back. You can override any result.</p>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5 accent-[var(--primary)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I understand and agree to send these usernames to the AI provider.
          </label>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost" disabled={running}>Cancel</Button></DialogClose>
            <Button onClick={run} disabled={!consent || running}>
              {running && <Loader2 className="animate-spin" />}
              {running ? `Classifying ${progress}/${batch.length}` : "Classify"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
