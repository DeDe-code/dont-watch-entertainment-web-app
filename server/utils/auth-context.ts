import type { H3Event } from 'h3'
import { ApplicationError } from './errors'
import { clearSessionCookie, getSessionCookie, getSessionUser } from './auth'
import type { SafeUser } from '../../shared/contracts'

export async function getOptionalUser(
  event: H3Event
): Promise<SafeUser | null> {
  if (!event.node?.req?.headers) {
    return null
  }

  const token = getSessionCookie(event)
  const user = await getSessionUser(token)

  if (!user && token) {
    clearSessionCookie(event)
  }

  return user
}

export async function requireUser(event: H3Event): Promise<SafeUser> {
  const user = await getOptionalUser(event)

  if (!user) {
    throw ApplicationError.unauthenticated()
  }

  return user
}
