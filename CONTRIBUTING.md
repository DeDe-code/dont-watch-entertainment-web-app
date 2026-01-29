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
   npx prisma db push
   npm run seed
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
# Lint your code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type check
npm run typecheck

# Build
npm run build
```

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
stores/         # Pinia stores
schemas/        # Zod validation schemas
prisma/         # Database schema and migrations
assets/         # Static assets
public/         # Public files
```

## Testing

When adding new features, consider adding tests:

```bash
# Run tests (when implemented)
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Database Changes

When modifying the database schema:

1. **Update** `prisma/schema.prisma`
2. **Generate Prisma Client**: `npx prisma generate`
3. **Push changes**: `npx prisma db push`
4. **Update seed file** if needed: `prisma/seed.ts`
5. **Test migration**: `npm run seed`

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
