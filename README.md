# Don't Watch Entertainment

Nuxt 4 full-stack entertainment application. The server uses Nitro API routes, PostgreSQL, Prisma, opaque database-backed sessions, and TMDB as the canonical media provider.

## Project origin

This project began as Frontend Mentor's [Entertainment web app challenge](https://www.frontendmentor.io/challenges/entertainment-web-app-J-UhgAW1X). The challenge supplied the product concept, the UI/design direction, the responsive layout and navigation/search/bookmarking interaction requirements, and a small starter media dataset. Figma remains the visual/design source of truth for that challenge UI.

This repository intentionally extends the challenge into a full-stack application. TMDB replaces the starter `data.json` as the canonical media source; PostgreSQL stores application-owned users, opaque sessions, and bookmarks; and authentication, the Nitro/Prisma backend, persisted bookmark behavior, Playwright browser tests, accessibility validation, and CI release validation are all repository additions rather than challenge-provided infrastructure.

## Stack and architecture

- Nuxt 4, Vue 3, TypeScript, Nuxt UI, and Tailwind CSS
- Nitro server routes with Zod validation
- PostgreSQL accessed through Prisma
- TMDB for trending, discovery, search, details, and ratings
- bcrypt password hashing

The database has five application-owned roles:

- `User` stores account identity and the password hash.
- `Session` stores an expiry and only a SHA-256 hash of the opaque session token.
- `MediaReference` stores a lightweight TMDB identity and display snapshot for bookmarked media; it is not a local media catalogue.
- `Bookmark` joins a user to a `MediaReference`.
- `RateLimitCounter` stores hashed per-client authentication rate-limit counters and their current fixed-window expiry.

TMDB responses are normalized by the provider adapter. A shared in-process provider cache stores provider responses for the configured TTL and contains no user state. Media endpoints optionally read the session and enrich normalized results with the requesting user's `isBookmarked` value. Bookmark state remains user-specific in PostgreSQL.

## Prerequisites

- Node.js 22 (the CI workflow tests Node 22)
- npm
- PostgreSQL 16 or a compatible PostgreSQL service
- A TMDB API Read Access Token

## Environment

Copy `.env.example` to `.env` and replace placeholders. The application reads `NUXT_*` values through Nuxt runtime configuration. Prisma CLI reads `DATABASE_URL` directly from the environment. `TEST_DATABASE_URL` is shared by the integration-test setup and the authenticated End-to-End (Playwright) tests; it must point to an isolated, disposable PostgreSQL database whose name contains `test`.

