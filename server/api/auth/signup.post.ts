import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  createSession,
  hashPassword,
  setSessionCookie,
  type SafeUser
} from '../../utils/auth'
import { prisma } from '../../utils/prisma'
import { signupInputSchema } from '../../utils/contracts'
import { validateBody } from '../../utils/validation'
import { withRouteErrors } from '../../utils/route-errors'

export default defineEventHandler((event) =>
  withRouteErrors(event, async () => {
    const input = validateBody(signupInputSchema, await readBody(event))
    const passwordHash = await hashPassword(input.password)
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
      const session = await createSession(
        user.id,
        Number(useRuntimeConfig(event).sessionTtlSeconds),
        tx
      )

      return { user, session }
    })

    setSessionCookie(event, session.token, session.expiresAt)
    setResponseStatus(event, 201)

    return user satisfies SafeUser
  })
)
