# GitHub Copilot Instructions — Entertainment Web App

This document provides context and guidelines for GitHub Copilot when assisting with development of this entertainment streaming platform.

## Project Overview

A fullstack entertainment web app built with Nuxt 3, featuring authentication, media browsing, bookmarking, and search functionality. The app is responsive across desktop, tablet, and mobile viewports.

## Technology Stack

### Frontend

- **Framework:** Nuxt 3 with Vue 3 Composition API
- **Language:** TypeScript
- **UI Library:** Nuxt UI (built on Tailwind CSS)
- **Styling:** Tailwind CSS with custom design tokens
- **Validation:** Zod schemas for forms
- **State Management:** Pinia stores
- **Data Fetching:** `useFetch()` with caching strategies

### Backend

- **Runtime:** Node.js
- **API:** Nuxt server routes (`server/api/`)
- **Database:** SQLite with Prisma ORM
- **Authentication:** JWT stored in HTTP-only cookies
- **Password Hashing:** bcrypt

## Key Architectural Principles

1. **TypeScript First:** All code must use TypeScript for type safety
2. **Nuxt UI First:** Use Nuxt UI's built-in components (UButton, UInput, UCard, UForm, UFormGroup) with custom theming; only create custom components when Nuxt UI doesn't provide the needed functionality
3. **Component Customization:** Use Nuxt UI's `:ui` prop for styling overrides instead of creating duplicate components
4. **Security:** HTTP-only cookies over localStorage, secure flag in production, SameSite strict, JWT verification on all protected routes
5. **Caching:** Use `useFetch()` with `getCachedData` and unique keys; Pinia stores for client-side state
6. **Validation:** Centralized Zod schemas in `schemas/` directory integrated with UForm
7. **Responsive:** Mobile-first approach with Tailwind breakpoints (md: 768px, lg: 1024px)

## Design System

### Colors

- **White:** `#FFFFFF`
- **Black:** `#000000`
- **Blue 950:** `#10141E` (Primary dark background)
- **Blue 900:** `#161D2F` (Secondary dark background)
- **Blue 500:** `#5A698F` (Muted text/elements)
- **Red 500:** `#FC4747` (Primary accent/CTA)

### Typography (Outfit Font)

- **Text Preset 1:** 32px / 125% line-height / -0.5px letter-spacing (Desktop headings)
- **Text Preset 1 Mobile:** 20px / 125% line-height / -0.3px letter-spacing
- **Text Preset 2:** 24px / 125% line-height / 0px letter-spacing (Medium headings)
- **Text Preset 2 Mobile:** 16px / 125% line-height / 0px letter-spacing
- **Text Preset 3:** 18px / 125% line-height / 0px letter-spacing (Small headings)
- **Text Preset 3 Mobile:** 15px / 125% line-height / 0px letter-spacing
- **Text Preset 4:** 15px / 125% line-height / 0px letter-spacing (Body text)
- **Text Preset 5:** 13px / 125% line-height / 0px letter-spacing (Small body)
- **Text Preset 6 Mobile:** 11px / 125% line-height / 0px letter-spacing (Tiny text)

Apply via utility classes: `.text-preset-1`, `.text-preset-2-mobile`, etc.

### Spacing

- `spacing-100`: 8px
- `spacing-200`: 16px
- `spacing-300`: 24px
- `spacing-400`: 32px
- `spacing-500`: 40px
- `spacing-700`: 56px
- `spacing-900`: 72px
- `spacing-1000`: 80px

## Database Schema (Prisma)

### Models

- **User:** `id`, `email`, `password`, `createdAt`, `updatedAt`
- **Media:** `id`, `title`, `year`, `category`, `rating`, `thumbnail`, `isTrending`, `createdAt`, `updatedAt`
- **Bookmark:** `id`, `userId`, `mediaId`, `createdAt` with unique constraint on `userId_mediaId`

### Relationships

- User has many Bookmarks
- Media has many Bookmarks
- Bookmarks cascade delete when User or Media is deleted

## Project Structure

