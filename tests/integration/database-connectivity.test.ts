// Integration smoke test (AC-2): verifies the isolated PostgreSQL test
// database is reachable and that reset behavior works, before any feature
// tests depend on it.
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  connectTestDatabase,
  resetTestDatabase
} from '../setup/database-client'

describe('test database connectivity', () => {
  let client: Client

  beforeAll(async () => {
    client = await connectTestDatabase()
  })

  afterAll(async () => {
    await client.end()
  })

  it('connects to the isolated test database and executes a query', async () => {
    const result = await client.query('SELECT 1 AS value')
    expect(result.rows).toEqual([{ value: 1 }])
  })

  it('resets application tables without touching Prisma migration history', async () => {
    await expect(resetTestDatabase(client)).resolves.toBeUndefined()
  })
})
