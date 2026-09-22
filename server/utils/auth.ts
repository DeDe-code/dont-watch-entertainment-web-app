import bcrypt from 'bcrypt'
import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { deleteCookie, getCookie, setCookie } from 'h3'
import { prisma } from './prisma'

export const SESSION_COOKIE_NAME = 'dont-watch-session'
export const DEFAULT_SESSION_TTL_SECONDS = 604800
export const PASSWORD_HASH_ROUNDS = 12

export type SafeUser = {
  id: string
  email: string
  createdAt: Date
  updatedAt: Date
}

export type SessionCookieOptions = {
  expires?: Date
}

function cookieOptions(options: SessionCookieOptions = {}) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    ...options
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS)
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash)
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function setSessionCookie(
  event: H3Event,
  token: string,
  expiresAt: Date
): void {
  setCookie(
    event,
    SESSION_COOKIE_NAME,
    token,
    cookieOptions({ expires: expiresAt })
  )
}

export function getSessionCookie(event: H3Event): string | undefined {
  return getCookie(event, SESSION_COOKIE_NAME)
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE_NAME, cookieOptions())
}

export function resolveSessionTtlSeconds(value: unknown): number {
  const ttlSeconds =
    typeof value === 'number' ? value : Number.parseInt(String(value), 10)

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('Invalid runtime configuration: sessionTtlSeconds')
  }

  return ttlSeconds
}

export async function createSession(
  userId: string,
  ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
  db: Pick<typeof prisma, 'session'> = prisma
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)

  await db.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt
    }
  })

  return { token, expiresAt }
}

export async function getSessionUser(
  token: string | undefined
): Promise<SafeUser | null> {
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return null
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  })

  if (!session || session.expiresAt <= new Date()) {
    return null
  }

  return session.user
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return
  }

  await prisma.session.deleteMany({
    where: { tokenHash: hashSessionToken(token) }
  })
}

export async function cleanupExpiredSessions(
  now = new Date()
): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lte: now } }
  })

  return result.count
}
