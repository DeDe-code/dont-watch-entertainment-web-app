import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  createSession,
  hashPassword,
  resolveSessionTtlSeconds,
  setSessionCookie
} from '../../utils/auth'
import { prisma } from '../../utils/prisma'
import { signupInputSchema } from '../../../shared/contracts'
import { validateBody } from '../../utils/validation'
import { withRouteErrors } from '../../utils/route-errors'
import type { SafeUser } from '../../../shared/contracts'

export default defineEventHandler((event) =>
  withRouteErrors(event, async () => {
    const input = validateBody(signupInputSchema, await readBody(event))
    const passwordHash = await hashPassword(input.password)
    const sessionTtlSeconds = resolveSessionTtlSeconds(
      useRuntimeConfig(event).sessionTtlSeconds
    )
    const { user, session } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, passwordHash },
        select: {
          id: true,
          email: true,
          createdAt: true,
          updatedAt: true
        }
      })
      const session = await createSession(user.id, sessionTtlSeconds, tx)

      return { user, session }
    })

    setSessionCookie(event, session.token, session.expiresAt)
    setResponseStatus(event, 201)

    return user satisfies SafeUser
  })
)
