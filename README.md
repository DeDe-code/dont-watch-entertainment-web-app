# Don't Watch Entertainment

A full-stack entertainment discovery application where users can
explore movies and TV series, discover trending titles, search
a real media catalogue, and save their favourites.

**[Explore the Live App](https://dont-watch-entertainment-web-app.vercel.app)**

Built with Nuxt and Vue, this project began as a Frontend Mentor
challenge and evolved into a complete, publicly deployed application.

Beyond the original challenge, I implemented a custom backend,
secure user authentication, persistent bookmarks, real movie and
TV data integration, automated testing, and cloud deployment.

The project demonstrates my approach to building maintainable
web applications, making architectural decisions, and solving
real development problems.

![Home page on desktop showing trending titles and bookmark controls](./docs/screenshots/home-desktop.png)

## Project origin

This project began as Frontend Mentor's [Entertainment web app challenge](https://www.frontendmentor.io/challenges/entertainment-web-app-J-UhgAW1X). Frontend Mentor provided the original challenge and design: the product concept, the UI/design direction, the responsive layout and navigation/search/bookmarking interaction requirements, and a small starter media dataset. Figma remains the visual/design source of truth for that challenge UI.

The repository extends that challenge into a deployed full-stack application. Real media data replaces the starter `data.json` (TMDB becomes the canonical media source), backend services and PostgreSQL store application-owned users, opaque sessions, and bookmarks, and authentication, persistent bookmark behavior, Playwright browser tests, accessibility validation, CI release validation, and Vercel/Neon deployment are all implementation additions rather than challenge-provided infrastructure.

## Key Features

- **Media discovery** — browse trending movies and TV series, with recommendations for titles worth watching next.
- **Search** — find titles in the media catalogue, or search within your own saved bookmarks.
- **User accounts** — create an account, log in securely, and stay signed in through authenticated sessions.
- **Persistent bookmarks** — save titles once and find them again on every future visit.
- **Responsive interface** — a layout designed for desktop, tablet, and mobile screens.
- **Reliable experience** — clear loading states, helpful error feedback, and retry options when something goes wrong.

## Screenshots

<table>
  <tr>
    <td align="center" width="50%">
      <img src="./docs/screenshots/movies-desktop.png" alt="Movies page on desktop showing a browsable movie catalogue" width="100%" />
      <br />
      Movies
    </td>
    <td align="center" width="50%">
      <img src="./docs/screenshots/bookmarked-desktop.png" alt="Bookmarked page on desktop showing saved titles" width="100%" />
      <br />
      Bookmarks
    </td>
  </tr>
</table>

<p align="center">
  <img src="./docs/screenshots/home-mobile.png" alt="Home page on mobile showing the responsive layout" width="280" />
  <br />
  Mobile experience
</p>

## Stack and architecture

Each layer has one clear responsibility:

- **Nuxt / Vue** renders the user interface and owns all browser-side interaction.
- **Nitro** exposes the server routes and holds the application logic, including validation, normalization, and session handling.
- **TMDB** is the canonical movie and TV catalogue: discovery, trending content, search, details, and ratings come from it.
- **PostgreSQL** stores application-owned data only — users, sessions, bookmarks, and rate-limit data.
- **Prisma** is the server-side database access layer for PostgreSQL.

```text
Browser
   |
   v
Nuxt / Vue application
   |
   v
Nitro server
   |-- TMDB (movie and TV catalogue)
   |
   |-- Prisma --> PostgreSQL
                  (application and user data)
```

Nuxt Server-Side Rendering (SSR) allows the server to prepare the initial page
HTML before sending it to the browser. This can improve initial content
visibility, while the browser subsequently makes the page interactive through
hydration. PostgreSQL is an application database, not a copy of the TMDB
catalogue: it holds user-owned state and only lightweight references to media,
while TMDB remains the source of media data.

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

## Engineering Highlights

**Media architecture.** TMDB stays the canonical movie and TV catalogue, while PostgreSQL stores only application-owned data — users, sessions, bookmarks, and rate-limit counters. This avoids duplicating a large external dataset and keeps media references lightweight. Provider responses are normalized in the Nitro layer, so the frontend consumes a stable, app-owned shape instead of being coupled to TMDB's response format.

**Authentication and security.** Passwords are hashed with bcrypt, and authentication uses opaque, database-backed sessions in HTTP-only cookies rather than client-readable tokens. Only the SHA-256 hash of each session token is stored, so a database leak does not expose usable sessions. Login and signup are protected by a PostgreSQL-backed rate limiter that stores hashed client identifiers only.

**Automated testing.** Vitest covers frontend components and backend behavior with unit and integration tests that mock external provider traffic, keeping results deterministic and provider-independent. Playwright adds browser-level regression tests that exercise the real application — including authenticated and bookmark flows — so critical user journeys are verified end to end.

**Production debugging.** After deployment, the Bookmarked page rendered server HTML that disagreed with the client during hydration, producing a Vue hydration mismatch that appeared only in the browser console. The cause was bookmark state being seeded in a watcher that the server renderer never flushed. The fix forced that seeding to run synchronously during server render, and regression tests were added to fail on any hydration mismatch. Production verification confirmed the page then hydrated cleanly.

## Prerequisites

- Node.js 22 (pinned through `package.json` `engines` to match the Node.js version validated in CI)
- npm
- PostgreSQL 16 or a compatible PostgreSQL service
- A TMDB API Read Access Token

## Environment

Copy `.env.example` to `.env` and replace placeholders. The application reads `NUXT_*` values through Nuxt runtime configuration. Prisma reads two PostgreSQL connection variables directly from the environment: `DATABASE_URL` is the runtime/application connection used by the running server, and `DIRECT_URL` is the direct connection used by Prisma CLI migration and admin commands. Both variables point at the same PostgreSQL database. `TEST_DATABASE_URL` is shared by the integration-test setup and the authenticated End-to-End (Playwright) tests; it must point to an isolated, disposable PostgreSQL database whose name contains `test`.

| Variable                                     | Required for                            | Secret? | Purpose                                                                                 |
| -------------------------------------------- | --------------------------------------- | ------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`                               | Prisma application database access      | Yes     | Runtime/application PostgreSQL connection URL; never commit it.                         |
| `DIRECT_URL`                                 | Prisma CLI migration and admin commands | Yes     | Direct PostgreSQL connection URL for `prisma migrate`/`db push`; never commit it.       |
| `TEST_DATABASE_URL`                          | Integration and authenticated E2E tests | Yes     | Disposable PostgreSQL URL for integration and authenticated E2E test setup.             |
| `NUXT_TMDB_ACCESS_TOKEN`                     | Nuxt server runtime                     | Yes     | Server-side TMDB API Read Access Token. Never expose it to the browser.                 |
| `NUXT_TMDB_LANGUAGE`                         | Nuxt runtime                            | No      | TMDB language/locale, default `en-US`.                                                  |
| `NUXT_TMDB_REGION`                           | Nuxt runtime                            | No      | ISO 3166-1 alpha-2 region used for TMDB results and ratings, default `US`.              |
| `NUXT_TMDB_REQUEST_TIMEOUT_MS`               | Nuxt runtime                            | No      | Provider request timeout from 100 to 30000 milliseconds, default `5000`.                |
| `NUXT_TMDB_CACHE_TTL_SECONDS`                | Nuxt runtime                            | No      | Shared provider cache TTL from 0 to 86400 seconds; `0` disables caching; default `300`. |
| `NUXT_SESSION_TTL_SECONDS`                   | Nuxt runtime                            | No      | Session lifetime from 300 to 2592000 seconds, default `604800` (7 days).                |
| `NUXT_AUTH_LOGIN_RATE_LIMIT_MAX`             | Nuxt runtime                            | No      | Login attempts allowed per client IP per window, default `10`.                          |
| `NUXT_AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS`  | Nuxt runtime                            | No      | Login rate-limit window in seconds, default `900` (15 minutes).                         |
| `NUXT_AUTH_SIGNUP_RATE_LIMIT_MAX`            | Nuxt runtime                            | No      | Signup attempts allowed per client IP per window, default `5`.                          |
| `NUXT_AUTH_SIGNUP_RATE_LIMIT_WINDOW_SECONDS` | Nuxt runtime                            | No      | Signup rate-limit window in seconds, default `3600` (60 minutes).                       |
| `NODE_ENV`                                   | Runtime/tests                           | No      | Environment mode; use `production` in production and `test` for tests.                  |

Do not place real credentials, tokens, or secret database connection URLs in documentation; the public application URL may be documented. Values in `.env.example` are placeholders only.

### Connection strategy

`DATABASE_URL` and `DIRECT_URL` point at the same PostgreSQL database but serve different roles:

- `DATABASE_URL` is the runtime/application connection used by the deployed server. In production, put Neon's pooled connection URL here.
- `DIRECT_URL` is the direct connection used by Prisma CLI migration and admin commands (`prisma migrate`, `prisma db push`). In production, put Neon's direct connection URL here.

For ordinary local PostgreSQL development, both variables may point to the same local database URL.

The four `NUXT_AUTH_*_RATE_LIMIT_*` values are non-secret, server-side settings. Login is limited to 10 requests per 15 minutes per client IP and signup to 5 requests per 60 minutes per client IP by default. The counters backing these limits are persisted in the existing PostgreSQL database, so no additional infrastructure is required. See [Authentication rate limiting](#authentication-rate-limiting) for behavior and deployment requirements.

## Local database workflow

Install dependencies and generate the Prisma client:

```bash
npm install
npm run db:generate
```

For a new local PostgreSQL database, set `DATABASE_URL` and `DIRECT_URL` to the same local connection URL, then apply committed migrations:

```bash
npx prisma migrate deploy
```

For local schema development, `npm run db:migrate` runs `prisma migrate dev` and may create a migration. Review and commit generated migrations. `npm run db:push` exists for Prisma schema prototyping only; it is not the migration workflow for shared, CI, or production databases. `npm run db:reset` is destructive and must only be used against an explicitly disposable local database. `npm run db:studio` opens Prisma Studio.

Production and CI should use `npx prisma migrate deploy`, not `migrate dev` or `db:push`. Before a deployment, take a database backup, inspect `npx prisma migrate status`, verify the migration is present in the artifact, and record the currently deployed version. Rollback preparation requires a tested database restore plan and an application version that remains compatible with the previous schema; Prisma migrations are not automatically reversible.

## Session behavior

Signup and login create a random 32-byte opaque token, store only its SHA-256 hash in `Session`, and set the `dont-watch-session` cookie. The cookie is HTTP-only, `SameSite=Lax`, scoped to `/`, and `Secure` when `NODE_ENV=production`; its expiry is based on `NUXT_SESSION_TTL_SECONDS`. Logout deletes the database session and clears the cookie. Expired or invalid sessions are rejected and their cookie is cleared.

## Authentication rate limiting

Login and signup are protected by a PostgreSQL-backed fixed-window rate limiter. Login and signup keep separate counters, so they never share a limit. The caller identifier (the resolved client IP) is hashed with SHA-256 before storage, so no raw client IP is persisted. When a caller exceeds the configured maximum, the server responds with HTTP `429 Too Many Requests` and a `Retry-After` header indicating when the current window resets. Limits and window lengths are configurable through the non-secret `NUXT_AUTH_LOGIN_RATE_LIMIT_*` and `NUXT_AUTH_SIGNUP_RATE_LIMIT_*` variables documented in [Environment](#environment).

The limiter resolves the client IP through H3/Nitro from the `X-Forwarded-For` header, which proxies use to pass the original visitor's IP address to the application. **Deployment prerequisite:** production must run behind a trusted CDN or reverse proxy that sets or sanitizes `X-Forwarded-For`. A deployment where arbitrary clients can spoof that header must not be exposed, because callers could otherwise bypass IP-based rate limiting. Verify this in the production hosting environment.

`RateLimitCounter` is application-owned operational data stored in PostgreSQL. During routine database maintenance, rows whose `expiresAt` has passed can be deleted if the table needs trimming; the limiter does not require a scheduler, cache, or cleanup job to operate.

## v1 API

Authentication uses the `dont-watch-session` HTTP-only cookie. “Optional” means the route works anonymously and adds user-specific bookmark enrichment when a valid cookie is present.

| Method   | Path                                              | Authentication | Purpose                                                                                                            |
| -------- | ------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/api/auth/signup`                                | Anonymous      | Create a user and start a session.                                                                                 |
| `POST`   | `/api/auth/login`                                 | Anonymous      | Verify credentials and start a session.                                                                            |
| `POST`   | `/api/auth/logout`                                | Optional       | Revoke the current session and clear its cookie.                                                                   |
| `GET`    | `/api/auth/me`                                    | Required       | Return the authenticated user.                                                                                     |
| `GET`    | `/api/media/trending`                             | Optional       | Return normalized TMDB trending movie and TV results.                                                              |
| `GET`    | `/api/media/movies`                               | Optional       | Return normalized TMDB movie discovery results.                                                                    |
| `GET`    | `/api/media/tv`                                   | Optional       | Return normalized TMDB TV discovery results.                                                                       |
| `GET`    | `/api/media/search`                               | Optional       | Search normalized TMDB movie and TV results.                                                                       |
| `GET`    | `/api/media/recommended`                          | Optional       | Return normalized recommendations from the user's recent bookmarks, falling back to discovery when there are none. |
| `GET`    | `/api/media/:type/:externalId`                    | Optional       | Return normalized TMDB details and regional rating data; `type` is `MOVIE` or `TV`.                                |
| `GET`    | `/api/bookmarks`                                  | Required       | List the authenticated user's bookmarks; supports the validated `page` query.                                      |
| `POST`   | `/api/bookmarks`                                  | Required       | Create a bookmark from a normalized media payload.                                                                 |
| `DELETE` | `/api/bookmarks/:provider/:externalId/:mediaType` | Required       | Delete the authenticated user's bookmark for a provider identity.                                                  |

Media list routes return normalized media with pagination metadata. Search additionally requires the validated `q` query. Bookmark routes use the normalized media identity and snapshot fields; they do not accept the obsolete `{ mediaId }` toggle shape.

## Testing and validation

Automated tests protect the behavior users depend on — authentication, sessions, media endpoints, and bookmarks — so regressions are caught before they reach users. The suites are deterministic and safe to run locally and in CI.

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

### Deployment target

The application is deployed on **Vercel Hobby**, which builds and runs the Nuxt/Nitro server, with PostgreSQL hosted on **Neon Free** in AWS `eu-central-1` (Frankfurt) and TMDB supplying all media data. The public instance is available at <https://dont-watch-entertainment-web-app.vercel.app>. Because the Neon database is in Frankfurt, `vercel.json` pins server functions to the adjacent `fra1` region so that database round-trips stay short. Nuxt/Vercel automatic framework detection is left enabled, so the repository deploys without custom build configuration.

Node.js 22 is pinned deliberately through `package.json` `engines` to match the Node.js version validated in CI, since Vercel otherwise defaults new projects to a newer Node.js major. The `postinstall` script runs `prisma generate` before `nuxt prepare` so the Prisma Client is generated reliably during Vercel installs, which install with lifecycle scripts enabled.

Required production secrets:

- `DATABASE_URL` — pooled application/runtime PostgreSQL connection.
- `DIRECT_URL` — direct PostgreSQL connection used by Prisma CLI migration and admin commands.
- `NUXT_TMDB_ACCESS_TOKEN` — server-side TMDB API Read Access Token.

Set all required production variables in the deployment environment, with separate secret storage for the database URLs and the TMDB token. Configure `DATABASE_URL` as the pooled application/runtime PostgreSQL connection and `DIRECT_URL` as the direct PostgreSQL connection used by Prisma migrations; both must target the same database. Production database migrations are applied manually (`npx prisma migrate deploy` against `DIRECT_URL`) rather than as part of the Vercel build, and Vercel installs dependencies and runs the Nuxt production build automatically on deploy. Run `npm run preview` only for a local preview of a production build. Confirm database connectivity, TMDB access, secure cookies, migration status, and the rollback backup/restore plan before releasing. Also confirm the deployment sits behind a trusted CDN or reverse proxy that sets or sanitizes `X-Forwarded-For`, as required by [Authentication rate limiting](#authentication-rate-limiting).

TMDB is the source of media data. This product uses TMDB APIs and assets subject to [TMDB terms](https://www.themoviedb.org/terms-of-use); see [Attribution](#attribution).

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

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.

- [TMDB](https://www.themoviedb.org/) — movie and TV data used throughout the application.
- [Frontend Mentor Entertainment web app challenge](https://www.frontendmentor.io/challenges/entertainment-web-app-J-UhgAW1X) — the original challenge and design this project began from.
