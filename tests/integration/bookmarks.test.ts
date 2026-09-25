import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createBookmarkService } from '../../server/services/bookmarks'
import { prisma } from '../../server/utils/prisma'
import {
  connectTestDatabase,
  resetTestDatabase
} from '../setup/database-client'
import { createUserInput } from '../factories/user.factory'

const service = createBookmarkService(prisma)
const media = {
  externalId: 101,
  mediaType: 'MOVIE' as const,
  title: 'Snapshot Movie',
  year: 2024,
  posterPath: '/snapshot.jpg',
  backdropPath: '/snapshot-backdrop.jpg',
  overview: null,
  contentRating: 'PG-13',
  isTrending: false,
  isBookmarked: false
}
const identity = {
  provider: 'TMDB' as const,
  externalId: media.externalId,
  mediaType: media.mediaType
}

describe('bookmark persistence (TASK-BE-011)', () => {
  let databaseConnection: Awaited<ReturnType<typeof connectTestDatabase>>

  beforeAll(async () => {
    databaseConnection = await connectTestDatabase()
  })

  beforeEach(async () => {
    await resetTestDatabase(databaseConnection)
  })

  afterAll(async () => {
    await databaseConnection.end()
    await prisma.$disconnect()
  })

  async function createUser() {
    const input = createUserInput()

    return prisma.user.create({
      data: {
        email: input.email,
        passwordHash: randomUUID()
      }
    })
  }

  it('creates one reference and one bookmark, including concurrent duplicates (AC-1, AC-2)', async () => {
    const user = await createUser()
    const results = await Promise.all(
      Array.from({ length: 4 }, () => service.createBookmark(user.id, media))
    )

    expect(new Set(results.map(({ bookmark }) => bookmark.id)).size).toBe(1)
    await expect(prisma.mediaReference.count()).resolves.toBe(1)
    await expect(prisma.bookmark.count()).resolves.toBe(1)
  })

  it('stores trusted snapshots, refreshes them on re-bookmark, and persists all snapshot fields', async () => {
    const user = await createUser()
    const first = await service.createBookmark(user.id, media)

    expect(first.mediaReference).toMatchObject({
      titleSnapshot: 'Snapshot Movie',
      posterPathSnapshot: '/snapshot.jpg',
      backdropPathSnapshot: '/snapshot-backdrop.jpg',
      contentRatingSnapshot: 'PG-13'
    })

    const refreshed = await service.createBookmark(user.id, {
      ...media,
      title: 'Fake title',
      posterPath: '/fake-poster.jpg',
      backdropPath: '/fake-backdrop.jpg',
      contentRating: 'FAKE'
    })

    expect(refreshed.bookmark.id).toBe(first.bookmark.id)
    await expect(
      prisma.mediaReference.findUniqueOrThrow({
        where: { id: first.mediaReference.id }
      })
    ).resolves.toMatchObject({
      titleSnapshot: 'Fake title',
      posterPathSnapshot: '/fake-poster.jpg',
      backdropPathSnapshot: '/fake-backdrop.jpg',
      contentRatingSnapshot: 'FAKE'
    })
  })

  it('allows independent owners and enforces ownership on delete and list (AC-3, AC-4)', async () => {
    const firstUser = await createUser()
    const secondUser = await createUser()
    await service.createBookmark(firstUser.id, media)
    await service.createBookmark(secondUser.id, media)

    await expect(service.deleteBookmark(firstUser.id, identity)).resolves.toBe(
      true
    )
    await expect(service.listBookmarks(firstUser.id)).resolves.toMatchObject({
      data: []
    })
    await expect(service.listBookmarks(secondUser.id)).resolves.toMatchObject({
      data: [{ userId: secondUser.id }]
    })
    await expect(service.deleteBookmark(firstUser.id, identity)).resolves.toBe(
      false
    )
  })

  it('lists persisted snapshots and resolves batch existence in one ORM query (AC-5, AC-6)', async () => {
    const user = await createUser()
    await service.createBookmark(user.id, media)

    const listed = await service.listBookmarks(user.id)
    expect(listed.data[0]?.mediaReference).toMatchObject({
      titleSnapshot: media.title,
      yearSnapshot: media.year,
      posterPathSnapshot: media.posterPath
    })

    const identities = [
      identity,
      { provider: 'TMDB' as const, externalId: 202, mediaType: 'TV' as const }
    ]
    const matches = await service.findBookmarkedIdentities(user.id, identities)
    expect(matches).toEqual(new Set(['TMDB:101:MOVIE']))
  })

  it('cleans an unused reference but retains one shared by another bookmark (AC-7)', async () => {
    const firstUser = await createUser()
    const secondUser = await createUser()
    await service.createBookmark(firstUser.id, media)
    await service.createBookmark(secondUser.id, media)

    await service.deleteBookmark(firstUser.id, identity)
    await expect(prisma.mediaReference.count()).resolves.toBe(1)

    await service.deleteBookmark(secondUser.id, identity)
    await expect(prisma.mediaReference.count()).resolves.toBe(0)
  })
})
