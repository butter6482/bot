"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { api } from "@/lib/client";

interface Batch {
  id: string;
  name: string;
  command: string | null;
  total: number;
  done: number;
  created_at: string;
}

export default function ReviewListPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);

  const load = useCallback(async () => {
    try {
      setBatches((await api<{ batches: Batch[] }>("/api/review")).batches);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load reviews.");
      setBatches([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this review list? Your Instagram account is not affected.")) return;
    await api(`/api/review?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Reviews</h1>
        <p className="text-sm text-muted">Your approved selections and how far you&apos;ve got through them.</p>
      </header>
      {!batches ? (
        <Skeleton className="h-24 w-full" />
      ) : batches.length === 0 ? (
        <Card className="py-12 text-center">
          <ClipboardCheck className="mx-auto size-8 text-secondary" />
          <p className="mt-3 font-medium">No reviews yet</p>
          <p className="text-sm text-muted">Approve a selection in the Unfollow Manager to start one.</p>
          <Link href="/manager" className={buttonVariants({ className: "mt-4" })}>Open Unfollow Manager</Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => (
            <Card key={b.id} className="flex items-center gap-4">
              <Link href={`/review/${b.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium">{b.name}</p>
                <p className="text-xs text-muted">{new Date(b.created_at).toLocaleString()} · {b.done}/{b.total} handled</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuenow={b.done} aria-valuemax={b.total}>
                  <div className="h-full bg-primary" style={{ width: `${b.total ? (b.done / b.total) * 100 : 0}%` }} />
                </div>
              </Link>
              <Button variant="ghost" size="sm" aria-label="Delete review" onClick={() => void remove(b.id)}><Trash2 /></Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
