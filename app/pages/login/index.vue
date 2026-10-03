<script setup lang="ts">
import { loginInputSchema } from '~/../shared/contracts'
import { getAuthPageRedirect } from '~/utils/auth-redirect'

definePageMeta({
  layout: 'login'
})

// Login is publicly reachable, so the Open Graph tags mirror the route metadata
// so a shared link previews with the same title and description.
const title = 'Login'
const description = `Log in to your Don't Watch Entertainment account.`
useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})

const route = useRoute()
const router = useRouter()
const { status, bootstrap, login } = useAuth()
const redirect = computed(() => getAuthPageRedirect(route))
const form = reactive({ email: '', password: '' })
const errors = ref<Record<string, string>>({})
const formError = ref('')
const pending = ref(false)

await bootstrap()
if (status.value === 'authenticated') await navigateTo('/', { replace: true })

async function submit() {
  if (pending.value) return
  errors.value = {}
  formError.value = ''
  const result = loginInputSchema.safeParse(form)
  if (!result.success) {
    for (const issue of result.error.issues)
      errors.value[issue.path[0]?.toString() ?? 'form'] = issue.message
    return
  }
  pending.value = true
  try {
    await login(result.data)
    await router.replace(redirect.value)
  } catch {
    formError.value = 'Email or password is incorrect.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <NuxtLink to="/" class="auth-logo" aria-label="Go to home">
      <UIcon name="i-custom-logo" class="auth-logo-icon" aria-hidden="true" />
    </NuxtLink>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <h1>Login</h1>
      <p v-if="formError" class="form-error" role="alert">
        {{ formError }}
      </p>
      <div class="fields">
        <div class="field">
          <label class="sr-only" for="email">Email address</label>
          <input
            id="email"
            v-model="form.email"
            type="email"
            autocomplete="email"
            placeholder="Email address"
            :aria-invalid="!!errors.email"
            :aria-describedby="errors.email ? 'email-error' : undefined"
          />
          <p v-if="errors.email" id="email-error" class="field-error">
            {{ errors.email }}
          </p>
        </div>
        <div class="field">
          <label class="sr-only" for="password">Password</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            placeholder="Password"
            :aria-invalid="!!errors.password"
            :aria-describedby="errors.password ? 'password-error' : undefined"
          />
          <p v-if="errors.password" id="password-error" class="field-error">
            {{ errors.password }}
          </p>
        </div>
      </div>
      <div class="actions">
        <button type="submit" :disabled="pending">Login to your account</button>
        <p class="auth-switch">
          Don't have an account?
          <NuxtLink
            :to="{
              path: '/signup',
              query: route.query.redirect ? { redirect: redirect } : undefined
            }"
            >Sign Up</NuxtLink
          >
        </p>
      </div>
    </form>
  </main>
</template>
