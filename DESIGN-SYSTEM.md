# Design System Documentation

This document outlines the complete design system for the Entertainment Web App, built entirely on **Nuxt UI** using CSS variables and the `@theme` directive.

## Design Philosophy

This design system is built **exclusively with Nuxt UI**, using CSS variables in the `@theme` directive for all customizations. **No tailwind.config.ts file is used** to avoid conflicts with Nuxt UI's internal Tailwind configuration. All design tokens (colors, spacing, typography) are defined using CSS variables in [main.css](app/assets/css/main.css).

## Color Palette

### Core Colors

| Color Name | Hex Code  | CSS Variable       | Usage                                   |
| ---------- | --------- | ------------------ | --------------------------------------- |
| White      | `#FFFFFF` | N/A                | Primary text, icons on dark backgrounds |
| Black      | `#000000` | N/A                | Pure black, gradients                   |
| Blue 950   | `#10141E` | `--color-blue-950` | Primary dark background                 |
| Blue 900   | `#161D2F` | `--color-blue-900` | Secondary dark background, cards        |
| Blue 500   | `#5A698F` | `--color-blue-500` | Muted text, disabled states             |
| Red 500    | `#FC4747` | `--color-red-500`  | Primary accent, CTAs, errors            |

All custom colors are defined in the `@theme` directive in [main.css](app/assets/css/main.css).

### Usage with Nuxt UI

Nuxt UI is configured with `colors: { primary: 'red', neutral: 'blue' }` in `app.config.ts`:

```vue
<!-- Nuxt UI components with primary color (red) -->
<UButton color="primary">Primary Action</UButton>
<UBadge color="red">New</UBadge>

<!-- Direct Tailwind classes for custom elements -->
<div class="bg-blue-950">Primary Background</div>
<div class="bg-blue-900">Secondary Background</div>
<p class="text-white">Primary Text</p>
<p class="text-blue-500">Muted Text</p>
```

### Gradients

Black gradients are used for overlays:

- **10% Opacity:** `rgba(0, 0, 0, 0.1)` or `bg-black/10`
- **75% Opacity:** `rgba(0, 0, 0, 0.75)` or `bg-black/75`

```vue
<!-- Example gradient overlay -->
<div class="bg-gradient-to-b from-black/10 to-black/75">
  Gradient Overlay
</div>
```

## Typography

### Font Family

The app uses **Outfit** font from Google Fonts as the default font with weights:

- **Light:** 300
- **Regular:** 400
- **Medium:** 500

Outfit is set as `--font-sans: 'Outfit', sans-serif` in the `@theme` directive, automatically applying to all text.

### Text Presets

#### Desktop

| Preset   | Size | Line Height | Letter Spacing | Usage           | CSS Class        |
| -------- | ---- | ----------- | -------------- | --------------- | ---------------- |
| Preset 1 | 32px | 125%        | -0.5px         | Large headings  | `.text-preset-1` |
| Preset 2 | 24px | 125%        | 0px            | Medium headings | `.text-preset-2` |
| Preset 3 | 18px | 125%        | 0px            | Small headings  | `.text-preset-3` |
| Preset 4 | 15px | 125%        | 0px            | Body text       | `.text-preset-4` |
| Preset 5 | 13px | 125%        | 0px            | Small body text | `.text-preset-5` |

#### Mobile

| Preset          | Size | Line Height | Letter Spacing | Usage           | CSS Class               |
| --------------- | ---- | ----------- | -------------- | --------------- | ----------------------- |
| Preset 1 Mobile | 20px | 125%        | -0.3px         | Large headings  | `.text-preset-1-mobile` |
| Preset 2 Mobile | 16px | 125%        | 0px            | Medium headings | `.text-preset-2-mobile` |
| Preset 3 Mobile | 15px | 125%        | 0px            | Small headings  | `.text-preset-3-mobile` |
| Preset 6 Mobile | 11px | 125%        | 0px            | Tiny text       | `.text-preset-6-mobile` |

### Usage Examples