| Variable                                     | Required for                                                          | Secret? | Purpose                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`                               | Prisma CLI migrations/generation workflows that connect to PostgreSQL | Yes     | PostgreSQL URL used by Prisma CLI; never commit it.                                     |
| `NUXT_DATABASE_URL`                          | Nuxt server runtime                                                   | Yes     | PostgreSQL URL validated by the running application.                                    |
| `TEST_DATABASE_URL`                          | Integration and authenticated E2E tests                               | Yes     | Disposable PostgreSQL URL for integration and authenticated E2E test setup.             |
| `NUXT_TMDB_ACCESS_TOKEN`                     | Nuxt server runtime                                                   | Yes     | Server-side TMDB API Read Access Token. Never expose it to the browser.                 |
| `NUXT_TMDB_LANGUAGE`                         | Nuxt runtime                                                          | No      | TMDB language/locale, default `en-US`.                                                  |
| `NUXT_TMDB_REGION`                           | Nuxt runtime                                                          | No      | ISO 3166-1 alpha-2 region used for TMDB results and ratings, default `US`.              |
| `NUXT_TMDB_REQUEST_TIMEOUT_MS`               | Nuxt runtime                                                          | No      | Provider request timeout from 100 to 30000 milliseconds, default `5000`.                |
| `NUXT_TMDB_CACHE_TTL_SECONDS`                | Nuxt runtime                                                          | No      | Shared provider cache TTL from 0 to 86400 seconds; `0` disables caching; default `300`. |
| `NUXT_SESSION_TTL_SECONDS`                   | Nuxt runtime                                                          | No      | Session lifetime from 300 to 2592000 seconds, default `604800` (7 days).                |
| `NUXT_AUTH_LOGIN_RATE_LIMIT_MAX`             | Nuxt runtime                                                          | No      | Login attempts allowed per client IP per window, default `10`.                          |
| `NUXT_AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS`  | Nuxt runtime                                                          | No      | Login rate-limit window in seconds, default `900` (15 minutes).                         |
| `NUXT_AUTH_SIGNUP_RATE_LIMIT_MAX`            | Nuxt runtime                                                          | No      | Signup attempts allowed per client IP per window, default `5`.                          |
| `NUXT_AUTH_SIGNUP_RATE_LIMIT_WINDOW_SECONDS` | Nuxt runtime                                                          | No      | Signup rate-limit window in seconds, default `3600` (60 minutes).                       |
| `NODE_ENV`                                   | Runtime/tests                                                         | No      | Environment mode; use `production` in production and `test` for tests.                  |

Do not place real credentials, tokens, or production URLs in documentation. Values in `.env.example` are placeholders only.

The four `NUXT_AUTH_*_RATE_LIMIT_*` values are non-secret, server-side settings. Login is limited to 10 requests per 15 minutes per client IP and signup to 5 requests per 60 minutes per client IP by default. The counters backing these limits are persisted in the existing PostgreSQL database, so no additional infrastructure is required. See [Authentication rate limiting](#authentication-rate-limiting) for behavior and deployment requirements.

## Local database workflow

Install dependencies and generate the Prisma client:

```bash
npm install
npm run db:generate
```

For a new local PostgreSQL database, set both `DATABASE_URL` and `NUXT_DATABASE_URL` to the appropriate local connection URL, then apply committed migrations:

```bash
npx prisma migrate deploy
```

For local schema development, `npm run db:migrate` runs `prisma migrate dev` and may create a migration. Review and commit generated migrations. `npm run db:push` exists for Prisma schema prototyping only; it is not the migration workflow for shared, CI, or production databases. `npm run db:reset` is destructive and must only be used against an explicitly disposable local database. `npm run db:studio` opens Prisma Studio.

Production and CI should use `npx prisma migrate deploy`, not `migrate dev` or `db:push`. Before a deployment, take a database backup, inspect `npx prisma migrate status`, verify the migration is present in the artifact, and record the currently deployed version. Rollback preparation requires a tested database restore plan and an application version that remains compatible with the previous schema; Prisma migrations are not automatically reversible.

## Session behavior

Signup and login create a random 32-byte opaque token, store only its SHA-256 hash in `Session`, and set the `dont-watch-session` cookie. The cookie is HTTP-only, `SameSite=Lax`, scoped to `/`, and has an expiry based on `NUXT_SESSION_TTL_SECONDS`; it is `Secure` when `NODE_ENV=production`. Logout deletes the database session and clears the cookie. Expired or invalid sessions are rejected and their cookie is cleared.

## Authentication rate limiting

Login and signup are protected by a PostgreSQL-backed fixed-window rate limiter. Each scope keeps its own counter, so login and signup never share a limit, and the caller identifier (the resolved client IP) is hashed with SHA-256 before storage; no raw client IP is persisted. When a caller exceeds the configured maximum, the server responds with HTTP `429 Too Many Requests` and a `Retry-After` header indicating when the current window resets. Limits and window lengths are configurable through the non-secret `NUXT_AUTH_LOGIN_RATE_LIMIT_*` and `NUXT_AUTH_SIGNUP_RATE_LIMIT_*` variables documented in [Environment](#environment).

The limiter resolves the client IP through H3/Nitro using the `X-Forwarded-For` header, which a proxy uses to tell the application the original visitor's IP address. **Deployment prerequisite:** production must run behind a trusted CDN or reverse proxy that sets or sanitizes `X-Forwarded-For`. A deployment where arbitrary clients can spoof that header must not be exposed, because callers could otherwise bypass IP-based rate limiting. Verify this when selecting and configuring the production hosting environment.

`RateLimitCounter` is application-owned operational data stored in PostgreSQL. During routine database maintenance, rows whose `expiresAt` has passed can be deleted if the table needs trimming; the limiter does not require a scheduler, cache, or cleanup job to operate.

## v1 API

Authentication uses the `dont-watch-session` HTTP-only cookie. “Optional” means the route works anonymously and adds user-specific bookmark enrichment when a valid cookie is present.

| Method   | Path                                              | Authentication | Purpose                                                                             |
| -------- | ------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `POST`   | `/api/auth/signup`                                | Anonymous      | Create a user and start a session.                                                  |
| `POST`   | `/api/auth/login`                                 | Anonymous      | Verify credentials and start a session.                                             |
| `POST`   | `/api/auth/logout`                                | Optional       | Revoke the current session and clear its cookie.                                    |
| `GET`    | `/api/auth/me`                                    | Required       | Return the authenticated user.                                                      |
| `GET`    | `/api/media/trending`                             | Optional       | Return normalized TMDB trending movie and TV results.                               |
| `GET`    | `/api/media/movies`                               | Optional       | Return normalized TMDB movie discovery results.                                     |
| `GET`    | `/api/media/tv`                                   | Optional       | Return normalized TMDB TV discovery results.                                        |
| `GET`    | `/api/media/search`                               | Optional       | Search normalized TMDB movie and TV results.                                        |
| `GET`    | `/api/media/:type/:externalId`                    | Optional       | Return normalized TMDB details and regional rating data; `type` is `MOVIE` or `TV`. |
| `GET`    | `/api/bookmarks`                                  | Required       | List the authenticated user's bookmarks; supports the validated `page` query.       |
| `POST`   | `/api/bookmarks`                                  | Required       | Create a bookmark from a normalized media payload.                                  |
| `DELETE` | `/api/bookmarks/:provider/:externalId/:mediaType` | Required       | Delete the authenticated user's bookmark for a provider identity.                   |

Media list routes return normalized media with pagination metadata. Search additionally requires the validated `q` query. Bookmark routes use the normalized media identity and snapshot fields; they do not accept the obsolete `{ mediaId }` toggle shape.

## Testing and validation

The integration suite and the authenticated End-to-End (Playwright) tests both require an isolated PostgreSQL database configured by `TEST_DATABASE_URL`. Destructive cleanup is guarded so it only targets a test-specific database. Authenticated E2E tests expect the test database schema to already be migrated: CI deploys migrations before the browser E2E gate, and local developers should apply the committed migrations to their disposable test database before running authenticated E2E tests when necessary. All tests mock TMDB traffic and must not call the live provider.

### Unit, integration, and build checks

```bash
npm run db:generate
npx prisma migrate deploy
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The complete repository validation is also available as `npm run ci`; it runs lint/format, typecheck, tests, and build. It does not run Playwright. The GitHub Actions workflow runs the browser End-to-End gate as a separate step.

