"use client";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { analyze } from "@/lib/analysis";
import { api } from "@/lib/client";
import { ImportError, mergeDatasets, type MergedImport, type ParsedDataset } from "@/lib/instagram/parser";
import { parseUpload } from "@/lib/instagram/zip";
import { cn } from "@/lib/utils";

export default function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [merged, setMerged] = useState<MergedImport | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setParsing(true);
    setErrors([]);
    setSaved(false);
    const datasets: ParsedDataset[] = [];
    const errs: string[] = [];
    for (const f of Array.from(files)) {
      try {
        datasets.push(...(await parseUpload(f)));
      } catch (e) {
        errs.push(e instanceof ImportError ? e.message : `${f.name}: could not be read.`);
      }
    }
    setErrors(errs);
    setMerged(datasets.length ? mergeDatasets(datasets) : null);
    setParsing(false);
  }, []);

  const result = merged ? analyze(merged.followers, merged.following) : null;
  const canSave = Boolean(merged && merged.followers.length > 0 && merged.following.length > 0);

  async function save() {
    if (!merged) return;
    setSaving(true);
    try {
      await api("/api/imports", {
        method: "POST",
        json: {
          label: `Import ${new Date().toLocaleDateString()}`,
          sourceFiles: merged.files.map((f) => f.fileName.split("/").pop()),
          followers: merged.followers,
          following: merged.following,
        },
      });
      setSaved(true);
      toast.success("Import saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the import.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Import Instagram data</h1>
        <p className="text-sm text-muted">Files are parsed in your browser. Only usernames are uploaded, and only when you save.</p>
      </header>

      <Card>
        <h2 className="font-medium">1. Download your information from Meta</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Open <strong className="text-foreground">Accounts Center → Your information and permissions → Download your information</strong>.</li>
          <li>Choose <strong className="text-foreground">Some of your information</strong> → <strong className="text-foreground">Followers and following</strong>.</li>
          <li>Pick format <strong className="text-foreground">JSON</strong> (recommended) or HTML, then request the download.</li>
          <li>When Meta emails you, download the ZIP and upload it below — or upload <code>followers_1.json</code> and <code>following.json</code> directly.</li>
        </ol>
      </Card>

      <Card>
        <h2 className="mb-3 font-medium">2. Upload</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-4 py-10 text-center transition-colors",
            dragging && "border-primary bg-primary/5",
          )}
        >
          {parsing ? <Loader2 className="size-8 animate-spin text-secondary" /> : <FileUp className="size-8 text-secondary" />}
          <p className="text-sm text-muted">{parsing ? "Reading your files…" : "Drop a ZIP, JSON or HTML export here"}</p>
          <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={parsing}>Choose files</Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".zip,.json,.html,.htm"
            className="hidden"
            aria-label="Upload Instagram export"
            onChange={(e) => e.target.files && void handleFiles(e.target.files)}
          />
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="mt-3 space-y-1 rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {errors.map((e) => <li key={e} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{e}</li>)}
          </ul>
        )}
      </Card>

      {merged && result && (
        <Card>
          <h2 className="mb-3 font-medium">3. Review &amp; save</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Followers", result.totalFollowers],
              ["Following", result.totalFollowing],
              ["Mutual", result.mutual.length],
              ["Not following back", result.notFollowingBack.length],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-elevated p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-mono text-xl tabular-nums">{(v as number).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {merged.files.map((f) => (
              <li key={f.fileName}>{f.fileName.split("/").pop()} — {f.kind} — {f.usernames.length.toLocaleString()} usernames{f.duplicates ? `, ${f.duplicates} duplicates removed` : ""}</li>
            ))}
          </ul>
          {merged.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg bg-warning/10 p-3 text-sm text-warning">
              {merged.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {saved ? (
              <>
                <span className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" /> Saved</span>
                <Link href="/manager" className={buttonVariants({})}>Continue to Unfollow Manager</Link>
              </>
            ) : (
              <Button onClick={save} disabled={!canSave || saving}>
                {saving && <Loader2 className="animate-spin" />} Save import
              </Button>
            )}
            {!canSave && !saved && <span className="text-xs text-muted">Both a followers and a following file are required.</span>}
          </div>
        </Card>
      )}

      <p className="flex items-center gap-2 text-xs text-muted">
        <ShieldCheck className="size-4 text-secondary" /> We never ask for your Instagram password or session.
      </p>
    </div>
  );
}