```vue
<template>
  <!-- Desktop heading with responsive sizing -->
  <h1 class="text-preset-1-mobile md:text-preset-1 text-white">
    Welcome to Entertainment
  </h1>

  <!-- Responsive heading -->
  <h2 class="text-preset-2-mobile md:text-preset-2 text-white">Trending Now</h2>

  <!-- Body text -->
  <p class="text-preset-4 text-blue-500">Discover new content daily</p>

  <!-- Small text -->
  <span class="text-preset-5 text-blue-500"> 2024 • Movie • PG </span>

  <!-- With Nuxt UI components -->
  <UCard :ui="{ body: { base: 'text-preset-4' } }">
    <p class="text-white">Card content with preset typography</p>
  </UCard>
</template>
```

## Spacing Scale

Our spacing system uses CSS variables defined in the `@theme` directive:

| Token        | Value | CSS Variable     | Tailwind Classes               | Common Usage                |
| ------------ | ----- | ---------------- | ------------------------------ | --------------------------- |
| spacing-100  | 8px   | `--spacing-100`  | `p-100`, `m-100`, `gap-100`    | Tight spacing               |
| spacing-200  | 16px  | `--spacing-200`  | `p-200`, `m-200`, `gap-200`    | Standard spacing            |
| spacing-300  | 24px  | `--spacing-300`  | `p-300`, `m-300`, `gap-300`    | Medium spacing              |
| spacing-400  | 32px  | `--spacing-400`  | `p-400`, `m-400`, `gap-400`    | Large spacing               |
| spacing-500  | 40px  | `--spacing-500`  | `p-500`, `m-500`, `gap-500`    | Extra large spacing         |
| spacing-700  | 56px  | `--spacing-700`  | `p-700`, `m-700`, `gap-700`    | Section spacing             |
| spacing-900  | 72px  | `--spacing-900`  | `p-900`, `m-900`, `gap-900`    | Large section spacing       |
| spacing-1000 | 80px  | `--spacing-1000` | `p-1000`, `m-1000`, `gap-1000` | Extra large section spacing |

### Spacing Usage Examples

```vue
<template>
  <!-- Card with spacing -->
  <div class="p-300 bg-blue-900 rounded-lg">
    <h3 class="mb-200">Movie Title</h3>
    <p class="text-blue-500">Description</p>
  </div>

  <!-- Grid with gap -->
  <div
    class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-200 md:gap-300"
  >
    <!-- Media cards -->
  </div>

  <!-- Section spacing -->
  <section class="py-700 px-300">
    <h2 class="mb-500">Section Title</h2>
    <!-- Content -->
  </section>
</template>
```

## Responsive Breakpoints

The app follows a mobile-first approach with these breakpoints:

| Breakpoint | Width          | Usage                         | Tailwind Prefix |
| ---------- | -------------- | ----------------------------- | --------------- |
| Mobile     | < 768px        | Default styles, 2-column grid | (none)          |
| Tablet     | 768px - 1023px | 3-column grid, sidebar        | `md:`           |
| Desktop    | ≥ 1024px       | 4-column grid, sidebar        | `lg:`           |

### Responsive Layout Examples

```vue
<template>
  <!-- Responsive grid -->
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-200">
    <!-- Items -->
  </div>

  <!-- Responsive padding -->
  <div class="px-200 md:px-400 lg:px-700">
    <!-- Content -->
  </div>

  <!-- Responsive text -->
  <h1 class="text-preset-1-mobile md:text-preset-1">Responsive Heading</h1>
</template>
```

## Nuxt UI Component Patterns

### UCard

Media cards use UCard with custom theming:

```vue
<template>
  <UCard
    :ui="{
      background: 'bg-blue-900',
      rounded: 'rounded-lg',
      body: { padding: 'p-0' }
    }"
  >
    <!-- Card content -->
  </UCard>

  <!-- Or use custom div when UCard is too opinionated -->
  <div class="bg-blue-900 rounded-lg overflow-hidden">
    <!-- Custom card content -->
  </div>
</template>
```

