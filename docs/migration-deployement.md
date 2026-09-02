# Migration & Deployment Plan — Cloudflare → Vercel (hosting) + Supabase (database)

> **STATUS: PLANNED — DO NOT EXECUTE.** This document is a planning-only artifact.
> It describes *how* to move r0ntflix off Cloudflare Pages + D1 onto **Vercel** for hosting and **Supabase (PostgreSQL)** for the database. None of the steps below have been performed yet. Track execution by checking off each box as it is done.
>
> **Rationale (why migrate):** the app is currently a vanilla HTML/CSS/JS site served by Cloudflare Pages with a Cloudflare D1 (SQLite) database behind Pages Functions. Vercel gives us the same static hosting + serverless Functions model (under the Vercel free/Hobby tier) that the current Filesystem/Pages-Function routing already mirrors, and Supabase gives a production-grade Postgres database with managed auth, an SQL editor, row-level security, and point-in-time backups — which the current hand-rolled session/cookie auth in D1 does not.
>
> **Current stack being replaced (reference point):**
>
> | Layer | Current (Cloudflare) | Target (Vercel + Supabase) |
> |---|---|---|
> | Static hosting | Cloudflare Pages (`wrangler pages deploy .`) | Vercel Hosting |
> | Serverless API | Pages Functions (`functions/**` → `/api/*`) | Vercel Functions (`api/**`) |
> | Database | Cloudflare D1 (`wrangler.toml` `[[d1_databases]]`, `context.env.DB`) | Supabase Postgres |
> | Schema source | `migrations/0001..0005_*.sql` (SQLite) | Supabase SQL migrations (converted to Postgres) |
> | Auth | Hand-rolled PBKDF2 + random `token` cookie in `sessions` table | Supabase Auth (optional) OR ported hand-rolled auth to Postgres |
> | Secrets | None in client; `database_id` in `wrangler.toml` | `.env` / Vercel project env vars |

---

## Table of Contents

