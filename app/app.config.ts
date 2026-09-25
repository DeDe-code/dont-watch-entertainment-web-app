// Nuxt UI theme configuration
// Overrides Nuxt UI component defaults to match the app's design system (dark theme, red/blue palette)
export default defineAppConfig({
  ui: {
    // Set the global primary colour to red and neutral palette to blue
    // These values map to Tailwind CSS colour tokens defined in main.css
    colors: {
      primary: 'red',
      neutral: 'blue'
    },

    // UHeader slot overrides: centre the navigation menu items with a flex row
    header: {
      slots: {
        center: 'sm: flex items-center gap-2'
      }
    },

    // UInput base slot override: flatten the input to a bottom-border-only style.
    input: {
      slots: {
        base: [
          // Full width, hide native appearance, dim placeholder and disable states
          'w-full appearance-none placeholder:text-dimmed disabled:cursor-not-allowed disabled:opacity-75',
          // Smooth colour transitions; transparent background; only a bottom border; no border radius
          'transition-colors text-highlighted bg-default border-b-1 rounded-none',
          // Preserve the component's active/error state colors and global focus outline.
          'focus:border-white error:border-red-500'
        ]
      }
    }
  }
})
