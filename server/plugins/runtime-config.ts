import { parseRuntimeConfig } from '../utils/runtime-config'

export default defineNitroPlugin(() => {
  if (import.meta.prerender) {
    return
  }

  parseRuntimeConfig(useRuntimeConfig())
})
