// Vitest setup for the "unit" project: blocks all real network access so
// unit tests stay fast, deterministic, and independent of external services.
// Tests that need to simulate an HTTP call (e.g. a future TMDB client) must
// register an explicit MSW handler via `mswServer.use(...)`.
import { afterAll, afterEach, beforeAll } from 'vitest'
import { mswServer } from './msw'

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())
