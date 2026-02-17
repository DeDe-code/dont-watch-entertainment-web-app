export default defineAppConfig({
  ui: {
    colors: {
      primary: 'red',
      neutral: 'blue'
    },
    header: {
      slots: {
        center: 'sm: flex items-center gap-2'
      }
    },
    // This targets the actual <input> element
    input: {
      slots: {
        base: [
          'w-full appearance-none placeholder:text-dimmed disabled:cursor-not-allowed disabled:opacity-75',
          'transition-colors text-highlighted bg-default border-b-1 rounded-none',
          'focus:border-red-500 error:border-red-500',
          '!ring-0 focus:!ring-0 focus-visible:!ring-0 focus-within:!ring-0'
        ]
      }
    },
    // This targets the FormGroup wrapper around inputs
    authForm: {
      slots: {
        root: 'w-full mx-auto max-w-login-card-mobile md:max-w-login-card-tablet mt-spacing-700 px-spacing-300 pt-[29px] pb-[29px] bg-blue-900 rounded-lg',
        header: 'mb-0',
        title: 'mb-spacing-500 text-left text-preset-1 font-normal',
        form: [
          'flex flex-col',
          '[&>*:first-child]:mb-0',
          '[&>*:first-child_input]:mb-spacing-300',
          '[&_input]:border-blue-500',
          '[&>button]:w-[279px]',
          '[&>button]:h-[48px]',
          '[&>button]:mx-auto',
          '[&>button]:mt-spacing-500',
          '[&>button]:text-white',
          '[&>button]:bg-red-500'
        ],
        footer: ['m-0', '[&_a]:text-red-500', '[&_a:hover]:underline']
      }
    }
  }
})
