import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { getOptionalUser, requireUser } from '../../server/utils/auth-context'
import {
  clearSessionCookie,
  generateSessionToken,
  getSessionCookie,
  hashPassword,
  hashSessionToken,
  resolveSessionTtlSeconds,
  setSessionCookie,
  verifyPassword
} from '../../server/utils/auth'

function createEvent(cookie?: string): H3Event {
  const headers = new Map<string, string | string[]>()

  return {
    node: {
      req: { headers: cookie ? { cookie } : {} },
      res: {
        getHeader: (name: string) => headers.get(name.toLowerCase()),
        setHeader: (name: string, value: string | string[]) => {
          headers.set(name.toLowerCase(), value)
        },
        appendHeader: (name: string, value: string) => {
          const key = name.toLowerCase()
          const current = headers.get(key)
          headers.set(key, current ? [...[].concat(current), value] : value)
        },
        removeHeader: (name: string) => {
          headers.delete(name.toLowerCase())
        }
      }
    }
  } as H3Event
}

describe('authentication primitives', () => {
  it('hashes passwords without allowing the hash to verify as the password', async () => {
    const password = 'Sup3r-Synthetic-Password!'
    const passwordHash = await hashPassword(password)

    expect(passwordHash).not.toBe(password)
    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true)
    await expect(verifyPassword('wrong-password', passwordHash)).resolves.toBe(
      false
    )
  })

  it('generates opaque tokens and stores only one-way token hashes', () => {
    const firstToken = generateSessionToken()
    const secondToken = generateSessionToken()

    expect(firstToken).toMatch(/^[a-f0-9]{64}$/)
    expect(secondToken).toMatch(/^[a-f0-9]{64}$/)
    expect(secondToken).not.toBe(firstToken)
    expect(hashSessionToken(firstToken)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashSessionToken(firstToken)).not.toContain(firstToken)
  })

  it('accepts only positive integer session TTL values from runtime config', () => {
    expect(resolveSessionTtlSeconds('604800')).toBe(604800)
    expect(resolveSessionTtlSeconds(900)).toBe(900)
    expect(() => resolveSessionTtlSeconds('NaN')).toThrow(/sessionTtlSeconds/)
    expect(() => resolveSessionTtlSeconds(0)).toThrow(/sessionTtlSeconds/)
  })

  it('sets and clears an HttpOnly lax session cookie with the application path', () => {
    const token = generateSessionToken()
    const expiresAt = new Date('2026-09-28T00:00:00.000Z')
    const event = createEvent()

    setSessionCookie(event, token, expiresAt)
    expect(getSessionCookie(event)).toBeUndefined()
    expect(event.node.res.getHeader('set-cookie')).toEqual(
      expect.stringContaining('dont-watch-session=')
    )
    expect(event.node.res.getHeader('set-cookie')).toEqual(
      expect.stringContaining('HttpOnly')
    )
    expect(event.node.res.getHeader('set-cookie')).toEqual(
      expect.stringContaining('SameSite=Lax')
    )
    expect(event.node.res.getHeader('set-cookie')).toEqual(
      expect.stringContaining('Path=/')
    )

    clearSessionCookie(event)
    expect(event.node.res.getHeader('set-cookie')).toEqual(
      expect.stringContaining('Max-Age=0')
    )
  })

  it('allows anonymous optional auth but rejects required auth', async () => {
    const event = createEvent()

    await expect(getOptionalUser(event)).resolves.toBeNull()
    await expect(requireUser(event)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED'
    })
  })
})
