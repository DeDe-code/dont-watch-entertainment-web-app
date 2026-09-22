import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createBookmarkService } from '../../services/bookmarks'
import { requireUser } from '../../utils/auth-context'
import { bookmarkCreateInputSchema } from '../../utils/contracts'
import { prisma } from '../../utils/prisma'
import { withRouteErrors } from '../../utils/route-errors'
import { validateBody } from '../../utils/validation'

export default defineEventHandler((event) =>
  withRouteErrors(event, async () => {
    const user = await requireUser(event)
    const media = validateBody(bookmarkCreateInputSchema, await readBody(event))
    const { mediaReference } = await createBookmarkService(
      prisma
    ).createBookmark(user.id, media)

    setResponseStatus(event, 201)
    return {
      externalId: Number(mediaReference.externalId),
      mediaType: mediaReference.mediaType,
      title: mediaReference.titleSnapshot,
      year: mediaReference.yearSnapshot,
      posterPath: mediaReference.posterPathSnapshot,
      backdropPath: null,
      overview: null,
      contentRating: null,
      isTrending: false,
      isBookmarked: true
    }
  })
)