```
├── assets/css/main.css          # Tailwind layers and custom utilities
├── components/
│   ├── MediaCard.vue            # Custom media card component
│   ├── SearchBar.vue            # Search input with Nuxt UI UInput
│   └── Navigation.vue           # Responsive navigation (sidebar/bottom bar)
├── layouts/
│   └── default.vue              # Main layout with Navigation
├── middleware/
│   └── auth.global.ts           # Client-side route protection
├── pages/
│   ├── index.vue                # Home (trending + recommended)
│   ├── movies.vue               # Movies listing
│   ├── tv-series.vue            # TV series listing
│   ├── bookmarked.vue           # Bookmarked content
│   ├── login.vue                # Login page (no layout)
│   └── signup.vue               # Signup page (no layout)
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── seed.ts                  # Seed script with sample data
├── schemas/
│   └── auth.ts                  # Zod validation schemas
├── server/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login.post.ts
│   │   │   ├── signup.post.ts
│   │   │   └── logout.post.ts
│   │   ├── media/
│   │   │   ├── index.get.ts     # Get media with filters
│   │   │   └── search.get.ts    # Search media
│   │   └── bookmarks/
│   │       ├── index.get.ts     # Get user bookmarks
│   │       └── index.post.ts    # Toggle bookmark
│   ├── middleware/
│   │   └── auth.ts              # Server-side JWT verification
│   └── utils/
│       ├── auth.ts              # Auth utilities (hash, jwt, cookies)
│       └── prisma.ts            # Prisma client singleton
├── stores/
│   └── bookmarks.ts             # Pinia store for bookmark state
├── app.config.ts                # Nuxt UI theming
├── nuxt.config.ts               # Nuxt configuration
└── tailwind.config.ts           # Tailwind extensions
```

## Code Patterns & Best Practices

### Authentication Flow

1. **Signup/Login:** Validate with Zod → Hash password with bcrypt → Create/find user → Generate JWT → Set HTTP-only cookie → Return user data
2. **Protected API Routes:** Server middleware checks JWT from cookie → Verifies token → Attaches user to `event.context.user`
3. **Protected Pages:** Client middleware checks `auth_token` cookie → Redirects to `/login` if not authenticated

### Component Patterns

#### Using Nuxt UI Components

```vue
<!-- Use UInput with custom styling -->
<UInput
  v-model="searchQuery"
  placeholder="Search..."
  icon="i-heroicons-magnifying-glass"
  size="xl"
  :ui="{
    base: 'bg-transparent border-b border-blue-500 text-white',
    placeholder: 'placeholder-white/50',
  }"
  variant="none"
/>

<!-- Use UButton with theme colors -->
<UButton
  type="submit"
  color="red"
  size="lg"
  block
  :loading="loading"
  :ui="{ font: 'font-light', rounded: 'rounded-md' }"
>
  Login to your account
</UButton>
```

#### Custom Components

Only create custom components when Nuxt UI doesn't provide the functionality:

- `MediaCard.vue` — Specialized media display with overlays and bookmarking
- `SearchBar.vue` — Wrapper around UInput with custom search logic
- `Navigation.vue` — Responsive navigation switching between layouts

### Data Fetching with Caching

```typescript
// Use getCachedData for optimized fetching
const { data: movies } = await useFetch("/api/media", {
  query: { category: "Movie" },
  key: "movies",
  getCachedData(key) {
    return useNuxtData(key).data.value;
  },
});
```

### Form Validation

```typescript
// Define schema in schemas/auth.ts
export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Required"),
});

// Use in component with UForm
<UForm :state="formData" :schema="loginSchema" @submit="handleLogin">
  <UFormGroup name="email" :error="errors.email">
    <UInput v-model="formData.email" />
  </UFormGroup>
</UForm>
```

### Bookmark Management

```typescript
// In Pinia store (stores/bookmarks.ts)
async toggleBookmark(mediaId: string) {
  const { data } = await useFetch('/api/bookmarks', {
    method: 'POST',
    body: { mediaId },
  });

  if (data.value?.bookmarked) {
    this.bookmarkedIds.add(mediaId);
  } else {
    this.bookmarkedIds.delete(mediaId);
  }
}

// In component
<MediaCard
  :media="media"
  :bookmarked="bookmarksStore.isBookmarked(media.id)"
  @toggle-bookmark="bookmarksStore.toggleBookmark"
/>
```

## Responsive Design Guidelines

### Breakpoints

- **Mobile:** < 768px — 2-column grid, bottom navigation bar
- **Tablet:** 768px-1023px — 3-column grid, sidebar navigation
- **Desktop:** ≥ 1024px — 4-column grid, sidebar navigation

