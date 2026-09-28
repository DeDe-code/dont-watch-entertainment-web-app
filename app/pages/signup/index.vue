<script setup lang="ts">
import { signupInputSchema } from '~/../shared/contracts'
import { getAuthPageRedirect } from '~/utils/auth-redirect'

definePageMeta({ layout: 'login' })
const route = useRoute()
const router = useRouter()
const { status, bootstrap, signup } = useAuth()
const redirect = computed(() => getAuthPageRedirect(route))
const form = reactive({ email: '', password: '', passwordConfirmation: '' })
const errors = ref<Record<string, string>>({})
const formError = ref('')
const pending = ref(false)

await bootstrap()
if (status.value === 'authenticated') await navigateTo('/', { replace: true })

async function submit() {
  if (pending.value) return
  errors.value = {}
  formError.value = ''
  const result = signupInputSchema.safeParse(form)
  if (!result.success) {
    for (const issue of result.error.issues)
      errors.value[issue.path[0]?.toString() ?? 'form'] = issue.message
    return
  }
  pending.value = true
  try {
    await signup(result.data)
    await router.replace(redirect.value)
  } catch (error: unknown) {
    const code = (error as { data?: { code?: string } }).data?.code
    formError.value =
      code === 'CONFLICT'
        ? 'An account with this email already exists.'
        : 'Unable to create your account.'
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
    <form
      class="auth-form auth-form--signup"
      novalidate
      @submit.prevent="submit"
    >
      <h1>Sign Up</h1>
      <p v-if="formError" class="form-error" role="alert">
        {{ formError }}
      </p>
      <div class="fields">
        <div class="field">
          <label class="sr-only" for="signup-email">Email address</label>
          <input
            id="signup-email"
            v-model="form.email"
            type="email"
            autocomplete="email"
            placeholder="Email address"
            :aria-invalid="!!errors.email"
            :aria-describedby="errors.email ? 'signup-email-error' : undefined"
          />
          <p v-if="errors.email" id="signup-email-error" class="field-error">
            {{ errors.email }}
          </p>
        </div>
        <div class="field">
          <label class="sr-only" for="signup-password">Password</label>
          <input
            id="signup-password"
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            placeholder="Password"
            :aria-invalid="!!errors.password"
            :aria-describedby="
              errors.password ? 'signup-password-error' : undefined
            "
          />
          <p
            v-if="errors.password"
            id="signup-password-error"
            class="field-error"
          >
            {{ errors.password }}
          </p>
        </div>
        <div class="field">
          <label class="sr-only" for="password-confirmation"
            >Repeat password</label
          >
          <input
            id="password-confirmation"
            v-model="form.passwordConfirmation"
            type="password"
            autocomplete="new-password"
            placeholder="Repeat password"
            :aria-invalid="!!errors.passwordConfirmation"
            :aria-describedby="
              errors.passwordConfirmation
                ? 'password-confirmation-error'
                : undefined
            "
          />
          <p
            v-if="errors.passwordConfirmation"
            id="password-confirmation-error"
            class="field-error"
          >
            {{ errors.passwordConfirmation }}
          </p>
        </div>
      </div>
      <div class="actions">
        <button type="submit" :disabled="pending">Create an account</button>
        <p class="auth-switch">
          Already have an account?
          <NuxtLink
            :to="{
              path: '/login',
              query: route.query.redirect ? { redirect: redirect } : undefined
            }"
            >Login</NuxtLink
          >
        </p>
      </div>
    </form>
  </main>
</template>
