// Shared MSW server instance used by both unit and integration test setups.
// Tests register handlers on this instance to intercept outbound HTTP calls
// (e.g. TMDB requests) without any change to production request code.
import { setupServer } from 'msw/node'

export const mswServer = setupServer()