### Navigation Switching

```vue
<script setup>
const isMobile = ref(false);

const navClass = computed(() => {
  if (isMobile.value) {
    return "fixed bottom-0 left-0 right-0 bg-blue-900 flex items-center px-4 py-4 z-50";
  }
  return "fixed left-0 top-0 bottom-0 bg-blue-900 flex flex-col items-center py-8 px-6 z-50 w-24";
});
</script>
```

## API Endpoints

### Authentication

- `POST /api/auth/signup` — Create new user
- `POST /api/auth/login` — Authenticate user
- `POST /api/auth/logout` — Clear auth cookie

### Media

- `GET /api/media` — Get media (query: `category`, `trending`)
- `GET /api/media/search` — Search media (query: `q`)

### Bookmarks

- `GET /api/bookmarks` — Get user's bookmarks (requires auth)
- `POST /api/bookmarks` — Toggle bookmark (requires auth, body: `{ mediaId }`)

## Common Tasks

### Adding a New Page

1. Create file in `pages/` directory
2. Use default layout or set `definePageMeta({ layout: false })`
3. Fetch data with `useFetch()` and caching
4. Use Nuxt UI components for UI elements
5. Access bookmarks via `useBookmarksStore()`

### Adding a New API Endpoint

1. Create file in `server/api/` with HTTP method suffix (e.g., `.get.ts`, `.post.ts`)
2. Use `defineEventHandler()`
3. Access authenticated user via `event.context.user`
4. Use Prisma client from `~/server/utils/prisma`
5. Return data or throw `createError()` for errors

### Adding Form Validation

1. Create Zod schema in `schemas/` directory
2. Export schema and inferred types
3. Use with UForm component: `:schema="yourSchema"`
4. Handle validation in `@submit` handler

### Modifying Database Schema

1. Edit `prisma/schema.prisma`
2. Run `npx prisma generate` to update client
3. Run `npx prisma db push` to update database
4. Update seed script if needed: `npm run seed`

## Environment Variables

### Development (.env)

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="development-secret-change-in-production"
NODE_ENV="development"
```

### Production (.env.production)

```env
DATABASE_URL="file:./production.db"
JWT_SECRET="your-production-secret-change-this"
NODE_ENV="production"
```

## Development Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Database operations
npx prisma generate      # Generate Prisma client
npx prisma db push       # Push schema changes
npx prisma studio        # Open database viewer
npm run seed             # Seed database

# TypeScript
npm run typecheck        # Check types
```

## Security Considerations

1. **Never store JWTs in localStorage** — Use HTTP-only cookies only
2. **Always validate input** — Use Zod schemas on both client and server
3. **Hash passwords** — Use bcrypt with salt rounds ≥ 10
4. **Verify JWTs** — Check all protected API routes in server middleware
5. **HTTPS in production** — Set `secure: true` for cookies
6. **Sanitize database queries** — Prisma handles this automatically

## Testing Checklist

- [ ] **Authentication:** Login, signup, logout work correctly
- [ ] **Navigation:** All routes accessible and protected appropriately
- [ ] **Search:** Search functionality works on all pages
- [ ] **Bookmarks:** Toggle, persist across sessions, display correctly
- [ ] **Responsive:** Test mobile (< 768px), tablet (768-1023px), desktop (≥ 1024px)
- [ ] **Performance:** Caching works, no unnecessary re-fetches
- [ ] **Security:** Cookies are HTTP-only, routes are protected, passwords hashed

## Troubleshooting

### Prisma Client Not Found

```bash
npx prisma generate
```

### Database Locked

Close Prisma Studio and restart development server.

### Auth Cookie Not Setting

- Check `secure` flag (requires HTTPS in production)
- Verify `sameSite` settings
- Clear browser cookies

### Components Not Found

- Verify file is in `components/` directory
- Check file naming (PascalCase)
- Restart dev server

## References

- [Nuxt 3 Documentation](https://nuxt.com/docs)
- [Nuxt UI Documentation](https://ui.nuxt.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Zod Documentation](https://zod.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Pinia Documentation](https://pinia.vuejs.org)

---

**Last Updated:** January 22, 2026

When suggesting code or making changes, always follow these guidelines and maintain consistency with existing patterns in the codebase.
