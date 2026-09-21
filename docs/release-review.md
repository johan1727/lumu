# Release: search quality, interface and security

The homepage now uses a simpler dark interface with accessible search/filter controls. Direct product references remain useful when price/stock are unknown; the UI labels them explicitly and excludes them from the best-option summary.

Exact-product requests use organic search instead of a redundant Amazon Shopping request. Observed Shopping results returned only opaque Google offer URLs; these cannot be treated as merchant destinations. Organic snippets are not cash-price verification: a carrier amount may be an installment. Never copy a Shopping price onto an organic URL by title similarity. Model/variant/capacity/explicit condition filters and complete-cost ranking are shared with the local MCP.

Security changes restrict the image proxy to public pinned DNS/raster responses, fail closed for unconfigured Telegram hooks, restrict bulk search to B2B and preserve reward ledger records during rate-limit cleanup. Affiliate commission no longer breaks ranking ties or increases store quotas.

## Database rollout

`LUMU_ATOMIC_BONUSES_ENABLED` defaults to false. Signup/referral/reward claims return 503 `BONUSES_PAUSED` without accessing RPC. Paid subscription fulfillment continues while its referral reward is paused. Existing subscription records are available for a reviewed reconciliation; no background reconciliation is implemented.

Do not enable the flag until `lumu_claim_bonus` and service-role permissions have been deployed and independently verified. The two SQL files are reviewable proposals, not automatically applied by this release. The database is shared: map consumers of `public.profiles` before altering grants/policies. Do not run all historical migrations. Local PGlite tests validate SQL semantics and rollback, not independent PostgreSQL connection races. Rewarded ads still need proof-of-view verification before enabling awards.

## Verification and remaining limits

Local Node tests cover security, SQL fixture semantics, bonus gates, organic source routing, reference evidence, affiliate URLs, stock/identity and MCP protocol/limits. Playwright covers desktop/mobile/tablet, consent and unknown-price cards. A clean npm ci succeeds with zero known audit vulnerabilities; local runtime package lifecycle policy may skip native install hooks, so build and native image conversion are checked separately.

The private stdio MCP has a separate lockfile and defaults to external search disabled. See `mcp/README.md`. No SQL, database or public HTTP listener is exposed.

Affiliate account approval/attribution, live stock and complete checkout cost remain provider-dependent. A public merchant URL does not establish commission, delivery, cash price or stock. Analytics/Clarity property access remains an operational follow-up. The source scan had partial coverage; passing tests does not establish absence of vulnerabilities.
