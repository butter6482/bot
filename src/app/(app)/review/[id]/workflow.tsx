"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Eye, SkipForward, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card, Skeleton } from "@/components/ui/card";
import { api } from "@/lib/client";
import { CATEGORY_LABELS, type Category } from "@/lib/classification";
import { describeFilters, filtersSchema } from "@/lib/filters";
import { profileUrl } from "@/lib/instagram/username";
import { cn } from "@/lib/utils";

type Status = "pending" | "reviewed" | "keep" | "skipped";
interface Item {
  id: string;
  username: string;
  category: string;
  reason: string | null;
  status: Status;
  position: number;
}

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pending",
  reviewed: "Handled",
  keep: "Keeping",
  skipped: "Skipped",
};

export function ReviewWorkflow({ batchId }: { batchId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [batch, setBatch] = useState<{ name: string; filters: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState<Set<string>>(new Set());

  useEffect(() => {
    api<{ batch: { name: string; filters: unknown }; items: Item[] }>(`/api/review/items?batch=${batchId}`)
      .then((r) => {
        setBatch(r.batch);
        setItems(r.items);
        const first = r.items.findIndex((i) => i.status === "pending");
        setIndex(first === -1 ? 0 : first);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load review."));
  }, [batchId]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { pending: 0, reviewed: 0, keep: 0, skipped: 0 };
    items?.forEach((i) => c[i.status]++);
    return c;
  }, [items]);

  const setStatus = useCallback(
    async (item: Item, status: Status, advance = true) => {
      const prev = items;
      setItems((cur) => cur!.map((i) => (i.id === item.id ? { ...i, status } : i)));
      try {
        await api("/api/review/items", { method: "PATCH", json: { ids: [item.id], status } });
        if (advance) setIndex((i) => Math.min(i + 1, (prev?.length ?? 1) - 1));
      } catch (e) {
        setItems(prev);
        toast.error(e instanceof Error ? e.message : "Could not save progress.");
      }
    },
    [items],
  );

  if (error) return <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>;
  if (!items || !batch) return <Skeleton className="h-96 w-full" />;

  const item = items[index];
  const done = counts.reviewed + counts.keep + counts.skipped;
  const parsedFilters = filtersSchema.safeParse(batch.filters);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/review" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"><ArrowLeft className="size-3" /> All reviews</Link>
        <h1 className="text-2xl font-semibold">{batch.name}</h1>
        <p className="text-sm text-muted">{done} of {items.length} handled · {counts.pending} pending</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuenow={done} aria-valuemax={items.length}>
          <div className="h-full bg-primary transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      </header>

      {counts.pending === 0 && (
        <Card className="border-success/30 bg-success/5 text-sm">
          <p className="font-medium text-success">Review complete.</p>
          <p className="mt-1 text-muted">
            Unfollow Manager can&apos;t see what you did on Instagram. To verify, download a fresh export from Meta and{" "}
            <Link href="/import" className="text-secondary underline">import it again</Link>.
          </p>
        </Card>
      )}

      {item && (
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">Account {index + 1} of {items.length}</p>
              <h2 className="truncate text-xl font-semibold">@{item.username}</h2>
            </div>
            <Badge tone={item.status === "pending" ? "neutral" : item.status === "keep" ? "success" : "primary"}>{STATUS_LABEL[item.status]}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="primary">{CATEGORY_LABELS[item.category as Category] ?? "Unknown"}</Badge>
            {item.reason && <span className="text-muted">{item.reason}</span>}
          </div>

          <a
            href={profileUrl(item.username)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpened((s) => new Set(s).add(item.id))}
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            <ExternalLink /> Open Instagram Profile
          </a>
          <p className="text-xs text-muted">
            Unfollow on Instagram yourself, then come back. {opened.has(item.id) ? "Opened — " : ""}Marking an account never changes anything on Instagram.
          </p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="secondary" onClick={() => void setStatus(item, "reviewed")}><Check /> Mark reviewed</Button>
            <Button variant="secondary" onClick={() => void setStatus(item, "keep")}><ThumbsUp /> Keep following</Button>
            <Button variant="secondary" onClick={() => void setStatus(item, "skipped")}><SkipForward /> Skip</Button>
            <Button variant="ghost" onClick={() => setIndex((i) => Math.min(i + 1, items.length - 1))}>Next account</Button>
          </div>
        </Card>
      )}

      {parsedFilters.success && (
        <Card>
          <h2 className="text-sm font-medium">Selection criteria</h2>
          <ul className="mt-2 space-y-1 text-xs text-muted">{describeFilters(parsedFilters.data).map((d) => <li key={d}>• {d}</li>)}</ul>
        </Card>
      )}

      <Card className="p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium"><Eye className="size-4" /> All accounts</div>
        <ul className="max-h-96 divide-y divide-border overflow-auto">
          {items.map((i, n) => (
            <li key={i.id}>
              <button onClick={() => setIndex(n)} className={cn("flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-white/5", n === index && "bg-primary/10")}>
                <span className="truncate">@{i.username}</span>
                <Badge tone={i.status === "pending" ? "neutral" : i.status === "keep" ? "success" : "primary"}>{STATUS_LABEL[i.status]}</Badge>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
