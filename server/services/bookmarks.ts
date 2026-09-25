import type { Prisma, PrismaClient } from '@prisma/client'
import type { MediaItem, ProviderIdentity } from '../../shared/contracts'

type DbClient = PrismaClient | Prisma.TransactionClient

function referenceWhere(
  identity: ProviderIdentity
): Prisma.MediaReferenceWhereUniqueInput {
  return {
    provider_externalId_mediaType: {
      provider: identity.provider,
      externalId: String(identity.externalId),
      mediaType: identity.mediaType
    }
  }
}

function snapshotData(media: MediaItem): Prisma.MediaReferenceCreateInput {
  return {
    provider: 'TMDB',
    externalId: String(media.externalId),
    mediaType: media.mediaType,
    titleSnapshot: media.title,
    yearSnapshot: media.year,
    posterPathSnapshot: media.posterPath
  }
}

export function createBookmarkService(database: PrismaClient) {
  async function upsertMediaReference(
    media: MediaItem,
    client: DbClient = database
  ) {
    return client.mediaReference.upsert({
      where: {
        provider_externalId_mediaType: {
          provider: 'TMDB',
          externalId: String(media.externalId),
          mediaType: media.mediaType
        }
      },
      create: snapshotData(media),
      update: {}
    })
  }

  async function createBookmarkTransaction(userId: string, media: MediaItem) {
    return database.$transaction(async (transaction) => {
      const reference = await upsertMediaReference(media, transaction)
      const bookmark = await transaction.bookmark.upsert({
        where: {
          userId_mediaReferenceId: {
            userId,
            mediaReferenceId: reference.id
          }
        },
        create: { userId, mediaReferenceId: reference.id },
        update: {}
      })

      return { bookmark, mediaReference: reference }
    })
  }

  async function createBookmark(userId: string, media: MediaItem) {
    try {
      return await createBookmarkTransaction(userId, media)
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        return createBookmarkTransaction(userId, media)
      }

      throw error
    }
  }

  async function deleteBookmark(userId: string, identity: ProviderIdentity) {
    return database.$transaction(async (transaction) => {
      const reference = await transaction.mediaReference.findUnique({
        where: referenceWhere(identity),
        select: { id: true }
      })

      if (!reference) {
        return false
      }

      const deleted = await transaction.bookmark.deleteMany({
        where: { userId, mediaReferenceId: reference.id }
      })

      if (deleted.count > 0) {
        await transaction.mediaReference.deleteMany({
          where: { id: reference.id, bookmarks: { none: {} } }
        })
      }

      return deleted.count > 0
    })
  }

  async function listBookmarks(userId: string, page = 1, pageSize = 20) {
    const [data, totalResults] = await database.$transaction([
      database.bookmark.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { mediaReference: true }
      }),
      database.bookmark.count({ where: { userId } })
    ])

    return {
      data,
      totalResults,
      totalPages: Math.ceil(totalResults / pageSize)
    }
  }

  async function findBookmarkedIdentities(
    userId: string,
    identities: ProviderIdentity[]
  ) {
    if (identities.length === 0) {
      return new Set<string>()
    }

    const bookmarks = await database.bookmark.findMany({
      where: {
        userId,
        mediaReference: {
          OR: identities.map((identity) => ({
            provider: identity.provider,
            externalId: String(identity.externalId),
            mediaType: identity.mediaType
          }))
        }
      },
      select: {
        mediaReference: {
          select: { provider: true, externalId: true, mediaType: true }
        }
      }
    })

    return new Set(
      bookmarks.map(
        ({ mediaReference }) =>
          `${mediaReference.provider}:${mediaReference.externalId}:${mediaReference.mediaType}`
      )
    )
  }

  return {
    upsertMediaReference,
    createBookmark,
    deleteBookmark,
    listBookmarks,
    findBookmarkedIdentities
  }
}