### Browser (Playwright) tests

Playwright drives the real Nuxt application through a real browser. Install a browser when it is not already present:

```bash
npx playwright install chromium
```

Firefox and WebKit are supported for local cross-browser validation only:

```bash
npx playwright install chromium firefox webkit
```

Anonymous browser tests run without a PostgreSQL test database. Authenticated browser tests require `TEST_DATABASE_URL` pointing at a disposable, test-specific PostgreSQL database (the same guard used by the integration suite requires the database name to contain `test`). For example:

```bash
TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/app_test" \
  npm run test:e2e -- --project=chromium
```

The URL above is an example local test database only; it is not a credential and must never be reused for a real or production database. The browser-test environment uses deterministic TMDB mocks preloaded into the Nuxt server, so the suite never depends on the live TMDB service.

Chromium is the required Continuous Integration release gate. Firefox and WebKit are available for local cross-browser validation but are not required CI browser gates.

## Production checks and deployment

Set all required production variables in the deployment environment, with separate secret storage for database URLs and the TMDB token. Run `npm ci`, `npm run db:generate`, `npx prisma migrate deploy`, and `npm run build`, then start the generated Nuxt server using the deployment platform's standard Nuxt/Nitro command. Run `npm run preview` only for a local preview of a production build. Confirm database connectivity, TMDB access, secure cookies, migration status, and the rollback backup/restore plan before releasing. Also confirm the deployment sits behind a trusted CDN or reverse proxy that sets or sanitizes `X-Forwarded-For`, as required by [Authentication rate limiting](#authentication-rate-limiting).

TMDB is the source of media data. This product uses TMDB APIs and assets subject to [TMDB terms](https://www.themoviedb.org/terms-of-use). Include the following attribution in deployed product documentation or an about/credits surface: “This product uses the TMDB API but is not endorsed or certified by TMDB.”

## Development scripts

```bash
npm run dev             # Start the Nuxt development server
npm run format:check    # Check Prettier formatting
npm run lint            # Run ESLint
npm run typecheck       # Run Nuxt TypeScript checks
npm test                # Run all Vitest projects
npm run test:e2e        # Run Playwright browser tests
npm run build           # Build for production
npm run db:studio       # Open Prisma Studio
```
