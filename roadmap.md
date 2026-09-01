# MEGSY — Security Hardening Roadmap

## Done

- agent-tick: fail-closed when AGENT_TICK_SECRET missing (was fail-open with service role)
- Revoked anon/authenticated EXECUTE: get_user_subscription_status, expire_prize_rewards, ensure_mailbox; revoked anon on claim_promo_slot
- Confirmed all provider-key/secret tables have RLS + no anon/authenticated grants
- Telegram game tables/functions recorded as out of scope (shared DB, other app)
- generate-skill and chat-fast now require a valid signed-in user before paid provider calls
- auth-email-hook verifies Supabase webhook signatures and fails closed when unconfigured
- outbound mail is limited to 30 messages per user per hour
- Dependency scan passed with no high or critical vulnerabilities; TypeScript and unit tests pass
- Protected profile, reward-task, workspace-credit, and member-usage fields with database triggers
- Restricted shared email assets to the authenticated broadcast service
- Added centralized per-user rate limits to paid Vercel API routes and throttled pre-auth bridges
- Locked the rate-limit ledger against direct client reads/writes and restricted provider-key rotation RPCs to `service_role`
- Unified preview and production API guards; browser probes confirm every protected paid route rejects unsigned requests before provider execution

## Open

- Decision needed: legacy unprefixed `ai_activate_plan`, `ai_activate_plan_with_intent`, `ad_watch_*` are anon-executable (free subscription grant). Belong to Telegram app? -> revoke if unused
- CORS wildcard review: mail, mail-poll, broadcast, anything-api, auth-email-hook (low risk, no cookie auth)
- API red team: IDOR / param tampering on edge functions
- Prompt-injection tests for agents
- Perf, SEO, a11y
- Enable leaked-password protection (dashboard setting)