### UButton

Nuxt UI buttons with red primary color:

```vue
<template>
  <!-- Primary button (uses red-500) -->
  <UButton
    color="primary"
    size="lg"
    :ui="{ font: 'font-light', rounded: 'rounded-md' }"
  >
    Login to your account
  </UButton>

  <!-- Explicit red color -->
  <UButton color="red" size="md"> Click me </UButton>

  <!-- With loading state -->
  <UButton color="primary" :loading="isSubmitting" block> Submit </UButton>
</template>
```

### UInput

Input fields with custom styling using the `:ui` prop:

```vue
<template>
  <!-- Search input -->
  <UInput
    v-model="searchQuery"
    placeholder="Search..."
    icon="i-heroicons-magnifying-glass"
    size="xl"
    :ui="{
      base: 'bg-transparent border-b border-blue-500 text-white',
      placeholder: 'placeholder-white/50',
      icon: { trailing: { pointer: '' } }
    }"
    variant="none"
  />

  <!-- Form input -->
  <UInput
    v-model="email"
    type="email"
    placeholder="Email address"
    :ui="{
      base: 'bg-blue-900 text-white border-0',
      rounded: 'rounded-md'
    }"
  />
</template>
```

### UForm & UFormGroup

Form components with validation:

```vue
<template>
  <UForm :state="formData" :schema="loginSchema" @submit="handleLogin">
    <UFormGroup
      label="Email"
      name="email"
      :ui="{ label: { base: 'text-white text-preset-5' } }"
    >
      <UInput
        v-model="formData.email"
        type="email"
        :ui="{ base: 'bg-blue-900 text-white' }"
      />
    </UFormGroup>

    <UButton type="submit" color="primary" block class="mt-300">
      Login
    </UButton>
  </UForm>
</template>

<script setup lang="ts">
import { loginSchema } from '~/schemas/auth'

const formData = reactive({
  email: '',
  password: ''
})
</script>
```

### UBadge

Badges for categories or status:

```vue
<template>
  <!-- Primary badge -->
  <UBadge color="red" variant="subtle"> Movie </UBadge>

  <!-- Custom styled badge -->
  <UBadge
    :ui="{
      base: 'text-preset-6-mobile',
      background: 'bg-blue-900'
    }"
  >
    PG
  </UBadge>
</template>
```

### Navigation

- **Mobile (< 768px):** Bottom navigation bar
- **Tablet & Desktop (≥ 768px):** Left sidebar navigation

```vue
<template>
  <nav :class="navClass">
    <!-- Navigation items -->
  </nav>
</template>

<script setup>
const isMobile = ref(false)

const navClass = computed(() => {
  if (isMobile.value) {
    return 'fixed bottom-0 left-0 right-0 bg-blue-900 flex items-center px-4 py-4 z-50'
  }
  return 'fixed left-0 top-0 bottom-0 bg-blue-900 flex flex-col items-center py-8 px-6 z-50 w-24'
})
</script>
```

## Design Tokens Configuration

### CSS Variables (`app/assets/css/main.css`)

**Primary approach:** All design tokens are defined using the `@theme` directive in main.css.

```css
@import 'tailwindcss';
@import '@nuxt/ui';

@theme {
  /* Typography */
  --font-sans: 'Outfit', sans-serif;

  /* Custom Colors */
  --color-blue-950: #10141e;
  --color-blue-900: #161d2f;
  --color-blue-500: #5a698f;
  --color-red-500: #fc4747;

  /* Custom Spacing */
  --spacing-100: 8px;
  --spacing-200: 16px;
  --spacing-300: 24px;
  --spacing-400: 32px;
  --spacing-500: 40px;
  --spacing-700: 56px;
  --spacing-900: 72px;
  --spacing-1000: 80px;
}
```

### Nuxt UI Configuration (`app/app.config.ts`)

Configure color aliases for Nuxt UI components:

```typescript
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'red', // Uses red-500 for UButton, UBadge, etc.
      neutral: 'blue' // Uses blue shades for neutral elements
    }
  }
})
```

