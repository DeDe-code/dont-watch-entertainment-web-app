// Nuxt 3 application configuration
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Register Nuxt modules: ESLint for linting, Nuxt UI for the component library, Pinia for state management
  modules: ['@nuxt/eslint', '@nuxt/ui', '@pinia/nuxt'],

  // Enable Nuxt DevTools for an in-browser developer panel during local dev
  devtools: {
    enabled: true
  },

  // Register the global CSS file that contains Tailwind layers, design tokens, and custom utilities
  css: ['~/assets/css/main.css'],

  // Pre-render the home page at build time for faster initial load
  routeRules: {
    '/': { prerender: true }
  },

  // Minimum Nuxt compatibility date; keeps future breaking changes opt-in
  compatibilityDate: '2025-01-15',

  // ESLint stylistic rules applied on top of the default Nuxt ESLint config
  eslint: {
    config: {
      stylistic: {
        // Disallow trailing commas in function/array/object literals
        commaDangle: 'never',
        // Enforce the "one true brace style" for blocks
        braceStyle: '1tbs'
      }
    }
  },

  // Register custom SVG icon collections so they can be referenced via i-custom-* class names
  icon: {
    customCollections: [
      {
        // Prefix used in templates: e.g. i-custom-logo, i-custom-icon-nav-home
        prefix: 'custom',
        // Directory containing the local SVG icons
        dir: './app/assets/icons'
      }
    ]
  }
})
