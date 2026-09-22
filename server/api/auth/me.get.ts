import { defineEventHandler } from 'h3'
import { requireUser } from '../../utils/auth-context'
import { withRouteErrors } from '../../utils/route-errors'

export default defineEventHandler((event) =>
  withRouteErrors(event, () => requireUser(event))
)
