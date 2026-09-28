import { describe, expect, it } from 'vitest'
import { getSafeRedirect } from '../../app/utils/auth-redirect'

describe('auth redirect validation', () => {
  it('accepts internal paths and preserves query strings', () => {
    expect(getSafeRedirect('/bookmarked?sort=recent')).toBe(
      '/bookmarked?sort=recent'
    )
  })

  it.each(['https://evil.example', '//evil.example/bookmarked', 'bookmarked'])(
    'rejects unsafe redirect %s',
    (value) => {
      expect(getSafeRedirect(value)).toBe('/')
    }
  )
})
