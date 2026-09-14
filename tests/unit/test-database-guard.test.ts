// Unit coverage for the test-database safety guard (AC-3): destructive
// integration test setup must never run against a non-test database.
import { describe, expect, it } from 'vitest'
import {
  assertTestDatabaseUrl,
  UnsafeTestDatabaseError
} from '../setup/test-database'

describe('assertTestDatabaseUrl', () => {
  it('rejects a missing connection string', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(
      UnsafeTestDatabaseError
    )
  })

  it('rejects a non-postgres connection string', () => {
    expect(() => assertTestDatabaseUrl('file:./dev.db')).toThrow(
      UnsafeTestDatabaseError
    )
  })

  it('rejects a postgres database not identifiable as a test database', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgresql://user:pass@prod-db.example.com:5432/app_production'
      )
    ).toThrow(UnsafeTestDatabaseError)
  })

  it('accepts a postgres connection string naming a test database', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgresql://postgres:postgres@localhost:5432/app_test'
      )
    ).not.toThrow()
  })

  it('rejects a database name not containing "test" even when the host does', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgresql://postgres:postgres@test-db.internal:5432/app'
      )
    ).toThrow(UnsafeTestDatabaseError)
  })
})
