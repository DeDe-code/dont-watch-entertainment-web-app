import { defineEventHandler, getRouterParam } from 'h3'
import { createMediaService } from '../../../services/media'
import { withRouteErrors } from '../../../utils/route-errors'
import { parseRuntimeConfig } from '../../../utils/runtime-config'
import { getOptionalUser } from '../../../utils/auth-context'

export default defineEventHandler((event) =>
  withRouteErrors(event, async () => {
    const user = await getOptionalUser(event)
    return createMediaService(
      parseRuntimeConfig(useRuntimeConfig(event))
    ).details(
      {
        type: getRouterParam(event, 'type'),
        externalId: getRouterParam(event, 'externalId')
      },
      user?.id
    )
  })
)
