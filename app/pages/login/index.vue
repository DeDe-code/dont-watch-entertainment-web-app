<!--
  pages/login/index.vue — Login page.
  Uses the minimal "login" layout (no header) and renders a Nuxt UI
  UAuthForm with email/password fields. On successful submission the
  form will call POST /api/auth/login and redirect to the home page.
-->
<script setup lang="ts">
// Import the AuthFormField type to ensure field definitions are type-safe
import type { AuthFormField } from '@nuxt/ui'

// Use the login layout which omits the main navigation header
definePageMeta({
  layout: 'login'
})

// Define the form fields rendered inside UAuthForm
const fields: AuthFormField[] = [
  {
    // Email address input — uses the browser's built-in email validation
    name: 'email',
    type: 'email',
    placeholder: 'Email address',
    required: true
  },
  {
    // Password input — characters are masked by the browser
    name: 'password',
    type: 'password',
    placeholder: 'Password',
    required: true
  }
]
</script>

<template>
  <!-- Page root -->
  <div>
    <!-- Centred column: logo on top, auth form below -->
    <div class="flex flex-col justify-center items-center mt-700">
      <!-- App logo: clicking it navigates back to the home page -->
      <div>
        <NuxtLink to="/">
          <UIcon name="i-custom-logo" class="w-400 h-[27px] text-red-500" />
        </NuxtLink>
      </div>

      <!-- UAuthForm: Nuxt UI compound component that renders the card, fields, and submit button -->
      <UAuthForm
        title="Login"
        :fields="fields"
        :submit="{ label: 'Login to your account' }"
      >
        <!-- Footer slot: link to the signup page for users without an account -->
        <template #footer>
          <div class="text-center text-sm text-white">
            Don't have an account?
            <NuxtLink to="/signup" class="text-blue-600 hover:underline">
              Sign up
            </NuxtLink>
          </div>
        </template>
      </UAuthForm>
    </div>
  </div>
</template>
