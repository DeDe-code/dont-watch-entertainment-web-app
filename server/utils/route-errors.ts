import type { H3Event } from 'h3'
import { toNitroError } from './errors'

export async function withRouteErrors<T>(
  _event: H3Event,
  handler: () => Promise<T>
): Promise<T> {
  try {
    return await handler()
  } catch (error) {
    throw toNitroError(error)
  }
}