### No tailwind.config.ts

⚠️ **Important:** This project does NOT use `tailwind.config.ts` to avoid conflicts with Nuxt UI's internal Tailwind configuration. All customizations are done via CSS variables in the `@theme` directive.

## When to Use What

### Use Nuxt UI Components When:

- ✅ Building forms (UForm, UInput, UFormGroup)
- ✅ Creating buttons (UButton)
- ✅ Displaying cards (UCard)
- ✅ Showing badges or labels (UBadge)
- ✅ Any component Nuxt UI provides

### Use Custom HTML + Tailwind When:

- ✅ Nuxt UI component is too opinionated
- ✅ Creating unique media card layouts
- ✅ Building custom navigation components
- ✅ Grid layouts and containers

### Customization Approach:

```vue
<!-- PREFERRED: Use Nuxt UI with :ui prop -->
<UButton color="primary" :ui="{ rounded: 'rounded-md', font: 'font-light' }">
  Click me
</UButton>

<!-- ACCEPTABLE: Custom when needed -->
<button class="bg-red-500 text-white px-300 py-200 rounded-md font-light">
  Click me
</button>
```

## Accessibility Guidelines

1. **Color Contrast:** Ensure text meets WCAG AA standards:
   - White (#FFFFFF) on Blue 950 (#10141E): ✅ AAA
   - Blue 500 (#5A698F) on Blue 950 (#10141E): ✅ AA
   - Red 500 (#FC4747) on Blue 950 (#10141E): ✅ AA

2. **Focus States:** All interactive elements must have visible focus indicators:

   ```vue
   <button class="focus:outline-none focus:ring-2 focus:ring-red-500">
     Click me
   </button>
   ```

3. **Font Sizes:** Minimum body text size is 13px (Preset 5), ensuring readability

4. **Touch Targets:** Minimum 44x44px for mobile buttons and interactive elements

## Quick Reference

### Common Patterns

```vue
<template>
  <!-- Page container -->
  <div class="min-h-screen bg-blue-950 text-white">
    <!-- Section spacing -->
    <section class="py-700 px-300 md:px-400">
      <!-- Section heading -->
      <h2 class="text-preset-2-mobile md:text-preset-2 mb-500">
        Section Title
      </h2>

      <!-- Media grid -->
      <div
        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-200 md:gap-300"
      >
        <!-- Custom media card -->
        <div class="bg-blue-900 rounded-lg overflow-hidden">
          <div class="p-200">
            <h3 class="text-preset-3-mobile md:text-preset-3">Title</h3>
            <p class="text-preset-5 text-blue-500 mt-100">2024 • Movie • PG</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Form with Nuxt UI components -->
    <section class="max-w-md mx-auto p-300">
      <UForm :state="formData" @submit="onSubmit">
        <UFormGroup label="Email" name="email" class="mb-300">
          <UInput
            v-model="formData.email"
            type="email"
            placeholder="Enter your email"
            :ui="{ base: 'bg-blue-900 text-white' }"
          />
        </UFormGroup>

        <UButton
          type="submit"
          color="primary"
          block
          :ui="{ font: 'font-light' }"
        >
          Submit
        </UButton>
      </UForm>
    </section>
  </div>
</template>
```

## Project Structure

```
├── app/
│   ├── app.config.ts            # Nuxt UI color aliases (primary: 'red')
│   ├── assets/css/
│   │   └── main.css             # @theme directive with all design tokens
│   ├── components/              # Custom components
│   ├── layouts/
│   │   └── default.vue          # Main layout
│   ├── pages/                   # Application pages
│   └── app.vue                  # Root component
├── server/                      # Backend API routes
├── prisma/                      # Database schema
├── DESIGN-SYSTEM.md             # This file
└── nuxt.config.ts               # Nuxt configuration

⚠️ Note: NO tailwind.config.ts file to avoid conflicts with Nuxt UI
```

---

**Last Updated:** February 2, 2026

**Built with:** Nuxt UI + CSS Variables (`@theme` directive)
