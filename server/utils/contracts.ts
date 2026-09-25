import { z } from 'zod'
import { mediaTypeSchema, providerSchema } from '../../shared/contracts'
import type { MediaType } from '../../shared/contracts'

const pageSchema = z.coerce.number().int().positive().max(500)

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

export const bookmarkCreateInputSchema = z.object({
  provider: providerSchema,
  externalId: z.number().int().positive(),
  mediaType: mediaTypeSchema
})
export const bookmarkListQuerySchema = mediaPageQuerySchema
export const bookmarkIdentityPathSchema = z.object({
  provider: providerSchema,
  externalId: z.coerce.number().int().positive(),
  mediaType: mediaTypeSchema
})
