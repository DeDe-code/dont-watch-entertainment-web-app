import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createBookmarkService } from '../../services/bookmarks'
import { createMediaService } from '../../services/media'
import { requireUser } from '../../utils/auth-context'
import { bookmarkCreateInputSchema } from '../../utils/contracts'
import { prisma } from '../../utils/prisma'
import { withRouteErrors } from '../../utils/route-errors'
import { parseRuntimeConfig } from '../../utils/runtime-config'
import { validateBody } from '../../utils/validation'

export default defineEventHandler((event) =>
  withRouteErrors(event, async () => {
    const user = await requireUser(event)
    const identity = validateBody(
      bookmarkCreateInputSchema,
      await readBody(event)
    )
    const media = await createMediaService(
      parseRuntimeConfig(useRuntimeConfig())
    ).resolveBookmarkMedia(identity)
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
      backdropPath: mediaReference.backdropPathSnapshot,
      overview: null,
      contentRating: mediaReference.contentRatingSnapshot,
      isTrending: false,
      isBookmarked: true
    }
  })
)
