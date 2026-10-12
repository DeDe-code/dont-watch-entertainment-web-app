# Contributing

Thanks for your interest in improving **Don't Watch Entertainment**! This guide covers the
day-to-day workflow for contributing a change. It is intentionally short: repository conventions
live in [.github/copilot-instructions.md](.github/copilot-instructions.md), and setup and
environment details live in [README.md](README.md).

## Code of Conduct

Be respectful and constructive in all interactions.

## Before you start

- Every change belongs to a single approved task or GitHub issue. Open an issue first if the work is
  not tracked yet.Task
  TASK-DOC, branch task-doc-repository-documentation-cleanup.

Handoff
Files changed/removed: removed DESIGN-SYSTEM.md; rewrote CONTRIBUTING.md (227 → 133 lines).
Outdated instructions corrected: removed develop branch base/target, deleted nonexistent .github/prompts/implementation-guide.md reference, removed stale Nuxt-3-style file tree and duplicated code-style rules, corrected setup order/scripts, added main-only + one-task-per-branch workflow, PR/review flow (title check via pr.yml, CI gates via ci.yml), and links to .github/copilot-instructions.md and the token-efficient workflow with AI tooling framed as optional.
References updated: no active document linked to DESIGN-SYSTEM.md; the two remaining mentions are backticked prose inside historical sections of frontend-implementation-plan-v1.1.md (lines 1203, 2293) and were preserved per the plan-preservation rule. All relative links in CONTRIBUTING.md verified to resolve.
Validation: npm run format:check pass; git diff --check pass; link/anchor check pass; git status shows only the two intended paths (no source changes). Tests not run (documentation-only).
Remaining concern: if you want the historical plan mentions of DESIGN-SYSTEM.md also touched, that is a one-line follow-up decision.
READY FOR MANUAL VALIDATION

- Check the issue's acceptance criteria and non-goals, and keep your change inside that scope.
- `main` is the only long-lived branch and the source of truth. Never commit directly to it.
- Visual design is defined in Figma; implemented design tokens and typography utilities live in
  [app/assets/css/main.css](app/assets/css/main.css).

## Setup

Requirements: Node.js 22, npm, PostgreSQL 16 (or a compatible PostgreSQL service), and a TMDB API
Read Access Token.

```bash
git clone https://github.com/DeDe-code/dont-watch-entertainment-web-app.git
cd dont-watch-entertainment-web-app
npm install                 # postinstall also generates the Prisma client
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, NUXT_TMDB_ACCESS_TOKEN
npx prisma migrate deploy   # or npm run db:migrate when authoring a new migration
npm run dev
```

[README.md](README.md) documents every environment variable, the local database workflow, and
deployment. `.env.example` contains placeholders only; never commit real credentials, tokens, or
connection URLs.

## Branch workflow

`main` is always deployable, and each task is developed on its own short-lived branch:

1. Update `main`: `git switch main && git pull --ff-only`
2. Create a task branch: `git switch -c task-<area>-<issue-number>-<slug>`

| Pattern                             | Use for                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `task-<area>-<issue-number>-<slug>` | Issue-driven work, e.g. `task-fe-007-search-api-integration` |
| `fix/<slug>`                        | Small bug fixes                                              |
| `chore/<slug>`, `docs/<slug>`       | Maintenance and documentation                                |

`<area>` names the owning layer or domain (`be`, `fe`, `a11y`, `sec`, `deploy`, `doc`). Keep one
task per branch: a branch contains only the changes for its own task, and it is deleted after the
pull request is merged.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`, with
`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, and `build` as the accepted
types. Write imperative subjects and keep commits focused so reviewers can follow the reasoning.

## Pull requests and review

1. Push the task branch and open a pull request **against `main`**.
2. Use the conventional-commit format for the pull request title. `.github/workflows/pr.yml`
   validates the title and auto-labels the change by area.
3. Describe the task, what changed, important design decisions, the validation you ran, and any
   blockers or follow-up work.
4. `.github/workflows/ci.yml` runs on the pull request: lint, format check, typecheck, Prisma
   migrations against an isolated PostgreSQL service, the Vitest suites, the build, and the Chromium
   Playwright gate. A failing check blocks the merge.
5. A maintainer reviews the change together with the evidence in the description. Address feedback
   with follow-up commits; never force-push or otherwise rewrite commits that are already under
   review.
6. Once the checks are green and the review is approved, the pull request is merged into `main`.

## Validation

Run the repository validation before requesting review:

```bash
npm run ci      # lint, format check, typecheck, tests, build
npm run format  # only when you need to apply formatting corrections. This command modifies files.
```

While iterating, prefer focused checks over the full suite:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:frontend
npm run test:e2e -- --project=chromium
```

The integration suite and the authenticated browser tests need `TEST_DATABASE_URL` pointing at an
isolated, disposable PostgreSQL database whose name contains `test`. Tests mock TMDB and never call
the live provider. See [README.md](README.md#testing-and-validation) for the full test setup.

## Database changes

1. Update `prisma/schema.prisma`.
2. Generate the client: `npm run db:generate`.
3. Create a migration: `npm run db:migrate`.
4. Test the migration against an isolated database.

Never run destructive database commands against a shared, staging, or production database.

## Documentation

- Update [README.md](README.md) when behavior, configuration, or scripts change.
- Keep contributor-facing documentation accurate; remove or update instructions that no longer
  match the repository.
- `docs/plans/` holds historical planning documents. Leave them as delivered history unless a
  broken link must be corrected.

Repository conventions such as architecture, security boundaries, code-quality expectations, and
Figma authority are defined in [.github/copilot-instructions.md](.github/copilot-instructions.md),
with layer-specific guidance in `.github/agents/`. The recommended session workflow for
task-scoped, token-efficient work is described in
[docs/workflows/token-efficient-coding-agent-workflow.md](docs/workflows/token-efficient-coding-agent-workflow.md);
these documents are useful as a checklist for any contributor, and AI assistance is optional.

## Questions?

If you have questions:

1. Check the existing documentation.
2. Search existing issues.
3. Open a new issue with the `question` label.

Thank you for contributing! 🎉
