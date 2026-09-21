import { createError, type H3Error } from 'h3'

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

type ErrorDetails = Record<string, string>

const errorStatuses: Record<ApplicationErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PROVIDER_UNAVAILABLE: 502,
  DATABASE_ERROR: 500,
  INTERNAL_ERROR: 500
}

const publicMessages: Record<ApplicationErrorCode, string> = {
  INVALID_INPUT: 'Request validation failed',
  UNAUTHENTICATED: 'Authentication is required',
  FORBIDDEN: 'You do not have permission to perform this action',
  NOT_FOUND: 'The requested resource was not found',
  CONFLICT: 'The request conflicts with existing data',
  PROVIDER_UNAVAILABLE: 'The media provider is unavailable',
  DATABASE_ERROR: 'A database error occurred',
  INTERNAL_ERROR: 'An unexpected error occurred'
}

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode
  readonly details?: ErrorDetails

  constructor(code: ApplicationErrorCode, details?: ErrorDetails) {
    super(publicMessages[code])
    this.name = 'ApplicationError'
    this.code = code
    this.details = details
  }

  static invalidInput(details?: ErrorDetails): ApplicationError {
    return new ApplicationError('INVALID_INPUT', details)
  }

  static unauthenticated(): ApplicationError {
    return new ApplicationError('UNAUTHENTICATED')
  }

  static forbidden(): ApplicationError {
    return new ApplicationError('FORBIDDEN')
  }

  static notFound(): ApplicationError {
    return new ApplicationError('NOT_FOUND')
  }

  static conflict(): ApplicationError {
    return new ApplicationError('CONFLICT')
  }

  static providerUnavailable(): ApplicationError {
    return new ApplicationError('PROVIDER_UNAVAILABLE')
  }

  static database(): ApplicationError {
    return new ApplicationError('DATABASE_ERROR')
  }
}

export type ProviderErrorCode =
  | 'TIMEOUT'
  | 'AUTHENTICATION'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM'
  | 'INVALID_RESPONSE'

export class ProviderError extends Error {
  readonly code: ProviderErrorCode

  constructor(
    message = 'Provider request failed',
    code: ProviderErrorCode = 'UPSTREAM'
  ) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
  }
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  )
}

export function toApplicationError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error
  }

  if (error instanceof ProviderError) {
    return ApplicationError.providerUnavailable()
  }

  if (isPrismaError(error, 'P2002')) {
    return ApplicationError.conflict()
  }

  if (isPrismaError(error, 'P2025')) {
    return ApplicationError.notFound()
  }

  return ApplicationError.database()
}

export function toNitroError(error: unknown): H3Error {
  const applicationError = toApplicationError(error)
  const data = {
    code: applicationError.code,
    ...(applicationError.details ? { fields: applicationError.details } : {})
  }

  return createError({
    statusCode: errorStatuses[applicationError.code],
    statusMessage: applicationError.message,
    data
  })
}
