import { defineEventHandler, readBody } from 'h3'
import {
  createSession,
  setSessionCookie,
  verifyPassword
} from '../../utils/auth'
import { ApplicationError } from '../../utils/errors'
import { prisma } from '../../utils/prisma'
import { loginInputSchema } from '../../utils/contracts'
import { validateBody } from '../../utils/validation'
import { withRouteErrors } from '../../utils/route-errors'

export default defineEventHandler((event) =>
  withRouteErrors(event, async () => {
    const input = validateBody(loginInputSchema, await readBody(event))
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw ApplicationError.unauthenticated()
    }

    const session = await createSession(
      user.id,
      Number(useRuntimeConfig(event).sessionTtlSeconds)
    )
    setSessionCookie(event, session.token, session.expiresAt)

    const { passwordHash: _passwordHash, ...safeUser } = user
    return safeUser
  })
)
