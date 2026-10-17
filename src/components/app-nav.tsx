"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, FileUp, LayoutDashboard, LogOut, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/import", label: "Import", icon: FileUp },
  { href: "/manager", label: "Unfollow Manager", short: "Manager", icon: Sparkles },
  { href: "/review", label: "Review", icon: ClipboardCheck },
  { href: "/lists", label: "Protected", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppNav({ email }: { email: string }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface/60 p-4 md:flex">
        <Logo href="/dashboard" />
        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Main">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active(i.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-foreground",
                active(i.href) && "bg-primary/15 text-secondary",
              )}
            >
              <i.icon className="size-4" /> {i.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border pt-3">
          <p className="truncate text-xs text-muted" title={email}>{email}</p>
          <form action="/auth/signout" method="post">
            <button className="mt-2 flex items-center gap-2 text-sm text-muted hover:text-foreground">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-border bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {items.slice(0, 5).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active(i.href) ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-muted",
              active(i.href) && "text-secondary",
            )}
          >
            <i.icon className="size-5" />
            {i.short ?? i.label}
          </Link>
        ))}
        <Link
          href="/settings"
          aria-current={active("/settings") ? "page" : undefined}
          className={cn("flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-muted", active("/settings") && "text-secondary")}
        >
          <Settings className="size-5" />
          Settings
        </Link>
      </nav>
    </>
  );
}
