import { describe, expect, it } from 'vitest'
import { parseRuntimeConfig } from '../../server/utils/runtime-config'

const validConfig = {
  databaseUrl: 'postgresql://postgres:postgres@localhost:5432/app_dev',
  tmdbAccessToken: 'test-token'
}

describe('runtime configuration', () => {
  it('applies safe defaults for non-secret options', () => {
    expect(parseRuntimeConfig(validConfig)).toMatchObject({
      tmdbLanguage: 'en-US',
      tmdbRegion: 'US',
      tmdbRequestTimeoutMs: 5000,
      tmdbCacheTtlSeconds: 300,
      sessionTtlSeconds: 604800
    })
  })

  it('rejects missing required values without including secret values', () => {
    expect(() => parseRuntimeConfig({})).toThrow(/databaseUrl|tmdbAccessToken/)
    expect(() =>
      parseRuntimeConfig({ ...validConfig, tmdbAccessToken: '' })
    ).toThrow('NUXT_TMDB_ACCESS_TOKEN is required')
    expect(() =>
      parseRuntimeConfig({ ...validConfig, tmdbAccessToken: 'real-secret' })
    ).not.toThrow('real-secret')
  })

  it.each([
    ['tmdbRequestTimeoutMs', 99],
    ['tmdbRequestTimeoutMs', 30001],
    ['tmdbCacheTtlSeconds', -1],
    ['sessionTtlSeconds', 299]
  ])('rejects invalid numeric value for %s', (key, value) => {
    expect(() => parseRuntimeConfig({ ...validConfig, [key]: value })).toThrow()
  })

  it('rejects invalid locale and region values', () => {
    expect(() =>
      parseRuntimeConfig({ ...validConfig, tmdbLanguage: 'english' })
    ).toThrow()
    expect(() =>
      parseRuntimeConfig({ ...validConfig, tmdbRegion: 'usa' })
    ).toThrow()
  })

  it('accepts an explicit zero cache TTL to disable caching', () => {
    expect(
      parseRuntimeConfig({ ...validConfig, tmdbCacheTtlSeconds: 0 })
        .tmdbCacheTtlSeconds
    ).toBe(0)
  })
})
