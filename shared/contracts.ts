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
  totalPages: z.coerce.number().int().nonnegative(),
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
  .extend({ passwordConfirmation: z.string() })
  .refine((input) => input.password === input.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Passwords do not match'
  })
export type SignupInput = z.infer<typeof signupInputSchema>
export const safeUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})
export type SafeUser = z.infer<typeof safeUserSchema>
export const applicationErrorCodes = [
  'INVALID_INPUT',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PROVIDER_UNAVAILABLE',
  'DATABASE_ERROR',
  'INTERNAL_ERROR'
] as const
export type ApplicationErrorCode = (typeof applicationErrorCodes)[number]
export const apiErrorSchema = z.object({
  code: z.enum(applicationErrorCodes),
  fields: z.record(z.string()).optional()
})
export type ApiError = z.infer<typeof apiErrorSchema>
