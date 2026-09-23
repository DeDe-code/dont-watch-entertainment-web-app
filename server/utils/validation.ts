import type { TypeOf, ZodTypeAny } from 'zod'
import { ApplicationError } from './errors'

export type ValidationSource = 'path' | 'query' | 'body'

export function validate<TSchema extends ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  source: ValidationSource
): TypeOf<TSchema> {
  const result = schema.safeParse(input)

  if (result.success) {
    return result.data
  }

  const fields = Object.fromEntries(
    result.error.issues.map((issue) => [
      issue.path.join('.') || source,
      issue.message
    ])
  )

  throw ApplicationError.invalidInput(fields)
}

export function validatePath<TSchema extends ZodTypeAny>(
  schema: TSchema,
  input: unknown
): TypeOf<TSchema> {
  return validate(schema, input, 'path')
}

export function validateQuery<TSchema extends ZodTypeAny>(
  schema: TSchema,
  input: unknown
): TypeOf<TSchema> {
  return validate(schema, input, 'query')
}

export function validateBody<TSchema extends ZodTypeAny>(
  schema: TSchema,
  input: unknown
): TypeOf<TSchema> {
  return validate(schema, input, 'body')
}
