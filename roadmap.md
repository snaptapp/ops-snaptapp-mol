# Roadmap

## Done
- [x] Add protected read-only MCP fact-bank and daily-pack summaries plus browser-local navigation (WebMCP Tools); manifest extracted, 15 security tests passed, consent login return and anonymous 401 verified.
- [x] Enable Lovable sign-in alongside Cloud admin access.
- [x] Connect Cloud accounts to admin pages with server-verified admin roles and no Firebase sign-in (45 tests passed; signed-out redirects verified).
- [x] Lovable Cloud email/password auth for admin team (`/auth` page + root session listener) — verified in browser
- [x] Cloudflare API reconnected in the new workspace (connection std_01m6g2m9pbehzryvxd5rm50kcw, gateway-backed)

## Pending (approved, not started)
- [ ] Verify MCP approve/deny and signed-in reads end-to-end — blocked until the first Cloud admin account is created and confirmed; republish/deploy the consent route first.
- [ ] Verify signed-in portal access end-to-end — waiting for michael@snaptapp.us to create and confirm the first Cloud account.
- [ ] Grounded Mod Queue Auto-Triager (mod-triage.server.ts, runModQueueAutoTriage, reports.tsx toolbar)
- [ ] Flutter play_hub_screen refactor (needs new repo token + arena_kit recreation)
- [ ] Reporter overturn-rate escalation; ombudsman-vs-human agreement-% dashboard
