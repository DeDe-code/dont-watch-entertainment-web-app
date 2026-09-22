import { defineEventHandler, setResponseStatus } from 'h3'
import {
  clearSessionCookie,
  getSessionCookie,
  revokeSession
} from '../../utils/auth'
import { withRouteErrors } from '../../utils/route-errors'

export default defineEventHandler((event) =>
  withRouteErrors(event, async () => {
    await revokeSession(getSessionCookie(event))
    clearSessionCookie(event)
    setResponseStatus(event, 204)
  })
)
