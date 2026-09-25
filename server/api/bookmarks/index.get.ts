import { defineEventHandler, getQuery } from 'h3'
import { createBookmarkService } from '../../services/bookmarks'
import { requireUser } from '../../utils/auth-context'
import { bookmarkListQuerySchema } from '../../utils/contracts'
import { prisma } from '../../utils/prisma'
import { withRouteErrors } from '../../utils/route-errors'
import { validateQuery } from '../../utils/validation'

export default defineEventHandler((event) =>
  withRouteErrors(event, async () => {
    const user = await requireUser(event)
    const { page } = validateQuery(bookmarkListQuerySchema, getQuery(event))
    const result = await createBookmarkService(prisma).listBookmarks(
      user.id,
      page
    )

    return {
      data: result.data.map(({ mediaReference }) => ({
        externalId: Number(mediaReference.externalId),
        mediaType: mediaReference.mediaType,
        title: mediaReference.titleSnapshot,
        year: mediaReference.yearSnapshot,
        posterPath: mediaReference.posterPathSnapshot,
        backdropPath: mediaReference.backdropPathSnapshot,
        overview: null,
        contentRating: mediaReference.contentRatingSnapshot,
        isTrending: false,
        isBookmarked: true
      })),
      meta: {
        page,
        totalPages: result.totalPages,
        totalResults: result.totalResults
      }
    }
  })
)
