import { Card, Skeleton } from "@/components/ui/card";

export function Stat({ label, value, hint }: { label: string; value: number | string | null; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      {value === null ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
