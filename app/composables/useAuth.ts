import type { LoginInput, SafeUser, SignupInput } from '~/../shared/contracts'

type AuthStatus = 'unknown' | 'authenticated' | 'anonymous'

function isUnauthorized(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('statusCode' in error && error.statusCode === 401) ||
      ('status' in error && error.status === 401))
  )
}

// The in-flight /me request is stashed on the current Nuxt app instance rather
// than a module-level variable so it is naturally scoped per SSR request (each
// request gets its own nuxtApp) while still being shared by every useAuth()
// call within that app/request.
interface NuxtAppWithAuthBootstrap {
  _authBootstrapPromise?: Promise<void>
}

export function useAuth() {
  const userState = useState<SafeUser | null>('auth-user', () => null)
  const statusState = useState<AuthStatus>('auth-status', () => 'unknown')
  const bootstrapState = useState('auth-bootstrap-complete', () => false)
  const requestFetch = useRequestFetch()
  const nuxtApp = useNuxtApp() as unknown as NuxtAppWithAuthBootstrap

  async function bootstrap() {
    if (bootstrapState.value) return
    if (nuxtApp._authBootstrapPromise) return nuxtApp._authBootstrapPromise
    const promise = requestFetch<SafeUser>('/api/auth/me')
      .then((user) => {
        userState.value = user
        statusState.value = 'authenticated'
        bootstrapState.value = true
      })
      .catch((error: unknown) => {
        if (!isUnauthorized(error)) throw error
        userState.value = null
        statusState.value = 'anonymous'
        bootstrapState.value = true
      })
      .finally(() => {
        nuxtApp._authBootstrapPromise = undefined
      })
    nuxtApp._authBootstrapPromise = promise
    return promise
  }

  async function authenticate<T extends LoginInput | SignupInput>(
    url: string,
    input: T
  ) {
    const user = await $fetch<SafeUser>(url, { method: 'POST', body: input })
    userState.value = user
    statusState.value = 'authenticated'
    bootstrapState.value = true
    return user
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    userState.value = null
    statusState.value = 'anonymous'
    bootstrapState.value = true
  }

  return {
    user: userState,
    status: statusState,
    bootstrap,
    login: (input: LoginInput) => authenticate('/api/auth/login', input),
    signup: (input: SignupInput) => authenticate('/api/auth/signup', input),
    logout
  }
}
