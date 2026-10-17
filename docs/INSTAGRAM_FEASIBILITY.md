# Feasibility: reading relationships and unfollowing automatically

_Status: assessment, not legal advice. Verification limits are stated explicitly below._

## How this was checked
A web search of Meta's developer documentation for the **Instagram API with Instagram Login** returned this picture: it is aimed at **professional (Business/Creator) accounts** and covers comment moderation, content publishing, media insights, mentions and messaging. Current scopes named in the results: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_messages`, `instagram_business_manage_comments`. None concerns follower lists or follow management.

**Not verified:** the sandbox this project was built in cannot reach `developers.facebook.com`, so the full endpoint reference was *not* read. Before building anything on this assessment, confirm in the official reference (developers.facebook.com → Instagram Platform) that no follower/following listing or follow/unfollow endpoint has been added. Searches for Meta's terms on automation returned only third-party pages, so the Instagram Terms of Use and Platform Terms must be read directly.

## Findings
| Question | Answer |
|---|---|
| What can official OAuth give us? | Access to a *professional* account's own content, comments, insights and messaging. Personal accounts are not supported by this API. |
| Can we read the full follower / following lists via API? | No endpoint for this was found in the documentation surfaced. Treat as unavailable. |
| Is there an authorized unfollow endpoint? | None found. We therefore never claim or simulate one. |
| What data *is* reliably available? | The user's own **data export** ("Download your information" → Followers and following), JSON or HTML. Usernames and timestamps only — no verification flag, follower counts or categories. |

## Alternatives considered
1. **Password / private-API automation.** Violates platform rules, requires collecting credentials or session tokens, risks account restrictions. **Rejected.**
2. **Browser extension acting inside the user's logged-in session.** Technically it would run in the user's own browser without us seeing credentials, but it automates actions Meta does not offer an API for; platform terms generally restrict automated actions and Meta actively rate-limits/flags unnatural follow/unfollow patterns (unverified against primary sources). It would add maintenance burden (Instagram's markup changes), a Web Store review process and real account-risk for users. **Not built.** If pursued later, it should be user-initiated per account, slow, visible, and legal review should come first.
3. **Official partnership / approved integration.** Would require Meta app review and a permission that, to our knowledge, does not exist for this use case. Revisit if Meta publishes one.
4. **Manual review workflow (implemented).** The app builds the selection and opens each profile; the user taps Unfollow on Instagram. A later export import verifies the result.

## Architecture consequence
Selection (`src/lib/selection.ts`) is independent from execution (`src/lib/execution/`). Only a `manual-review` provider exists (`automaticUnfollow: false`). A future authorized provider implements `ExecutionProvider.execute()` and must return real per-account results; nothing in the UI may mark an account "unfollowed" unless a provider or a later import confirms it.
