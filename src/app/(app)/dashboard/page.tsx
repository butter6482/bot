"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileUp, Sparkles } from "lucide-react";
import { Stat } from "@/components/stat";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { useAccounts } from "@/lib/use-accounts";

export default function DashboardPage() {
  const { data, error, loading } = useAccounts();
  const router = useRouter();
  const [command, setCommand] = useState("");
  const hasData = Boolean(data?.importId);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const q = command.trim();
    router.push(q ? `/manager?q=${encodeURIComponent(q)}` : "/manager");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted">Import once, then describe what you want in plain language.</p>
      </header>

      {error && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : hasData ? (
          <>
            <div>
              <p className="text-sm font-medium">Instagram data loaded</p>
              <p className="text-xs text-muted">Last import: {new Date(data!.importedAt!).toLocaleString()}</p>
            </div>
            <Link href="/import" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <FileUp /> Re-import
            </Link>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium">No Instagram data yet</p>
              <p className="text-xs text-muted">Upload your official export to get started.</p>
            </div>
            <Link href="/import" className={buttonVariants({ size: "sm" })}>
              <FileUp /> Import data
            </Link>
          </>
        )}
      </Card>

      <form onSubmit={go}>
        <label htmlFor="cmd" className="sr-only">AI command</label>
        <div className="flex flex-col gap-2 rounded-2xl border border-primary/40 bg-surface p-2 shadow-[0_0_40px_-12px_var(--primary)] sm:flex-row">
          <div className="flex flex-1 items-center gap-3 px-3">
            <Sparkles className="size-5 shrink-0 text-secondary" />
            <input
              id="cmd"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={!hasData}
              maxLength={500}
              placeholder="Describe which accounts you want to review..."
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted disabled:opacity-50"
            />
          </div>
          <Button type="submit" disabled={!hasData}>
            Analyze <ArrowRight />
          </Button>
        </div>
      </form>

      <section aria-label="Statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total followers" value={hasData ? data!.stats.followers : loading ? null : 0} />
        <Stat label="Total following" value={hasData ? data!.stats.following : loading ? null : 0} />
        <Stat label="Not following back" value={hasData ? data!.stats.notFollowingBack : loading ? null : 0} />
        <Stat label="Mutual" value={hasData ? data!.stats.mutual : loading ? null : 0} />
      </section>

      <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Ready to build a selection?</p>
          <p className="text-sm text-muted">Open the Unfollow Manager to filter, classify and review.</p>
        </div>
        <Link href="/manager" className={buttonVariants({})} aria-disabled={!hasData}>
          Open Unfollow Manager <ArrowRight />
        </Link>
      </Card>
    </div>
  );
}
