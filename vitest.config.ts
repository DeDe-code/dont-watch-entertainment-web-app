// Vitest configuration for the backend test suite.
//
// Two projects are defined:
// - "unit": fast, network-isolated tests for pure logic (no database).
// - "integration": tests that talk to an isolated PostgreSQL test database
//   and may exercise Nitro server utilities end to end.
//
// `npm test` (vitest run) executes both projects.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Code coverage of the server implementation only; app/UI coverage is
    // out of scope for the backend suite.
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
          // Integration tests share one database connection/state; running
          // test files in parallel would race on shared table resets.
          fileParallelism: false
        }
      }
    ]
  }
})
