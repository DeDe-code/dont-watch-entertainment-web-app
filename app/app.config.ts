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

    // UInput base slot override: flatten the input to a bottom-border-only style
    // matching the design system (no box, no ring, red focus indicator)
    input: {
      slots: {
        base: [
          // Full width, hide native appearance, dim placeholder and disable states
          'w-full appearance-none placeholder:text-dimmed disabled:cursor-not-allowed disabled:opacity-75',
          // Smooth colour transitions; transparent background; only a bottom border; no border radius
          'transition-colors text-highlighted bg-default border-b-1 rounded-none',
          // Show red bottom border when focused or when the parent form has validation errors
          'focus:border-red-500 error:border-red-500',
          // Remove all focus rings to keep the design clean
          '!ring-0 focus:!ring-0 focus-visible:!ring-0 focus-within:!ring-0'
        ]
      }
    },

    // UAuthForm compound-component overrides used on the login and signup pages
    authForm: {
      slots: {
        // Card container: centred, max-width responsive, dark bg, rounded corners
        root: 'w-full mx-auto max-w-login-card-mobile md:max-w-login-card-tablet mt-spacing-700 px-spacing-300 pt-[29px] pb-[29px] bg-blue-900 rounded-lg',
        // Remove default bottom margin from the header section
        header: 'mb-0',
        // Title: large preset-1 heading, left-aligned, normal font weight
        title: 'mb-spacing-500 text-left text-preset-1 font-normal',
        // Form layout: vertical stack; custom spacing between inputs; red submit button
        form: [
          'flex flex-col',
          // Remove bottom margin from the first field wrapper
          '[&>*:first-child]:mb-0',
          // Add spacing below the first input element
          '[&>*:first-child_input]:mb-spacing-300',
          // Color all input borders with the muted blue shade
          '[&_input]:border-blue-500',
          // Style the submit button: fixed width, height, centred, white text, red background
          '[&>button]:w-[279px]',
          '[&>button]:h-[48px]',
          '[&>button]:mx-auto',
          '[&>button]:mt-spacing-500',
          '[&>button]:text-white',
          '[&>button]:bg-red-500'
        ],
        // Footer: remove margin; style links in red with underline on hover
        footer: ['m-0', '[&_a]:text-red-500', '[&_a:hover]:underline']
      }
    }
  }
})