1. [Scope & Non-Goals](#1-scope--non-goals)
2. [Environment Inventory & Prereqs](#2-environment-inventory--prereqs)
3. [Overall Architecture (target)](#3-overall-architecture-target)
4. [Map: Current Cloudflare Gaps → Vercel/Supabase](#4-map-current-cloudflare-gaps--vercelsupabase)
5. [Phase 0 — Freeze & Snapshot](#phase-0--freeze--snapshot)
6. [Phase 1 — Supabase Project + Schema Conversion](#phase-1--supabase-project--schema-conversion)
7. [Phase 2 — Data Migration (D1 → Supabase)](#phase-2--data-migration-d1--supabase)
8. [Phase 3 — Auth Strategy Decision](#phase-3--auth-strategy-decision)
9. [Phase 4 — Port API Endpoints to Vercel Functions (Postgres)](#phase-4--port-api-endpoints-to-vercel-functions-postgres)
10. [Phase 5 — Vercel SPA/Host Static Site](#phase-5--vercel-spahost-static-site)
11. [Phase 6 — Environment/Secrets, DNS & Custom Domain](#phase-6--environmentsecrets-dns--custom-domain)
12. [Phase 7 — End-to-End Verification & Cutover](#phase-7--end-to-end-verification--cutover)
13. [Phase 8 — Post-migration cleanup & Monitoring](#phase-8--post-migration-cleanup--monitoring)
14. [Open Decision Points](#open-decision-points)
15. [Rollback Plan](#rollback-plan)
16. [Appendix A — SQLite→Postgres conversion notes](#appendix-a--sqlitepostgres-conversion-notes)
17. [Appendix B — Current file/function inventory](#appendix-b--current-filefunction-inventory)

---

## 1. Scope & Non-Goals

### In scope
- Migrate hosting from Cloudflare Pages to **Vercel** (static assets + serverless API).
- Migrate the database from Cloudflare **D1 (SQLite)** to **Supabase (PostgreSQL)**.
- Convert the existing schema (migrations `0001`–`0005`) from SQLite to PostgreSQL.
- Port every current API endpoint (`/api/*`) to Vercel Functions backed by Supabase's `postgrest`/`supabase-js` or the `pg` driver.
- Migrate existing user/data rows from D1 to Supabase.
- Move the existing session-cookie auth model to Supabase (portably), *or* adopt Supabase Auth.
- Update project config/scripts/docs; cut over DNS.

### Non-goals (out of scope for this plan)
- No UI redesign; the frontend (`index.html` + static `*.js`/`*.css`) stays vanilla and essentially unchanged except API base-URL handling if needed.
- No TMDB / Viduki changes — they are external services independent of hosting.
- No new features. This is a pure platform migration + parity.
- No row-level-security (RLS) hardening *as a requirement for go-live* — listed as a recommended Phase 8 item, optional.

---

## 2. Environment Inventory & Prereqs

### 2.1 Accounts we need (you must have/obtain)
- [ ] **Vercel** account (Hobby tier). Domain (optional): the site can use `<project>.vercel.app` initially; bring a custom domain later if used.
- [ ] **Supabase** account. Create one project (choose region close to your users; for a personal app, `eu-central-1` or nearest).
- [ ] **Current Cloudflare** access retained — keep Cloudflare pages project + D1 alive during migration for parallel-run/rollback (do **not** delete anything until Phase 8).

### 2.2 Local tooling (installed)
- [ ] Node.js 18/20/22+ (`nvm use` current v24.20.0 is fine).
- [ ] `supabase` **CLI** (for migrations, local stack, and linking the project):
      - Install: `npm i -g supabase` or `brew install supabase/tap/supabase`
- [ ] `vercel` **CLI** (for local dev + deploy):
      - Install: `npm i -g vercel` (alias `v`)
- [ ] `wrangler` (already installed) — used only for the D1 **export** step and rollback during cutover.
- [ ] A DB client for Postgres (e.g. `psql`) — optional; Supabase SQL editor suffices.

### 2.3 Local dev workflows we will establish
- [ ] Local Supabase: `supabase start` (Docker) mirrors the schema for dev.
- [ ] Local Vercel: `vercel dev` serves both the static site and `api/**` serverless functions, reading env from `.env` / `.env.local`.

### 2.4 Secrets/env keys to create (never commit)
- [ ] `SUPABASE_URL` — project API URL (`https://<ref>.supabase.co`)
- [ ] `SUPABASE_ANON_KEY` — publishable client key (safe to ship to browser if using PostgREST with RLS)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — **server-only**; never expose to the client
- [ ] `SESSION_SECRET` (if we keep hand-rolled token/session auth) — a long random string for HMAC-signing tokens (optional if we switch to Supabase Auth JWT)
- [ ] Any existing per-user passwords: hashes already use PBKDF2 (`<salt>:<hash>`), which migrate verbatim (SQL format-independent). **No plaintext ever.**

---

## 3. Overall Architecture (target)

```
Browser (vanilla index.html + app.js/style.css/*.js)
        │
        ├── static assets ──────────────► Vercel hosting  (unchanged frontend files)
        │
        └── /api/* (fetch, credentials: include)
                    │
                    ▼
        Vercel Serverless Functions  (api/**)  ← "api" folder instead of "functions"
                    │
                    └── Supabase (PostreSQL)  ← replaces D1
                      (supabase-js OR pg; schema = converted migrations 0001..0005)
```

- **Frontend origin:** Vercel serves `index.html`, `config.js`, `tmdb.js`, `ui.js`, `auth.js`, `watchlist.js`, `history.js`, `profile.js`, `continue.js`, `player.js`, `episodes.js`, `search.js`, `recommendions.js`, `app.js`, `style.css`.
- **Same-origin APIs** keep working: `const AUTH_API = window.location.origin` (auth.js) still fetches `/api/...` from the Vercel domain. No CORS change needed if we keep the API on the same Vercel domain (recommended).
- **Two routing conventions to reconcile:** Cloudflare uses `functions/api/foo.js → /api/foo`. Vercel uses `api/foo.js → /api/foo` and `api/foo/bar.js → /api/foo/bar`. This is a **mechanical folder rename + filename tweak** (see Phase 4). Because both map to `/api/*`, the frontend `fetch` paths do not change.

---

## 4. Map: Current Cloudflare Gaps → Vercel/Supabase

| Current (Cloudflare) | Vercel equivalent | Supabase equivalent |
|---|---|---|
| `wrangler` | `vercel` CLI | `supabase` CLI + dashboard |
| `functions/**` | `api/**` | — |
| `_middleware.js` (runs for all, sets `context.data.user`) | Vercel no global middleware by default → use a small shared `auth` helper called per endpoint (or Vercel Middleware `middleware.ts`) | — |
| `context.env.DB` (bound D1) | `process.env.SUPABASE_URL`/keys | Supabase client |
| `context.request.json()`, `Response.json()` (Web Fetch) | same Fetch API is available in Vercel Functions | — |
| `context.data.secureCookie` (scheme-derived `Secure`) | derive from `request.headers.get('x-forwarded-proto')` / NODE_ENV | — |
| `functions/_password.js` (PBKDF2, Web Crypto) | can reuse as-is (Web Crypto exists in Vercel Node/edge) or delegate to Supabase Auth | — |
| `sessions` table + `token` cookie | hand-rolled sessions ported to Postgres OR Supabase Auth sessions | `auth.sessions` (if Supabase Auth) |
| D1 migrations (`*.sql`) | — | Supabase migrations (`.sql` in `supabase/migrations/`) |

---

## 5. Phase 0 — Freeze & Snapshot

> Goal: capture the exact current state of the D1 database and the deployed code so we can roll back or preserve parity.

- [ ] 5.1 Export the current D1 database to a portable SQL dump.
      - `wrangler d1 export rontflix-db --remote --no-schema=true --output=./backups/d1-data.sql` (produces INSERTs).
      - Also export schema: `wrangler d1 export rontflix-db --remote --output=./backups/d1-full.sql`.
      - Stash both under `backups/` (gitignored — contains user data).
- [ ] 5.2 Take a record of the current live deployment (for drift comparison):
      - `wrangler pages deployment list` and note the active deployment URL.
- [ ] 5.3 Snapshot code state: `git tag migration-snapshot-cloudflare && git push origin migration-snapshot-cloudflare` (or a branch `archive/cloudflare`).
- [ ] 5.4 Record current env/config caveats: hardcoded TMDB key in `config.js:5` (unchanged by migration), `wrangler.toml` `database_id`.
- [ ] 5.5 Decide whether to keep Cloudflare running in parallel throughout (recommended: **yes**, for rollback; only remove in Phase 8).
- [ ] 5.6 Confirm no active prod writes are required to be frozen — a personal app can tolerate a short read-only window at cutover; note the acceptable downtime (e.g. 5–15 min).

---

## 6. Phase 1 — Supabase Project + Schema Conversion

> Goal: create the Supabase project and recreate the r0ntflix schema in PostgreSQL, byte-for-byte behaviourally equivalent to D1.

### 6.1 Create/reset the project
- [ ] 6.1.1 Create a new Supabase project (pick a strong DB password, save it) + note the project ref (`<ref>.supabase.co`).
- [ ] 6.1.2 `supabase login` and `supabase init` in the repo (creates `supabase/` and `supabase/migrations/`).
- [ ] 6.1.3 Link the local repo to the remote project: `supabase link --project-ref <ref>`.

### 6.2 Author the Postgres migration
- [ ] 6.2.1 Create `supabase/migrations/000X_initial.sql` converting tables from SQLite to Postgres:
      - `users(id serial/uuid pk, email text not null unique, username text not null, ...)` — move to `bigint identity` if keeping numeric IDs (recommended for parity) OR `uuid` if adopting Supabase Auth.
- [ ] Convert each of the 5 current migrations:
      - `0001` → `users`, `sessions`, `watchlist`, `continue_watching`, `watch_history`.
      - `0002` → `auth_attempts` (rate-limit).
      - `0003` → unique index on `watch_history(user_id, tmdb_id, media_type, COALESCE(season,-1), COALESCE(episode,-1))` (SQLite expression unique index → Postgres **expression unique index**).
      - `0004` → same pattern for `continue_watching`.
      - `0005` → `ALTER TABLE users ADD COLUMN avatar_url TEXT;` (both engines accept this; add to migration).
- [ ] 6.2.2 Replace SQLite-only functions with Postgres equivalents (see **Appendix A**).
- [ ] 6.2.3 **Timestamps:** D1 uses `unixepoch()` (integer seconds). Decide target: keep integer epoch columns (`bigint`) for zero-diff migration **or** convert to `timestamptz default now()`. *Recommendation for parity:* keep integer epoch columns so data rows map 1:1; refactor to proper timestamps as a later optional cleanup.
- [ ] 6.2.4 Enable extensions only if needed (e.g. `pgcrypto` for `gen_random_uuid()` if going UUID).

### 6.3 Apply & verify schema locally
- [ ] 6.3.1 `supabase start`, then `supabase db reset` / `supabase migration up` to apply migrations to local Postgres.
- [ ] 6.3.2 Sanity-check the schema in the local SQL editor / `\d` (`psql`): every table + the two unique indexes exist.
- [ ] 6.3.3 Apply to remote: `supabase db push` (applies pending migrations to the linked project). **Verify before running in dashboard → SQL editor.**

---

## 7. Phase 2 — Data Migration (D1 → Supabase)

> Goal: copy all existing rows (users, sessions, watchlist, continue_watching, watch_history, auth_attempts) from D1 into Supabase.

- [ ] 7.1 Decide migration tooling. Recommended options:
      - **(A) Semi-manual SQL** — export from D1 (Phase 0) and import into Supabase via the SQL editor (split the dump; convert any SQLite-specific literals). Good for a personal app with modest row counts.
      - **(B) Write a one-off Node script** (`scripts/migrate-d1-to-supabase.mjs`) that reads the D1 export (or runs a small Cloudflare Worker to stream D1 rows over `pg`), and inserts into Supabase with a transaction. More robust for larger data.
- [ ] 7.2 Column mapping / type handling: because we keep integer epoch columns (6.2.3) and identical column names, mapping is largely 1:1. Confirm `NULL` season/episode for movies maps cleanly (both engines allow NULL).
- [ ] 7.3 **ID continuity:** preserve `users.id` values exactly (identity column with explicit `INSERT id`) so watchlist/continue/history `user_id` foreign keys keep pointing at the right users. Do **not** let auto-increment renumber.
- [ ] 7.4 Password hashes: `password_hash` is `"<salt>:<hash>"` — copy verbatim (no rehash). Reconfirm with a login test in Phase 7.
- [ ] 7.5 Sessions: if keeping hand-rolled sessions, copy the `sessions` rows verbatim so existing logins stay valid. **If instead switching to Supabase Auth in Phase 3, you must log users in again / prompt re-login** (tokens are different) — decide based on Phase 3 choice.
- [ ] 7.6 Row-count reconciliation: after import, compare counts per table between D1 (export grep) and Supabase (`select count(*) from ...`). Must match exactly (diff = 0).
- [ ] 7.7 Back up the Supabase state: enable **Point-in-Time Recovery / at least database backups** in Supabase dashboard (Settings → Database) before going live.

---

## 8. Phase 3 — Auth Strategy Decision

> Gate: choose the auth model **before** porting endpoints, because it changes `register/login/logout/me` and the `sessions` schema.

### Option A — Port hand-rolled auth to Supabase Postgres (Recommended for least-change/parity)
- [ ] Keep `sessions` table + random `token` httpOnly cookie **exactly** as today.
- [ ] Keep `_password.js` PBKDF2 hashing (works on Vercel via Web Crypto).
- [ ] Keep `_rateLimit.js` `auth_attempts` logic.
- [ ] Purely mechanical SQL layer swap (D1 → PostgREST/`pg`).
- **Pros:** zero behaviour change, existing row data + sessions migrate cleanly, smallest risk.
- **Cons:** no RLS, no built-in email-verification/2FA — all acceptable for a personal app.

### Option B — Adopt Supabase Auth
- [ ] Use Supabase Auth endpoints + `supabase-js`; store auth metadata.
- [ ] Convert `users.id` to `uuid`, map to `auth.users`; sessions owned by Supabase.
- [ ] Passwords now handled by Supabase (argon2/bcrypt internally); existing PBKDF2 hashes would need a forced password reset on first login.
- [ ] Frontend auth.js refactored to call Supabase client (still hits `/api/*` for app data).
- **Pros:** production-grade auth, RLS-ready, less custom code.
- **Cons:** bigger frontend + backend rewrite, data re-auth, more moving parts.

### Recommendation
- [ ] **Choose Option A** to keep Phase 7 (function port) mechanical and low-risk for a personal app. Note Option B as a possible Phase 8 follow-up if you later want RLS/feature-rich auth.

---

## 9. Phase 4 — Port API Endpoints to Vercel Functions (Postgres)

> Goal: reproduce every current endpoint behaviour on Vercel + Supabase. This is where most of the engineering time goes. Work is mechanical because the Cloudflare Pages-Functions and Vercel Functions APIs both speak the Web Fetch `Request`/`Response` contract.

### 9.1 Reconcile the routing/folder layout
- [ ] Rename Cloudflare `functions/` → Vercel `api/`:
      - `functions/api/foo.js` → `api/foo.js`
      - `functions/api/profile/password.js` → `api/profile/password.js`
- [ ] Update helper imports (`../_http.js`, `../_password.js`) — relative depths change (e.g. sharing helpers now at `api/_http.js` or a `lib/`).
- [ ] **Middleware replacement:** Cloudflare `_middleware.js` auto-ran for every request setting `context.data.user`. Vercel has no per-directory auto middleware by default. Options:
      - (a) Create a shared `api/_auth.js` helper (`getUser(req)`) and call it at the top of each protected endpoint — **recommended, explicit.**
      - (b) Use Vercel root `middleware.ts`/`middleware.js` to attach the user to `request` (runs on all routes; more ISR/streaming caveats).
- [ ] Adapt `context.data.secureCookie` → compute from `request.headers.get('x-forwarded-proto')` or `NODE_ENV==='production'`.

### 9.2 Replace the D1 client with Supabase access
- [ ] Install a client: `npm i @supabase/supabase-js` (simplest, uses PostgREST) **or** `pg` + pooled connection (fine-grained SQL). *Recommendation:* `@supabase/supabase-js` with the service-role key used server-side; keep raw SQL for the delete-then-insert and expression-index behaviours.
- [ ] Create `api/_db.js` exporting a shared `supabase` admin client from `process.env.SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Port each endpoint, preserving **all** validation from `_http.js` (media type, `intOr`, `clampNum`, `s`, `dbError`) — reuse `_http.js` verbatim.

### 9.3 Endpoint-by-endpoint port list
- [ ] `api/register.js` — hash pw, insert `users`, create `sessions` row, set cookie. Map `lastInserId` → `.insert().select('id')` or `.returning('id')`.
- [ ] `api/login.js` — verify hash, check `auth_attempts`, create session, set cookie.
- [ ] `api/logout.js` — delete session row, clear cookie (204).
- [ ] `api/me.js` — return `{ user }` or null from the resolved session.
- [ ] `api/watchlist.js` — GET/POST/DELETE, user-scoped; `ON CONFLICT ... DO UPDATE` → Postgres `ON CONFLICT (user_id,tmdb_id,media_type) DO UPDATE`.
- [ ] `api/continue.js` — GET/POST/DELETE; delete-then-insert upsert with `COALESCE(season,0)`; clamp `watched`/`duration`.
- [ ] `api/history.js` — GET/POST; delete+insert so replay bumps `played_at`; relies on the expression unique index (Postgres supports it).
- [ ] `api/profile.js` — PATCH username/email/avatar (email collision check, avatar `preset:`/http(s) validation, session rotation on email change).
- [ ] `api/profile/password.js` — verify current + set new hash.
- [ ] `api/import.js` — batch (cap 200), delete-then-insert.
- [ ] Confirm **authz** preserved: every query scoped by the resolved `user_id` (never trust client-supplied id).

### 9.4 SQL-specific conversions to handle
- [ ] `DB.prepare(...).run()/.first()/.all()` → PostgREST `.update().select()` / raw `pg` `.query(...)` → map rows.
- [ ] `DB.batch([...])` (D1) → Promise.all / Postgres transaction.
- [ ] `res.meta.last_row_id` (register) → insert `returning id`.
- [ ] `unixepoch()` in `INSERT ... VALUES (?, ?, unixepoch())` → use the app to set `Math.floor(Date.now()/1000)` for INTEGER epoch columns (keeps parity) **or** `now()` if columns are `timestamptz`.
- [ ] `ON CONFLICT` and expression unique indexes — verify Postgres syntax (Appendix A).

### 9.5 Local dev parity
- [ ] `.env.local`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`.
- [ ] Run `supabase start` (local Postgres mirror) + `vercel dev`; confirm local login→watchlist→play→history works exactly as it does today on Cloudflare `wrangler pages dev`.
- [ ] Re-run the Phase 6/7 regression checks (validation 400/409/429/401, two-user isolation, progress clamps, import cap, profile + password change, session rotation).

---

## 10. Phase 5 — Vercel SPA/Host Static Site

> Goal: get the unchanged vanilla frontend served by Vercel.

- [ ] 10.1 Create `vercel.json` (root) with:
      - `"cleanUrls": true` and/or rewrite `/api/*` is automatic (Vercel Functions handle it); optionally `"rewrites": [{ "source": "/api/(.*)", "destination": "/api/$1" }]` for clarity.
      - No SPA fallback to `index.html` needed (single-page, no client routing).
- [ ] 10.2 `vercel` CLI: ensure `vercel.json` points build/output at the static site. Because the frontend is plain files at repo root, set:
      - `"outputDirectory": "."` or configure the Framework Preset as **Other/SSG with static files** so `index.html` is the root.
- [ ] 10.3 Ensure Vercel does **not** try to build/node-install the SPA as a framework app: with static files at root, either disable the build command or put a minimal one (`npm run build` does nothing / copies static). Keep `api/**` as Functions.
- [ ] 10.4 Deploy preview: `vercel` (or push to the Vercel Git integration). Confirm `https://<project>.vercel.app/index.html` and `/api/me` respond.
- [ ] 10.5 Confirm static asset paths (relative `script src`, `style.css`, fonts) resolve correctly on Vercel (they are relative in `index.html`, so they follow the Vercel root).

---

## 11. Phase 6 — Environment/Secrets, DNS & Custom Domain

- [ ] 11.1 Vercel project → Settings → Environment Variables: add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (Production + Preview). Never commit in git.
- [ ] 11.2 (Optional) Custom domain: Vercel → Settings → Domains; add the domain; configure DNS (Vercel gives an `cname`/`A` record) at your registrar. Wait for propagation.
- [ ] 11.3 If using a custom domain, confirm the frontend `window.location.origin` API base stays same-origin (no CORS changes needed).
- [ ] 11.4 Transparency if you keep Cloudflare DNS as an edge, ensure there's no conflicting WAF rule blocking `/api/*`.

---

## 12. Phase 7 — End-to-End Verification & Cutover

> Goal: prove functional parity on the Vercel+SupaBase target before flipping users.

- [ ] 12.1 **Full API regression** (re-run the whole manual e2e from Phase 6/7 against the Vercel URL):
      1. `POST /api/register` (201; duplicate 409; short pw/bad email 400; rate-limit 429).
      2. `GET /api/me` — returns user incl. `avatar_url`.
      3. `POST /api/login` + cookie persists; `POST /api/logout` 204.
      4. Watchlist POST/GET/DELETE (user-scoped, 401 logged-out).
      5. Continue POST/GET/DELETE + watched/duration clamp.
      6. History POST/GET + replay no-duplicate (expression unique index).
      7. Import (cap 200; movie NULL-season dedupe).
      8. Profile PATCH (username/email/avatar, 409 dup email, avatar whitelist) + session rotation on email change; `POST /api/profile/password` (401 wrong current).
      9. Two-user authz isolation (B cannot see/affect A).
- [ ] 12.2 **Frontend smoke test** in a browser: home loads recommendations + continue; sign in; watchlist row; open Profile modal, change avatar/username, change password, see Watch History; play a movie (recordHistory).
- [ ] 12.3 **Data parity:** confirm counts match between D1 and Supabase after Phase 2 for all tables.
- [ ] 12.4 Decide the **cutover moment** (short read-only window). Sequence:
      1. Freeze writes (optional for personal app; or just accept minimal drift).
      2. Re-run data import if any drift since Phase 2 (incremental).
      3. Switch DNS/domain to Vercel (or point users to the Vercel URL).
      4. Monitor logs for errors over the first hours.
- [ ] 12.5 **Rollback readiness:** keep Cloudflare Pages + D1 deployed and the DNS record available to revert in minutes (see Rollback Plan).

---

## 13. Phase 8 — Post-migration cleanup & Monitoring

- [ ] 13.1 After a stable go-live (e.g. 1–2 weeks), delete/turn off the Cloudflare Pages project + D1 database **only after** confirming rollback is no longer needed. Keep one D1 snapshot in `backups/` for the history record.
- [ ] 13.2 Remove `wrangler.toml` and `wrangler` devDependency; remove `functions/` (now `api/`); remove `migrations/` if superseded by `supabase/migrations/`; update `package.json` scripts.
- [ ] 13.3 (Recommended, optional) Enable **RLS** on Supabase tables and switch client calls to the anon key + cookie/JWT token for defense-in-depth (goes hand-in-hand with Option B auth). Low priority for a private app.
- [ ] 13.4 Set up Vercel + Supabase monitoring/alerting (Vercel function logs; Supabase metrics / uptime).
- [ ] 13.5 Update this doc: strike out completed steps, mark go-live date/URL, and add any deviations found.

---

## 14. Open Decision Points

These must be answered before/during execution (flagged to you, not decided here):

1. **Auth:** Option A (port hand-rolled sessions to Postgres — least change) vs Option B (Supabase Auth — more robust, bigger rewrite). _Default recommended: A._
2. **IDs:** keep numeric `users.id` (parity, simple FK) vs switch to `uuid` (Supabase-Auth-friendly). Tied to #1.
3. **Timestamps:** keep integer-epoch columns (byte parity) vs convert to `timestamptz`. Tied to #1/#2; integer-epoch easiest for parity.
4. **Custom domain:** use Vercel's `<project>.vercel.app` or point an existing domain? Affects DNS step only.
5. **DB client:** `@supabase/supabase-js` (PostgREST) vs `pg` (raw SQL). Both can coexist; recommend one primary.
6. **RLS hardening:** adopt now or defer to Phase 8 Optional.
7. **Parallel-run duration:** how long to keep Cloudflare live after cutover (drives Phase 8 cleanup timing).

---

## 15. Rollback Plan

> If Vercel+SupaBase proves broken, revert with minimal downtime.

- [ ] 15.1 **Instant DNS rollback:** flip the DNS/domain record back to Cloudflare Pages (keep the deployment URL + records intact through Phase 0→7).
- [ ] 15.2 **Data rollback:** if Direction used the same Supabase data that was copied from D1, data on Cloudflare/D1 is unchanged (we did not delete it). Re-pointing Cloudflare restores the previous state immediately.
- [ ] 15.3 **Code rollback:** `git checkout` the `migration-snapshot-cloudflare` tag (Phase 0.3) and redeploy `wrangler pages deploy .` if DNS alone isn't enough.
- [ ] 15.4 Document the exact cutover timestamps + commands in this file when executed.

---

## 16. Appendix A — SQLite→Postgres conversion notes

| SQLite (D1) | PostgreSQL (Supabase) |
|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` (numeric) or `uuid DEFAULT gen_random_uuid()` |
| `unixepoch()` (seconds int) | keep as app-set `bigint` seconds (parity) or `now()` for `timestamptz` |
| `COALESCE(season, -1)` in unique index | **Postgres supports expression unique indexes** — same `COALESCE(season,-1)` works |
| `INSERT ... ON CONFLICT(cols) DO UPDATE SET ...` | same `ON CONFLICT ... DO UPDATE SET` (Postgres supports it; was already used for upserts) |
| `res.meta.last_row_id` | `INSERT ... RETURNING id` / PostgREST `.select('id')` |
| `DB.prepare().bind().run()/.first()/.all()` | `pg` `pool.query(...)` or `supabase.from('t').insert().select()` |
| `DB.batch([...])` | Postgres transaction / `Promise.all` of inserts |
| `AUTOINCREMENT` column aliasing | identity columns don't renumber; **explicit IDs must be inserted** for FK continuity |
| Case sensitivity | Postgres folds unquoted identifiers to lowercase; keep columns lowercase to match cloudflare dump |
| Booleans | `boolean` (tinyint can map to `smallint`/boolean) |

---

## 17. Appendix B — Current file/function inventory (what must move)

**Static (unchanged, hosted by Vercel):** `index.html`, `config.js`, `tmdb.js`, `ui.js`, `auth.js`, `watchlist.js`, `history.js`, `profile.js`, `continue.js`, `player.js`, `episodes.js`, `search.js`, `recommendations.js`, `app.js`, `style.css`.

**Serverless endpoints (migrate `functions/` → `api/`):**
- `api/register.js`, `api/login.js`, `api/logout.js`, `api/me.js`
- `api/watchlist.js`, `api/continue.js`, `api/history.js`, `api/import.js`
- `api/profile.js`, `api/profile/password.js`

**Shared backend helpers (port to `api/lib/`):** `_http.js`, `_password.js`, `_middleware.js` (→ `_auth.js`), `_rateLimit.js`.

**Schema (convert to `supabase/migrations/`):** `migrations/0001_init.sql`, `0002_auth_attempts.sql`, `0003_history_unique.sql`, `0004_continue_unique.sql`, `0005_avatar.sql`.

**Config/scripts to update:** `wrangler.toml` (remove), `package.json` scripts (`dev`/`deploy`/`db:*` → `vercel dev` + `supabase`), add `vercel.json`, `.env.local`, `supabase/`.