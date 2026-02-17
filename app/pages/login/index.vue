<script setup lang="ts">
import type { AuthFormField } from '@nuxt/ui'

definePageMeta({
  layout: 'login'
})

// Define the fields for the authentication form
const fields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email',
    placeholder: 'Email address',
    required: true
  },
  {
    name: 'password',
    type: 'password',
    placeholder: 'Password',
    required: true
  }
]
</script>

<template>
  <div>
    <div class="flex flex-col justify-center items-center mt-spacing-700">
      <div>
        <NuxtLink to="/">
          <UIcon
            name="i-custom-logo"
            class="w-spacing-400 h-[27px] text-red-500"
          />
        </NuxtLink>
      </div>
      <UAuthForm
        title="Login"
        :fields="fields"
        :submit="{ label: 'Login to your account' }"
      >
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
