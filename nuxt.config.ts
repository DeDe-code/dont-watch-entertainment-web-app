// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui'],

  // Enable Nuxt DevTools for an in-browser developer panel during local dev
  devtools: {
    enabled: true
  },

  // Document-level fallback. Each route page declares its own title and
  // description with `useSeoMeta()`; this title only covers the routes that
  // declare none and never render app.vue (for example the error boundary).
  // How a declared title is composed with the product name lives in app.vue.
  app: {
    head: {
      // The product UI is English-only; declaring the document language is
      // required for assistive technology and a conforming root <html> element.
      htmlAttrs: {
        lang: 'en'
      },
      title: `Don't Watch Entertainment`
    }
  },

  // Register the global CSS file that contains Tailwind layers, design tokens, and custom utilities
  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    databaseUrl: '',
    tmdbAccessToken: '',
    tmdbLanguage: 'en-US',
    tmdbRegion: 'US',
    tmdbRequestTimeoutMs: '5000',
    tmdbCacheTtlSeconds: '300',
    sessionTtlSeconds: '604800',
    authLoginRateLimitMax: '10',
    authLoginRateLimitWindowSeconds: '900',
    authSignupRateLimitMax: '5',
    authSignupRateLimitWindowSeconds: '3600'
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
