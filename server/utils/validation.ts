import type { ZodType } from 'zod'
import { ApplicationError } from './errors'

export type ValidationSource = 'path' | 'query' | 'body'

export function validate<T>(
  schema: ZodType<T>,
  input: unknown,
  source: ValidationSource
): T {
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

export function validatePath<T>(schema: ZodType<T>, input: unknown): T {
  return validate(schema, input, 'path')
}

export function validateQuery<T>(schema: ZodType<T>, input: unknown): T {
  return validate(schema, input, 'query')
}

export function validateBody<T>(schema: ZodType<T>, input: unknown): T {
  return validate(schema, input, 'body')
}
