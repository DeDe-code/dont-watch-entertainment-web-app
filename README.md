# Entertainment Web App 🎬

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.9+-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A modern, fullstack entertainment streaming platform built with Nuxt 3, featuring user authentication, media browsing, bookmarking functionality, and advanced search capabilities. The application is fully responsive across desktop, tablet, and mobile devices.

## ✨ Features

- 🔐 **Secure Authentication** — JWT-based auth with HTTP-only cookies
- 🎥 **Media Browsing** — Browse movies and TV series with trending content
- 🔖 **Bookmarking** — Save and manage favorite content
- 🔍 **Advanced Search** — Search across all media with real-time results
- 📱 **Fully Responsive** — Optimized for mobile, tablet, and desktop
- 🎨 **Custom Design System** — Tailored UI with Nuxt UI components
- ⚡ **Optimized Performance** — Smart caching and data fetching strategies
- 🔒 **Security First** — Input validation, password hashing, protected routes

## 🛠 Technology Stack

### Frontend

| Technology       | Version | Purpose                                 |
| ---------------- | ------- | --------------------------------------- |
| **Nuxt 3**       | 4.2.2+  | Full-stack framework with Vue 3         |
| **Vue 3**        | 3.4.15+ | Composition API for reactive components |
| **TypeScript**   | 5.3+    | Type-safe development                   |
| **Nuxt UI**      | 4.4.0+  | UI component library                    |
| **Tailwind CSS** | 4.1.18+ | Utility-first styling                   |
| **Pinia**        | 2.1.7+  | State management                        |
| **Zod**          | 3.22.4+ | Schema validation                       |

### Backend

| Technology             | Version | Purpose                    |
| ---------------------- | ------- | -------------------------- |
| **Node.js**            | Latest  | Runtime environment        |
| **Nuxt Server Routes** | —       | API endpoints              |
| **Prisma**             | 5.9.0+  | Database ORM               |
| **SQLite**             | —       | Development database       |
| **bcrypt**             | 6.0.0+  | Password hashing           |
| **JWT**                | 9.0.2+  | Token-based authentication |

## 🏗 Architecture

### Project Structure

```
├── app/
│   ├── assets/css/main.css          # Tailwind layers and custom utilities
│   ├── components/
│   │   ├── MediaCard.vue            # Custom media card component
│   │   ├── SearchBar.vue            # Search input component
│   │   └── Navigation.vue           # Responsive navigation
│   ├── layouts/
│   │   └── default.vue              # Main layout with navigation
│   ├── middleware/
│   │   └── auth.global.ts           # Client-side route protection
│   ├── pages/
│   │   ├── index.vue                # Home (trending + recommended)
│   │   ├── movies.vue               # Movies listing
│   │   ├── tv-series.vue            # TV series listing
│   │   ├── bookmarked.vue           # Bookmarked content
│   │   ├── login.vue                # Login page
│   │   └── signup.vue               # Signup page
│   ├── schemas/
│   │   └── auth.ts                  # Zod validation schemas
│   ├── stores/
│   │   └── bookmarks.ts             # Pinia bookmark store
│   └── app.config.ts                # Nuxt UI theming
├── server/
│   ├── api/
│   │   ├── auth/                    # Authentication endpoints
│   │   ├── media/                   # Media endpoints
│   │   └── bookmarks/               # Bookmark endpoints
│   ├── middleware/
│   │   └── auth.ts                  # Server-side JWT verification
│   └── utils/
│       ├── auth.ts                  # Auth utilities
│       └── prisma.ts                # Prisma client singleton
├── prisma/
│   ├── schema.prisma                # Database schema
│   └── seed.ts                      # Seed script
└── nuxt.config.ts                   # Nuxt configuration
```

### Database Schema

**Models:**

- **User** — Authentication and profile data
- **Media** — Movies and TV series information
- **Bookmark** — User's saved content

**Key Features:**

- Cascade deletes for data integrity
- Unique constraints for bookmarks
- Indexed fields for optimized queries

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd dont-watch-entertainment-web-app
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory:

```env
NUXT_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
NUXT_TMDB_ACCESS_TOKEN="replace-with-a-tmdb-api-read-access-token"
NUXT_TMDB_LANGUAGE="en-US"
NUXT_TMDB_REGION="US"
NUXT_TMDB_REQUEST_TIMEOUT_MS="5000"
NUXT_TMDB_CACHE_TTL_SECONDS="300"
NUXT_SESSION_TTL_SECONDS="604800"
NODE_ENV="development"
```

4. **Initialize database**

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Seed with sample data
npm run db:seed
```

5. **Start development server**

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 📝 Available Scripts

### Development

```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build
npm run typecheck        # Run TypeScript type checking
```

### Database

```bash
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema changes to database
npm run db:studio        # Open Prisma Studio (database GUI)
npm run db:seed          # Seed database with sample data
npm run db:migrate       # Run database migrations
npm run db:reset         # Reset database
```

### Code Quality

```bash
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint errors automatically
npm run format           # Format code with Prettier
npm run format:check     # Check code formatting
```

### CI/CD

```bash
npm run ci               # Run all CI checks (lint, typecheck, test, build)
npm run ci:lint          # Run linting and format checks
npm run ci:typecheck     # Run type checking
npm run ci:test          # Run tests
npm run ci:build         # Build application
```

## 🎨 Design System

### Color Palette

| Color    | Hex       | Usage                     |
| -------- | --------- | ------------------------- |
| White    | `#FFFFFF` | Primary text, icons       |
| Black    | `#000000` | Contrast elements         |
| Blue 950 | `#10141E` | Primary dark background   |
| Blue 900 | `#161D2F` | Secondary dark background |
| Blue 500 | `#5A698F` | Muted text/elements       |
| Red 500  | `#FC4747` | Primary accent/CTA        |

