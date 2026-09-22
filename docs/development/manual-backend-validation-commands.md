# Manual Backend Validation Commands

Use this checklist after the Backend Coding agent finishes implementation and focused tests.

## 1. Start the isolated PostgreSQL test database

Check whether it is already running:

```bash
docker ps --filter name=entertainment-test-db
```

If it is not running:

```bash
docker run --name entertainment-test-db \
  --rm \
  -d \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=app_test \
  -p 5433:5432 \
  postgres:16
```

For a newly created test database, apply migrations once:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/app_test \
npx prisma migrate deploy
```

## 2. Lint

```bash
npm run lint
```

The two already-known frontend Vue warnings can be ignored unless they change or new warnings/errors appear.

## 3. Formatting check

```bash
npm run format:check
```

## 4. TypeScript check

```bash
npm run typecheck
```

## 5. Full test suite

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/app_test \
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/app_test \
NODE_ENV=test \
NUXT_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/app_test \
NUXT_TMDB_ACCESS_TOKEN=test-token \
npm test
```

The intentional MSW warning about an unhandled TMDB request in the smoke test is expected if that existing test still emits it.

## 6. Production build

```bash
npm run build
```

## 7. Review the changes before commit

```bash
git status
git diff --check
git diff --stat
git diff
```

If files are already staged:

```bash
git diff --cached --check
git diff --cached --stat
git diff --cached
```

## 8. Before pushing

The repository's Husky pre-push hook will run its own checks. If you want to verify Prisma manually first:

```bash
npx prisma validate
```

## 9. Optional: stop the disposable test database

```bash
docker stop entertainment-test-db
```

Because the container was created with `--rm`, stopping it removes it.

---

## Recommended workflow

```text
Backend Coding agent
    ↓
implementation + focused tests only
    ↓
STOP AGENT
    ↓
run this manual validation checklist
    ↓
review diff
    ↓
commit + push
    ↓
open PR with: Closes #<issue-number>
    ↓
CI
    ↓
merge
```
