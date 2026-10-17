# Unfollow AI

Natural-language filtering + account classification + bulk selection for managing who you follow on Instagram — built on **official Instagram data exports**.

> Independent product. Not affiliated with, endorsed by, or sponsored by Instagram or Meta Platforms, Inc.

## What it does (and does not do)

1. You download "Followers and following" from Meta Accounts Center (JSON or HTML, or the ZIP).
2. You import it. Parsing runs **in your browser**; only normalized usernames are uploaded when you click *Save import*.
3. You type an instruction ("non-followers, but keep celebrities and my favorites"). The AI turns it into a **validated JSON filter** — it never sees your account list.
4. Deterministic code computes the selection with exact counts: *eligible*, *excluded* (with reasons) and *uncertain*.
5. You approve the whole selection in one action and work through a review list, opening each profile on Instagram.

**It does not unfollow anything.** To our knowledge Meta's official APIs offer no general-purpose unfollow endpoint or full follower-list access (verify against current Meta developer docs before relying on this). The app deliberately uses no private APIs, passwords, cookies, scraping or browser automation. "Reviewed" in the app is your own bookkeeping; re-import a fresh export to verify changes.

### Honest classification
Exports contain only usernames. The app never fabricates verification, follower counts, celebrity status or relationships:
- *Verified* can only be set manually.
- AI classification is optional, explicit-consent, usernames-only, batched; results below 75% confidence are treated as **unknown**.
- Unknown accounts are held in an **uncertain** bucket (not auto-selected) whenever a classification-based exclusion is active. You may include them one by one, or override any classification manually (manual always wins).
- *Protected* accounts are excluded by default.

## Stack
Next.js 16 (App Router, `proxy.ts`), TypeScript, Tailwind v4, Radix Dialog, Motion, Sonner, Zod, Supabase (Postgres, Auth, RLS), OpenRouter.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

### Supabase
1. Create a project; copy the URL, anon key and service-role key into `.env.local`.
2. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`). It creates all tables, indexes and RLS policies (every row is scoped to `auth.uid()`).
3. Auth → Providers: enable Email. Optionally enable Google and set `NEXT_PUBLIC_GOOGLE_AUTH=true`.
4. Auth → URL configuration: add `http://localhost:3000/auth/callback` and your production `https://<domain>/auth/callback`.

Tables: `instagram_imports`, `instagram_accounts` (per-import snapshot: `is_follower` / `is_following`), `account_classifications`, `protected_accounts`, `saved_filters`, `review_batches`, `review_items`, `ai_requests` (token/latency log, no prompt text). Users live in Supabase Auth; deleting a user cascades everything.

### OpenRouter
Set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (any model id from openrouter.ai/models that supports JSON output). Calls happen only in server route handlers, with a 25 s timeout, 3 attempts with backoff, Zod validation, DB-backed rate limits (6/min, 200/day per user) and token logging. If AI is unavailable the command box falls back to a clearly-labelled keyword interpreter.

### Vercel
1. Import the repo in Vercel (framework: Next.js, no extra config).
2. Add every variable from `.env.example` (mark the service-role and OpenRouter keys as server-only — they have no `NEXT_PUBLIC_` prefix).
3. Deploy. No filesystem, long-running worker or browser automation is required.

## Scripts
`npm run dev` · `npm run build` · `npm test` · `npm run typecheck` · `npm run lint`

## Tests
`npm test` covers username normalization, export parsing (JSON/HTML), follower comparison (incl. 50k accounts), filter/command validation, the keyword interpreter, classification uncertainty, protected exclusions, bulk selection (incl. the 1000 → 300 → 40 / 30 / 230 scenario), API authorization and import validation, plus a full export → selection pipeline. Live Supabase/OpenRouter paths are not exercised by the suite.

## Security notes
RLS on all tables; server-side re-validation of every selection; service-role key used only for account deletion; imported HTML is regex-scanned, never rendered; ZIP entry-count/size limits; same-origin redirect checks; security headers set in `next.config.ts`.
