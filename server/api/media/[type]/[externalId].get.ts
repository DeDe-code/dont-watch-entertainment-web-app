import { defineEventHandler, getRouterParam } from 'h3'
import { createMediaService } from '../../../services/media'
import { withRouteErrors } from '../../../utils/route-errors'
import { parseRuntimeConfig } from '../../../utils/runtime-config'

export default defineEventHandler((event) =>
  withRouteErrors(event, () =>
    createMediaService(parseRuntimeConfig(useRuntimeConfig(event))).details({
      type: getRouterParam(event, 'type'),
      externalId: getRouterParam(event, 'externalId')
    })
  )
)
