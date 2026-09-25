import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['server/**/*.ts'],
      exclude: ['server/**/*.d.ts']
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/setup/unit.setup.ts']
        }
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup/integration.setup.ts'],
          fileParallelism: false
        }
      },
      await defineVitestProject({
        test: {
          name: 'frontend',
          environment: 'nuxt',
          include: ['tests/frontend/**/*.test.ts']
        }
      })
    ]
  }
})