### Typography

The app uses the **Outfit** font family with predefined text presets:

- **Preset 1:** Headings (32px desktop / 20px mobile)
- **Preset 2:** Medium headings (24px desktop / 16px mobile)
- **Preset 3:** Small headings (18px desktop / 15px mobile)
- **Preset 4:** Body text (15px)
- **Preset 5:** Small body (13px)
- **Preset 6:** Tiny text (11px mobile)

### Responsive Breakpoints

- **Mobile:** < 768px — 2-column grid, bottom navigation
- **Tablet:** 768px - 1023px — 3-column grid, sidebar navigation
- **Desktop:** ≥ 1024px — 4-column grid, sidebar navigation

## 🔐 Authentication Flow

1. **Signup/Login:**
   - Client validates input with Zod schemas
   - Server hashes password with bcrypt
   - JWT generated and stored in HTTP-only cookie
   - User data returned (excluding password)

2. **Protected Routes:**
   - Client middleware checks for auth token cookie
   - Server middleware verifies JWT on API requests
   - Unauthorized requests redirected to login

3. **Logout:**
   - Server clears authentication cookie
   - Client redirects to login page

## 📡 API Endpoints

### Authentication

- `POST /api/auth/signup` — Create new user account
- `POST /api/auth/login` — Authenticate user
- `POST /api/auth/logout` — Clear authentication

### Media

- `GET /api/media` — Get media (query: `category`, `trending`)
- `GET /api/media/search` — Search media (query: `q`)

### Bookmarks (Protected)

- `GET /api/bookmarks` — Get user's bookmarked content
- `POST /api/bookmarks` — Toggle bookmark (body: `{ mediaId }`)

## 🧪 Testing Checklist

- [ ] **Authentication:** Login, signup, logout functionality
- [ ] **Navigation:** All routes accessible and protected correctly
- [ ] **Search:** Search works across all media types
- [ ] **Bookmarks:** Toggle, persist, and display correctly
- [ ] **Responsive:** Mobile (< 768px), tablet (768-1023px), desktop (≥ 1024px)
- [ ] **Performance:** Caching works, no unnecessary re-fetches
- [ ] **Security:** HTTP-only cookies, protected routes, hashed passwords

## 🚀 Deployment

### Environment Variables (Production)

```env
NUXT_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
NUXT_TMDB_ACCESS_TOKEN="set-in-the-deployment-environment"
NUXT_TMDB_LANGUAGE="en-US"
NUXT_TMDB_REGION="US"
NUXT_TMDB_REQUEST_TIMEOUT_MS="5000"
NUXT_TMDB_CACHE_TTL_SECONDS="300"
NUXT_SESSION_TTL_SECONDS="604800"
NODE_ENV="production"
```

### Build & Deploy

```bash
# Build for production
npm run build

# Preview production build locally
npm run preview
```

For deployment options, see the [Nuxt deployment documentation](https://nuxt.com/docs/getting-started/deployment).

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository** and create a feature branch
2. **Follow the coding standards** outlined in [.github/copilot-instructions.md](.github/copilot-instructions.md)
3. **Write meaningful commit messages** following [Conventional Commits](https://www.conventionalcommits.org/)
4. **Test your changes** thoroughly
5. **Submit a pull request** using the [PR template](.github/pull_request_template.md)

### Branch Strategy

- `main` — Production-ready code
- `develop` — Integration branch for features
- `feature/*` — New features and enhancements
- `bugfix/*` — Bug fixes
- `hotfix/*` — Critical production fixes

For detailed branching workflow, see [.github/git-branch-strategy.md](.github/git-branch-strategy.md)

### Coding Standards

- **TypeScript First:** All code must use TypeScript
- **Nuxt UI First:** Use built-in components before creating custom ones
- **Security:** Never store sensitive data in localStorage
- **Validation:** Use Zod schemas for all forms
- **Caching:** Implement smart caching with `useFetch()`

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for complete coding guidelines.

## 📚 Documentation

- [Copilot Instructions](.github/copilot-instructions.md) — Development guidelines and patterns
- [Project Backlog](.github/PROJECT_BACKLOG.md) — Feature roadmap and task tracking
- [Git Branch Strategy](.github/git-branch-strategy.md) — Branching workflow
- [CI/CD Guide](.github/CI_CD_GUIDE.md) — Pipeline setup and automation

## 🔧 Troubleshooting

### Prisma Client Not Found

```bash
npm run db:generate
```

### Database Locked

Close Prisma Studio and restart the development server.

### Auth Cookie Not Setting

- Verify `secure` flag (requires HTTPS in production)
- Check `sameSite` settings
- Clear browser cookies

### Components Not Found

- Verify file is in `components/` directory
- Check file naming (PascalCase)
- Restart development server

## 📖 Resources

- [Nuxt 3 Documentation](https://nuxt.com/docs)
- [Nuxt UI Documentation](https://ui.nuxt.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Zod Documentation](https://zod.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Pinia Documentation](https://pinia.vuejs.org)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

**Last Updated:** January 27, 2026

Built with ❤️ using [Nuxt 3](https://nuxt.com) and [Nuxt UI](https://ui.nuxt.com)
