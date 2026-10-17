"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Input, Skeleton } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { api } from "@/lib/client";

interface Imp {
  id: string;
  label: string | null;
  followers_count: number;
  following_count: number;
  created_at: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [imports, setImports] = useState<Imp[] | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setImports((await api<{ imports: Imp[] }>("/api/imports")).imports);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch(() => setImports([]));
  }, [load]);

  async function deleteImport(id: string) {
    if (!confirm("Delete this import and its account rows?")) return;
    await api(`/api/imports?id=${id}`, { method: "DELETE" });
    toast.success("Import deleted.");
    await load();
  }

  async function deleteAccount() {
    try {
      await api("/api/account", { method: "DELETE", json: { confirm: "DELETE" } });
      toast.success("Account deleted.");
      router.replace("/");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the account.");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">Manage your imported data and account.</p>
      </header>

      <Card>
        <h2 className="font-medium">Imports</h2>
        {!imports ? <Skeleton className="mt-3 h-12 w-full" /> : imports.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No imports stored.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {imports.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p>{i.label ?? "Import"}</p>
                  <p className="text-xs text-muted">{new Date(i.created_at).toLocaleString()} · {i.followers_count.toLocaleString()} followers · {i.following_count.toLocaleString()} following</p>
                </div>
                <Button variant="danger" size="sm" onClick={() => void deleteImport(i.id)}><Trash2 /> Delete</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-danger/30">
        <h2 className="font-medium text-danger">Delete account</h2>
        <p className="mt-1 text-sm text-muted">Permanently removes your login, imports, tags, classifications, filters and reviews. This cannot be undone.</p>
        <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>Delete my account</Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Delete your account?" description="Type DELETE to confirm.">
          <Input aria-label="Type DELETE" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button variant="danger" disabled={confirmText !== "DELETE"} onClick={deleteAccount}>Delete forever</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
