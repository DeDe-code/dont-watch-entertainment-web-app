# Contributing to Entertainment Web App

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

Please be respectful and constructive in all interactions.

## Getting Started

1. **Fork the repository**
2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR-USERNAME/dont-watch-entertainment-web-app.git
   cd dont-watch-entertainment-web-app
   ```

3. **Install dependencies**

   ```bash
   npm install
   ```

4. **Set up the database**

   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## Development Workflow

### Branch Naming Convention

- `feat/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/what-changed` - Documentation updates
- `refactor/what-changed` - Code refactoring
- `chore/what-changed` - Maintenance tasks

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

**Examples:**

```
feat(auth): add email verification
fix(api): resolve CORS issue on media endpoint
docs: update README with deployment instructions
refactor(components): simplify MediaCard logic
```

### Pull Request Process

1. **Create a new branch** from `develop`

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following the code style guidelines

3. **Commit your changes** using conventional commits

   ```bash
   git add .
   git commit -m "feat(scope): description"
   ```

4. **Push to your fork**

   ```bash
   git push origin feat/your-feature-name
   ```

5. **Create a Pull Request** to the `develop` branch

6. **Wait for review** - Address any requested changes

### Before Submitting PR

Ensure all checks pass:

```bash
# Check formatting
npm run format:check

# Lint your code
npm run lint

# Type check
npm run typecheck

# Run tests
npm test

# Build
npm run build
```

When your change affects frontend/browser behavior, also run the Chromium End-to-End browser tests. Install the browser once if needed with `npx playwright install chromium`, then:

```bash
npm run test:e2e -- --project=chromium
```

Authenticated browser tests require `TEST_DATABASE_URL` pointing at an isolated, disposable PostgreSQL test database whose name contains `test`. Browser tests mock TMDB deterministically and must not depend on the live provider. Firefox and WebKit are available for local cross-browser validation when relevant (`npx playwright install chromium firefox webkit`), but Chromium is the required CI browser gate.

## Code Style Guidelines

### TypeScript

- Use TypeScript for all files
- Define interfaces for component props
- Use type inference where possible
- Avoid `any` type

### Vue/Nuxt

- Use Composition API with `<script setup>`
- Follow Vue 3 best practices
- Use Nuxt UI components when possible
- Create custom components only when necessary

### Styling

- Use Tailwind CSS utility classes
- Follow design system specifications (see `.github/copilot-instructions.md`)
- Use custom utility classes from `main.css` for typography presets
- Customize Nuxt UI components via `:ui` prop

### File Organization

```
components/     # Vue components
pages/          # Nuxt pages (routes)
layouts/        # Layout components
middleware/     # Route middleware
server/
  api/          # API routes
  middleware/   # Server middleware
  utils/        # Server utilities
schemas/        # Zod validation schemas
prisma/         # Database schema and migrations
assets/         # Static assets
public/         # Public files
```

## Testing

Add focused tests for new behavior and keep the existing suites green. The integration suite and authenticated browser tests need an isolated `TEST_DATABASE_URL` (see the README); all tests mock TMDB and must not call the live provider.

```bash
# Run all Vitest projects
npm test

# Run a single project
npm run test:unit
npm run test:integration
npm run test:frontend

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run Chromium browser tests
npm run test:e2e -- --project=chromium
```

## Database Changes

When modifying the database schema:

1. **Update** `prisma/schema.prisma`
2. **Generate Prisma Client**: `npx prisma generate`
3. **Create a migration**: `npm run db:migrate`
4. **Test the migration** against an isolated database

## Documentation

- Update README.md for significant changes
- Add JSDoc comments for complex functions
- Update `.github/copilot-instructions.md` for architectural changes
- Update `.github/prompts/implementation-guide.md` for new features

## Questions?

If you have questions:

1. Check existing documentation
2. Search existing issues
3. Create a new issue with the `question` label

## Recognition

Contributors will be recognized in the project's README.md.

Thank you for contributing! 🎉
