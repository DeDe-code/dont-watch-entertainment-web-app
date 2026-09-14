// Builds synthetic signup/login input for tests. Centralizing this avoids
// duplicating email/password conventions across future auth test suites.
import { randomUUID } from 'node:crypto'

export interface UserInput {
  email: string
  password: string
}

/**
 * Returns synthetic, unique user credentials. Every call produces a unique
 * email so tests can run repeatedly without colliding on uniqueness
 * constraints.
 */
export function createUserInput(overrides: Partial<UserInput> = {}): UserInput {
  return {
    email: `test-user-${randomUUID()}@example.test`,
    password: 'Sup3r-Synthetic-Password!',
    ...overrides
  }
}
