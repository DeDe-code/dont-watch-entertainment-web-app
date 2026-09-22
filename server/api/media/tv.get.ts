import { defineEventHandler, getQuery } from 'h3'
import { createMediaService } from '../../services/media'
import { withRouteErrors } from '../../utils/route-errors'
import { parseRuntimeConfig } from '../../utils/runtime-config'

export default defineEventHandler((event) =>
  withRouteErrors(event, () =>
    createMediaService(parseRuntimeConfig(useRuntimeConfig(event))).tv(
      getQuery(event)
    )
  )
)
