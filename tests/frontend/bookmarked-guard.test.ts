import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import authMiddleware from '../../app/middleware/auth'

const { bootstrapMock, navigateToMock, auth } = vi.hoisted(() => ({
  bootstrapMock: vi.fn(),
  navigateToMock: vi.fn((to: unknown) => to),
  auth: { status: 'unknown' as string }
}))

mockNuxtImport('useAuth', () => () => ({
  status: {
    get value() {
      return auth.status
    }
  },
  bootstrap: bootstrapMock
}))
mockNuxtImport('navigateTo', () => navigateToMock)

type RouteTarget = Parameters<typeof authMiddleware>[0]

function guard(fullPath: string) {
  return authMiddleware({ fullPath } as unknown as RouteTarget)
}

describe('bookmarked route guard', () => {
  beforeEach(() => {
    bootstrapMock.mockReset()
    bootstrapMock.mockResolvedValue(undefined)
    navigateToMock.mockClear()
    auth.status = 'unknown'
  })

  it('bootstraps auth before deciding', async () => {
    bootstrapMock.mockImplementation(() => {
      auth.status = 'authenticated'
    })
    const result = await guard('/bookmarked')

    expect(bootstrapMock).toHaveBeenCalledTimes(1)
    expect(result).toBeUndefined()
  })

  it('redirects anonymous visitors to login with a safe return path', async () => {
    auth.status = 'anonymous'
    const result = await guard('/bookmarked')

    expect(result).toEqual({
      path: '/login',
      query: { redirect: '/bookmarked' }
    })
  })

  it('preserves the return path query string', async () => {
    auth.status = 'anonymous'
    const result = await guard('/bookmarked?sort=recent')

    expect(result).toEqual({
      path: '/login',
      query: { redirect: '/bookmarked?sort=recent' }
    })
  })

  it('allows authenticated users through', async () => {
    auth.status = 'authenticated'
    const result = await guard('/bookmarked')

    expect(result).toBeUndefined()
    expect(navigateToMock).not.toHaveBeenCalled()
  })
})
