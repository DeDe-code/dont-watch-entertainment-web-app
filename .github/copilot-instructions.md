# GitHub Copilot Instructions

## Project

`dont-watch-entertainment-web-app` is a full-stack entertainment application built with **Nuxt 4, Vue 3, TypeScript, Nuxt UI, Tailwind CSS, Pinia, Prisma, PostgreSQL, and Zod**.

GitHub is the source of truth for implementation and task state. Figma is the source of truth for UI/design when a task references it.

## Work from the task first

When implementing a GitHub issue:

1. Read the selected issue completely.
2. Inspect only the repository files needed to understand and implement it.
3. Try to solve the task from the issue and relevant code first.
4. Consult planning/architecture documents only when the issue or code is incomplete, ambiguous, conflicting, or requires a cross-cutting decision.

Do **not** read the whole implementation plan by default. Do not repeatedly restate task context that is already clear.

The selected GitHub issue is the immediate implementation contract. Preserve its scope, acceptance criteria, non-goals, dependencies, and open decisions. Do not implement future tasks early or perform unrelated refactors.

## Target backend architecture

Unless an approved task explicitly changes these decisions:

- Nuxt/Nitro provides the server/API layer.
- Prisma is the ORM and PostgreSQL is the target application database.
- TMDB is the canonical source for media discovery, search, trending content, and media details.
- PostgreSQL stores application-owned data: users, opaque sessions, bookmarks, and lightweight media references. Do not build a full duplicate TMDB catalogue.
- Authentication uses **opaque, expiring, database-backed sessions**, not JWT application sessions.
- Store only a hash of session tokens in the database.
- TMDB credentials and other secrets remain server-side.
- Normalize provider responses so frontend code is not coupled directly to TMDB response shapes.
- Shared provider caches must not contain user-specific bookmark or session state.
- Use Zod at runtime trust boundaries where validation is required.

The repository may contain legacy SQLite/JWT/local-catalogue code while migration tasks are in progress. Do not treat stale implementation as authority over an approved task or architecture decision.

## Code quality

Prefer simple, low-complexity designs and narrow changes.

- Use strong TypeScript types; avoid `any`, `@ts-ignore`, and disabled lint rules as shortcuts.
- Prefer small public interfaces that hide implementation details.
- Avoid duplicated knowledge, unnecessary pass-through layers, speculative abstractions, and configuration proliferation.
- Keep responsibilities separated between API routes, services/provider adapters, validation, and persistence.
- Use precise domain names.
- Comment intent, invariants, or non-obvious reasoning; do not comment obvious code line-by-line.
- Reuse sound existing project patterns before introducing new ones.

If a cleaner solution requires a broader architecture change or unrelated refactor, report it instead of expanding the current task.

## Security and data safety

- Never expose, log, or commit secrets, passwords, password hashes, raw session tokens, cookies, or provider credentials.
- Do not print `.env` contents.
- Never run destructive database commands against an unknown, shared, staging, or production database.
- Destructive integration-test cleanup must use an explicitly isolated test database.
- Tests must not make live TMDB requests; mock or intercept external provider traffic with deterministic fixtures.

## Validation

Use the validation commands required by the current issue. When applicable, prefer the repository scripts:

- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
- `npm test`
- `npm run build`

Do not claim a check passed if it was not run or was blocked. Distinguish pre-existing failures from regressions caused by the current task.

## Git and GitHub operations

Do not create/switch/delete branches, commit, push, open/merge pull requests, or mutate issues/projects unless the user explicitly asks for that operation.

Never force-push, rewrite shared history, or discard user work.

## Communication

Keep progress updates terse. Do not narrate routine tool calls or repeatedly restate the task. Report only decisions, blockers, safety-relevant state, and final results.
