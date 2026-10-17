import Link from "next/link";
import { UserMinus } from "lucide-react";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
        <UserMinus className="size-4" />
      </span>
      Unfollow AI
    </Link>
  );
}
