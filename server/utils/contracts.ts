import { z } from 'zod'

export const mediaTypeSchema = z.enum(['MOVIE', 'TV'])
export type MediaType = z.infer<typeof mediaTypeSchema>

export const providerSchema = z.literal('TMDB')
export type Provider = z.infer<typeof providerSchema>

const nullableText = z.string().trim().min(1).nullable()

export const mediaItemSchema = z.object({
  externalId: z.number().int().positive(),
  mediaType: mediaTypeSchema,
  title: z.string().trim().min(1),
  year: z.number().int().min(1).max(9999).nullable(),
  posterPath: nullableText,
  backdropPath: nullableText,
  overview: nullableText,
  contentRating: nullableText,
  isTrending: z.boolean(),
  isBookmarked: z.boolean()
})
export type MediaItem = z.infer<typeof mediaItemSchema>

const pageSchema = z.coerce.number().int().positive().max(500)

export const paginationMetaSchema = z.object({
  page: pageSchema,
  totalPages: z.coerce.number().int().nonnegative().max(500),
  totalResults: z.coerce.number().int().nonnegative()
})
export type PaginationMeta = z.infer<typeof paginationMetaSchema>

export const paginatedMediaSchema = z.object({
  data: z.array(mediaItemSchema),
  meta: paginationMetaSchema
})
export type PaginatedMedia = z.infer<typeof paginatedMediaSchema>

export const providerIdentitySchema = z.object({
  provider: providerSchema,
  externalId: z.number().int().positive(),
  mediaType: mediaTypeSchema
})
export type ProviderIdentity = z.infer<typeof providerIdentitySchema>

const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase())

const passwordSchema = z.string().min(8).max(128)

export const loginInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema
})
export type LoginInput = z.infer<typeof loginInputSchema>

export const signupInputSchema = loginInputSchema
  .extend({
    passwordConfirmation: z.string()
  })
  .refine((input) => input.password === input.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Passwords do not match'
  })
export type SignupInput = z.infer<typeof signupInputSchema>

export const mediaPathSchema = z.object({
  type: z
    .enum(['movie', 'tv'])
    .transform((type) => type.toUpperCase() as MediaType),
  externalId: z.coerce.number().int().positive()
})

export const mediaPageQuerySchema = z.object({
  page: pageSchema.default(1)
})

export const mediaSearchQuerySchema = mediaPageQuerySchema.extend({
  q: z.string().trim().min(1).max(100)
})

export const mediaQuerySchema = mediaPageQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional()
})
