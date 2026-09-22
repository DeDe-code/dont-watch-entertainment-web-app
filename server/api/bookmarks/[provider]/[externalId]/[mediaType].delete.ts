import { defineEventHandler, getRouterParams } from 'h3'
import { createBookmarkService } from '../../../../services/bookmarks'
import { requireUser } from '../../../../utils/auth-context'
import { bookmarkIdentityPathSchema } from '../../../../utils/contracts'
import { prisma } from '../../../../utils/prisma'
import { withRouteErrors } from '../../../../utils/route-errors'
import { validatePath } from '../../../../utils/validation'

export default defineEventHandler((event) =>
  withRouteErrors(event, async () => {
    const user = await requireUser(event)
    const identity = validatePath(
      bookmarkIdentityPathSchema,
      getRouterParams(event)
    )
    const deleted = await createBookmarkService(prisma).deleteBookmark(
      user.id,
      identity
    )

    return { deleted }
  })
)
