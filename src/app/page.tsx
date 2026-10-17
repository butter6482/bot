import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  FileUp,
  Filter,
  ListChecks,
  Lock,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UserX,
} from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const steps = [
  { icon: FileUp, title: "Import your export", text: "Download your data from Meta Accounts Center and drop the ZIP, JSON or HTML here. Parsing happens in your browser." },
  { icon: Sparkles, title: "Write one instruction", text: "“Find everyone who doesn't follow me back, but keep celebrities and my favorites.”" },
  { icon: ListChecks, title: "Approve the selection", text: "Get an organized list with exact counts, reasons, and a separate bucket for uncertain accounts." },
  { icon: UserX, title: "Unfollow on Instagram", text: "Open each profile and unfollow yourself. Re-import later to verify what changed." },
];

const faqs = [
  { q: "Does Unfollow AI unfollow accounts for me?", a: "No. Instagram's official API has no endpoint for unfollowing, and we never use private APIs, passwords or automation. We prepare the list; you perform the unfollow on Instagram." },
  { q: "Do you need my Instagram password?", a: "Never. The app works entirely from the data export you download from Meta." },
  { q: "How do you know who is a celebrity or verified?", a: "Exports contain only usernames. We never invent verification or follower counts. AI suggestions carry a confidence score, low-confidence results become “unknown”, and unknown accounts are held back from bulk selections. You can always override manually." },
  { q: "What gets sent to the AI provider?", a: "Your instruction text for filtering. Usernames are sent only if you explicitly choose AI classification, in small batches, and only after you consent. Counting and comparing followers is done by code, not AI." },
  { q: "Can I delete my data?", a: "Yes. Delete any import or your whole account from Settings; everything is removed." },
];

export default function Home() {
  return (
    <div className="bg-grid min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <a href="#how" className="hidden px-3 text-sm text-muted hover:text-foreground sm:block">How it works</a>
          <a href="#faq" className="hidden px-3 text-sm text-muted hover:text-foreground sm:block">FAQ</a>
          <Link href="/login" className={buttonVariants({ variant: "secondary", size: "sm" })}>Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-4 pb-20 pt-16 text-center sm:pt-24">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
              <ShieldCheck className="size-3.5 text-secondary" /> Works from your official Instagram export — no password needed
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
              Manage Your Instagram Following <span className="text-secondary">With AI.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
              Discover who doesn&apos;t follow you back, create intelligent filters, and organize your Instagram connections in seconds.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/login?mode=signup" className={buttonVariants({ size: "lg" })}>
                Get Started <ArrowRight />
              </Link>
              <a href="#how" className={buttonVariants({ variant: "secondary", size: "lg" })}>See How It Works</a>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="mx-auto mt-14 max-w-2xl text-left">
            <Card className="bg-surface/80 p-4 shadow-[0_0_80px_-20px_var(--primary)] backdrop-blur">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-elevated px-4 py-3 text-sm text-muted">
                <Sparkles className="size-4 text-secondary" />
                Deja de seguir a todos los que no me siguen, excepto famosos.
              </div>
              <ul className="mt-3 space-y-1.5 px-1 text-xs text-muted">
                {[
                  "Include accounts that don't follow you back",
                  "Exclude celebrities where there is enough evidence",
                  "Exclude your favorites and protected accounts",
                  "Hold uncertain accounts back for your review",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-success" />{t}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">Every number in the app is computed from your own import — never estimated.</p>
            </Card>
          </Reveal>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-16">
          <Reveal><h2 className="text-center text-3xl font-semibold">How it works</h2></Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.07}>
                <Card className="h-full">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-secondary"><s.icon className="size-5" /></div>
                  <h3 className="mt-4 font-medium">{i + 1}. {s.title}</h3>
                  <p className="mt-2 text-sm text-muted">{s.text}</p>
                </Card>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-6">
            <Card className="border-primary/30 bg-primary/5">
              <p className="text-sm"><strong>Automated analysis vs. manual actions.</strong> Unfollow AI automates everything that can be done safely with your exported data — comparing lists, interpreting your instructions, classifying, selecting. The actual unfollowing is a manual action you perform on Instagram, because Meta provides no supported way to automate it.</p>
            </Card>
          </Reveal>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-10 md:grid-cols-3">
          {[
            { icon: BrainCircuit, t: "AI-powered filtering", d: "Plain language becomes a validated, editable filter. The model interprets; deterministic code does the counting." },
            { icon: ScanSearch, t: "Followers analysis", d: "Mutual followers, non-followers and fans you don't follow — exact, instant, and computed with set operations." },
            { icon: Filter, t: "Smart classification", d: "Celebrities, brands, creators — with confidence scores. Insufficient evidence means “unknown”, never a guess." },
          ].map((f, i) => (
            <Reveal key={f.t} delay={i * 0.07}>
              <Card className="h-full">
                <f.icon className="size-6 text-secondary" />
                <h3 className="mt-3 font-medium">{f.t}</h3>
                <p className="mt-2 text-sm text-muted">{f.d}</p>
              </Card>
            </Reveal>
          ))}
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold">Privacy and security</h2>
            <ul className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
              {[
                "We never ask for your Instagram password or cookies",
                "Export files are parsed locally in your browser",
                "Row Level Security: only you can read your data",
                "Delete imports or your whole account anytime",
                "Full follower lists are never sent to the AI",
                "No private APIs, scraping or auto-unfollow bots",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-muted">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-8 px-4 py-16">
          <Reveal><h2 className="text-center text-3xl font-semibold">FAQ</h2></Reveal>
          <div className="mt-8 space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-xl border border-border bg-surface p-4 open:bg-elevated">
                <summary className="cursor-pointer list-none font-medium marker:hidden">{f.q}</summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-20 text-center">
          <Reveal>
            <Lock className="mx-auto size-8 text-secondary" />
            <h2 className="mt-4 text-3xl font-semibold">Clean up your following in minutes.</h2>
            <p className="mt-3 text-muted">One export. One instruction. A complete selection.</p>
            <Link href="/login?mode=signup" className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
              Get Started <ArrowRight />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 text-center text-xs text-muted">
        <p>Unfollow AI is an independent product. It is not affiliated with, endorsed by, or sponsored by Instagram or Meta Platforms, Inc. Instagram is a trademark of Meta.</p>
      </footer>
    </div>
  );
}
