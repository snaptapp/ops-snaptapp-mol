# Roadmap

## Current
- [ ] Expand authenticated MCP report review and guarded external triage tools; raise triage batches beyond 10 and verify safety tests and manifest.
- [x] Fix lockfile tests without Git mutations and valid randomized audit inputs; all nine quality-gate checks and 708 tests passed, automatic preview build reports OK, signed-in browser entry verified.
- [ ] Verify moderation dry-run project fallback in the live preview — fallback implemented and 21 targeted tests passed; build blocker removed, real grounded dry-run verification still pending.
- [x] Correct Lovable connection detection and prevent Google Connect from replacing the current account — five tests passed; signed-in browser check verified with refreshed modules. Google linking remains blocked by disabled manual linking and missing managed linking support.
- [ ] Verify new-account creation and password email on canonical ops host — requires managed privileged Cloud account creation on that host and an approved recipient for the end-to-end email check.

## Done
- [x] Add email-based admin onboarding to Team accounts; 27 tests passed, existing-account grant verified signed in, phone layout fits. Email sending was mocked during the browser check.
- [x] Grant the approved Lovable account admin access and replace the cramped access-denied screen; signed-in Overview loaded live data, 320px screen fits, 14 auth tests passed.
- [x] Add protected read-only MCP fact-bank and daily-pack summaries plus browser-local navigation (WebMCP Tools); manifest extracted, 15 security tests passed, consent login return and anonymous 401 verified.
- [x] Enable Lovable sign-in alongside Cloud admin access.
- [x] Connect Cloud accounts to admin pages with server-verified admin roles and no Firebase sign-in (45 tests passed; signed-out redirects verified).
- [x] Lovable Cloud email/password auth for admin team (`/auth` page + root session listener) — verified in browser
- [x] Cloudflare API reconnected in the new workspace (connection std_01m6g2m9pbehzryvxd5rm50kcw, gateway-backed)

## Pending (approved, not started)
- [ ] Verify MCP approve/deny and signed-in reads end-to-end — republish/deploy the consent route first.
- [ ] Grounded Mod Queue Auto-Triager (mod-triage.server.ts, runModQueueAutoTriage, reports.tsx toolbar)
- [ ] Flutter play_hub_screen refactor (needs new repo token + arena_kit recreation)
- [ ] Reporter overturn-rate escalation; ombudsman-vs-human agreement-% dashboard
