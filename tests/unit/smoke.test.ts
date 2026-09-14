// Smoke test: verifies the unit test environment executes real assertions
// and that outbound HTTP calls are blocked unless explicitly intercepted.
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { mswServer } from '../setup/msw'

describe('test infrastructure smoke test', () => {
  it('runs real assertions', () => {
    expect(1 + 1).toBe(2)
  })

  it('blocks an unintercepted external HTTP call', async () => {
    await expect(
      fetch('https://api.themoviedb.org/3/trending/all/day')
    ).rejects.toThrow()
  })

  it('allows an explicitly intercepted HTTP call', async () => {
    mswServer.use(
      http.get('https://api.themoviedb.org/3/trending/all/day', () =>
        HttpResponse.json({ results: [] })
      )
    )

    const response = await fetch(
      'https://api.themoviedb.org/3/trending/all/day'
    )

    await expect(response.json()).resolves.toEqual({ results: [] })
  })
})
