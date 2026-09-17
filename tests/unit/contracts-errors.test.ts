import { describe, expect, it } from 'vitest'
import {
  loginInputSchema,
  mediaItemSchema,
  mediaPathSchema,
  mediaQuerySchema,
  paginationMetaSchema,
  providerIdentitySchema,
  signupInputSchema
} from '../../server/utils/contracts'
import {
  ApplicationError,
  ProviderError,
  toApplicationError,
  toNitroError
} from '../../server/utils/errors'
import {
  validateBody,
  validatePath,
  validateQuery
} from '../../server/utils/validation'

const mediaItem = {
  externalId: 603692,
  mediaType: 'MOVIE' as const,
  title: 'Sample Feature Film',
  year: 2023,
  posterPath: '/sample-poster.jpg',
  backdropPath: null,
  overview: 'Synthetic overview',
  contentRating: null,
  isTrending: false,
  isBookmarked: false
}

describe('shared contracts', () => {
  it('validates the normalized media item and pagination contracts', () => {
    expect(mediaItemSchema.parse(mediaItem)).toEqual(mediaItem)
    expect(
      paginationMetaSchema.parse({ page: 1, totalPages: 2, totalResults: 20 })
    ).toEqual({ page: 1, totalPages: 2, totalResults: 20 })
  })

  it('rejects unsupported media and provider identities', () => {
    expect(
      mediaItemSchema.safeParse({ ...mediaItem, mediaType: 'BOOK' }).success
    ).toBe(false)
    expect(
      providerIdentitySchema.safeParse({
        provider: 'OTHER',
        externalId: 1,
        mediaType: 'MOVIE'
      }).success
    ).toBe(false)
  })

  it('normalizes email and accepts valid authentication input', () => {
    expect(
      loginInputSchema.parse({
        email: ' User@Example.COM ',
        password: 'password'
      })
    ).toEqual({
      email: 'user@example.com',
      password: 'password'
    })
    expect(
      signupInputSchema.safeParse({
        email: 'user@example.com',
        password: 'password',
        passwordConfirmation: 'different'
      }).success
    ).toBe(false)
  })
})

describe('request validation', () => {
  it('returns deterministic invalid-input errors for path, query, and body', () => {
    expect(() =>
      validatePath(mediaPathSchema, { type: 'book', externalId: '0' })
    ).toThrowError(ApplicationError)
    expect(() =>
      validateQuery(mediaQuerySchema, { search: '   ' })
    ).toThrowError(ApplicationError)
    expect(() =>
      validateBody(loginInputSchema, { email: 'invalid', password: 'short' })
    ).toThrowError(ApplicationError)

    const error = toNitroError(
      (() => {
        try {
          validateBody(loginInputSchema, {
            email: 'invalid',
            password: 'short'
          })
        } catch (caught) {
          return caught
        }
        return undefined
      })()
    )
    expect(error.statusCode).toBe(400)
    expect(error.data).toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('application errors', () => {
  it.each([
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['PROVIDER_UNAVAILABLE', 502]
  ] as const)('maps %s to HTTP %i', (code, statusCode) => {
    const error = toNitroError(new ApplicationError(code))
    expect(error.statusCode).toBe(statusCode)
    expect(error.data).toEqual({ code })
  })

  it('maps provider and database implementation errors to safe responses', () => {
    const providerError = toNitroError(
      new ProviderError('upstream token=secret response body')
    )
    expect(providerError.statusCode).toBe(502)
    expect(providerError.statusMessage).toBe(
      'The media provider is unavailable'
    )
    expect(providerError.message).not.toContain('secret')
    expect(
      toApplicationError({ code: 'P2002', meta: { target: ['email'] } }).code
    ).toBe('CONFLICT')
  })
})
