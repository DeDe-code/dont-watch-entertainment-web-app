// Integration smoke test (AC-2): verifies the isolated PostgreSQL test
// database is reachable and that reset behavior works, before any feature
// tests depend on it.
import { PrismaClient } from '@prisma/client'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

describe('PostgreSQL database invariants', () => {
  let client: Client
  let prisma: PrismaClient

  beforeAll(async () => {
    client = await connectTestDatabase()
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
  })

  beforeEach(async () => {
    await resetTestDatabase(client)
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await client.end()
  })

  it('rejects duplicate user emails', async () => {
    await prisma.user.create({
      data: { email: 'alpha@example.com', passwordHash: 'hash-1' }
    })

    await expect(
      prisma.user.create({
        data: { email: 'alpha@example.com', passwordHash: 'hash-2' }
      })
    ).rejects.toMatchObject({
      code: 'P2002',
      meta: { target: ['email'] }
    })
  })

  it('rejects duplicate session token hashes', async () => {
    const user = await prisma.user.create({
      data: { email: 'alpha@example.com', passwordHash: 'hash-1' }
    })

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'session-hash-1',
        expiresAt: new Date(Date.now() + 60_000)
      }
    })

    await expect(
      prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: 'session-hash-1',
          expiresAt: new Date(Date.now() + 120_000)
        }
      })
    ).rejects.toMatchObject({
      code: 'P2002',
      meta: { target: ['tokenHash'] }
    })
  })

  it('rejects duplicate media reference provider identities', async () => {
    await prisma.mediaReference.create({
      data: {
        provider: 'tmdb',
        externalId: 'movie-42',
        mediaType: 'movie',
        titleSnapshot: 'The Example Movie',
        yearSnapshot: 2024,
        posterPathSnapshot: '/poster.jpg'
      }
    })

    await expect(
      prisma.mediaReference.create({
        data: {
          provider: 'tmdb',
          externalId: 'movie-42',
          mediaType: 'movie',
          titleSnapshot: 'Duplicate Snapshot',
          yearSnapshot: 2025,
          posterPathSnapshot: '/duplicate.jpg'
        }
      })
    ).rejects.toMatchObject({
      code: 'P2002',
      meta: { target: ['provider', 'externalId', 'mediaType'] }
    })
  })

  it('rejects duplicate bookmarks for the same user and media reference', async () => {
    const user = await prisma.user.create({
      data: { email: 'alpha@example.com', passwordHash: 'hash-1' }
    })
    const mediaReference = await prisma.mediaReference.create({
      data: {
        provider: 'tmdb',
        externalId: 'movie-42',
        mediaType: 'movie',
        titleSnapshot: 'The Example Movie',
        yearSnapshot: 2024,
        posterPathSnapshot: '/poster.jpg'
      }
    })

    await prisma.bookmark.create({
      data: {
        userId: user.id,
        mediaReferenceId: mediaReference.id
      }
    })

    await expect(
      prisma.bookmark.create({
        data: {
          userId: user.id,
          mediaReferenceId: mediaReference.id
        }
      })
    ).rejects.toMatchObject({
      code: 'P2002',
      meta: { target: ['userId', 'mediaReferenceId'] }
    })
  })

  it('cascades user deletion to its sessions and bookmarks', async () => {
    const user = await prisma.user.create({
      data: { email: 'cascade@example.com', passwordHash: 'hash-1' }
    })
    const mediaReference = await prisma.mediaReference.create({
      data: {
        provider: 'tmdb',
        externalId: 'movie-99',
        mediaType: 'movie',
        titleSnapshot: 'Cascade Movie',
        yearSnapshot: 2024
      }
    })

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'session-cascade',
        expiresAt: new Date(Date.now() + 60_000)
      }
    })

    await prisma.bookmark.create({
      data: {
        userId: user.id,
        mediaReferenceId: mediaReference.id
      }
    })

    await prisma.user.delete({ where: { id: user.id } })

    await expect(
      prisma.user.findUnique({ where: { id: user.id } })
    ).resolves.toBeNull()
    await expect(
      prisma.session.findMany({ where: { userId: user.id } })
    ).resolves.toHaveLength(0)
    await expect(
      prisma.bookmark.findMany({ where: { userId: user.id } })
    ).resolves.toHaveLength(0)
    await expect(
      prisma.mediaReference.findUnique({ where: { id: mediaReference.id } })
    ).resolves.not.toBeNull()
  })

  it('does not delete user account data when a media reference is deleted', async () => {
    const user = await prisma.user.create({
      data: { email: 'media-delete@example.com', passwordHash: 'hash-1' }
    })
    const mediaReference = await prisma.mediaReference.create({
      data: {
        provider: 'tmdb',
        externalId: 'movie-77',
        mediaType: 'movie',
        titleSnapshot: 'Unrelated Movie',
        yearSnapshot: 2024
      }
    })

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'session-media-delete',
        expiresAt: new Date(Date.now() + 60_000)
      }
    })

    await prisma.bookmark.create({
      data: {
        userId: user.id,
        mediaReferenceId: mediaReference.id
      }
    })

    await prisma.mediaReference.delete({ where: { id: mediaReference.id } })

    await expect(
      prisma.user.findUnique({ where: { id: user.id } })
    ).resolves.toMatchObject({
      id: user.id,
      email: 'media-delete@example.com'
    })
    await expect(
      prisma.session.findMany({ where: { userId: user.id } })
    ).resolves.toHaveLength(1)
    await expect(
      prisma.bookmark.findMany({ where: { userId: user.id } })
    ).resolves.toHaveLength(0)
  })
})
