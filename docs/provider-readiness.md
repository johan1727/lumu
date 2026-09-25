# Provider readiness — 2026-09-24

A search reference is not a verified offer. Price, currency, condition, availability and observation time must come from the same provider listing. Shipping and other checkout charges remain unknown unless supplied explicitly; missing charges do not become zero. Recorded stock is an observation, not a checkout guarantee.

## Mercado Libre

Both search paths now support the server-only `MELI_ACCESS_TOKEN`. The direct Axios path uses the fixed API host and rejects redirects. BR maps to MLB rather than MX. Normalizers preserve provider currency, quantity, status and observation time; absent condition is unknown rather than new. Missing provider permalinks are not constructed from item IDs. Discount cards require the expected currency and a provided destination.

This is fixture-tested, not proof that the configured production token has valid permissions. The provider must authorize the account/application and relevant endpoints. `MERCADOLIBRE_APP_ID` plus a client secret is not evidence of access to arbitrary sellers' listings or affiliate attribution. Existing 403/cooldown handling remains. No live calls or credential changes were made in this pass.

Official price documentation: https://developers.mercadolibre.com.mx/api-de-precios (Bearer token; item-specific prices/conditions). Catalog product IDs and seller listing IDs are distinct; do not pass a `/p/` catalog ID to an item-price endpoint without resolving it through supported API data.

## Amazon

The repository still contains a legacy PA-API adapter. Amazon's current deprecation notice says legacy calls return 403; this adapter is not a working production catalog integration. Do not provision old PA-API credentials to repair it.

Creators API migration needs an approved Associates account in the relevant market, Credential ID, Credential Secret, credential Version and an approved partner tag. It uses OAuth, regional token endpoints, `x-marketplace` and OffersV2. Old AWS PA-API credentials are incompatible. Implement and verify the new adapter against the approved account once access is available; no guessed tokens/endpoints or live activation in this pass.

- https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation
- https://affiliate-program.amazon.com/creatorsapi/docs/en-us/migrating-to-creatorsapi-from-paapi

MX and US tags are separate (`AMAZON_AFFILIATE_TAG_MX`/legacy MX fallback versus `AMAZON_AFFILIATE_TAG_US`). A US tag must not be copied to MX. Tag presence and click analytics do not demonstrate approved affiliation, attributed orders or earned commission; provider reports are needed.

## Gemini

Production previously returned a suspended-key 403. No safe key fingerprint has been established in this task; project/key display names do not identify the deployed credential. Resolve project/account restrictions and identify the production credential through secure administrative access before rotating it. Do not switch accounts to bypass suspension. Historical logs need separate exposure review.

Google now documents authorization keys and a September 2026 migration away from standard keys. Verify key type and project status in AI Studio; key migration is distinct from suspension remediation. The app accepts a server-only `GEMINI_API_KEY` and strips it from Gemini request URLs into the header. No key values appear in this report.

https://ai.google.dev/gemini-api/docs/api-key
