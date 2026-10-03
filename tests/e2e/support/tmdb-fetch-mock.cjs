// Deterministic, test-only TMDB interception for the authenticated E2E flow.
//
// The Nuxt server talks to TMDB server-to-server, so a browser-level mock
// (Playwright `page.route`) cannot reach those requests. The TMDB provider
// client resolves the global `fetch` at call time and its base URL is fixed, so
// this preload — injected via NODE_OPTIONS into the Playwright-managed dev
// server process — replaces `globalThis.fetch` and answers only the TMDB
// endpoints the flow needs. Every non-TMDB request falls through to the real
// fetch, and no production code is aware of this file.
//
// Only the media-provider-dependent reads are stubbed. Bookmark creation and
// removal still go through the real application API and the isolated
// PostgreSQL test database, so their persistence is exercised for real.

const REAL_FETCH = globalThis.fetch

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

// Reuses the repository's existing media fixture rather than inventing a second
// media model, so the deterministic card identity matches other test layers.
const movieFixture = require('../../fixtures/tmdb/movie.json')

function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

function page(results) {
  return json({
    page: 1,
    total_pages: 1,
    total_results: results.length,
    results
  })
}

const movie = {
  id: movieFixture.id,
  title: movieFixture.title,
  release_date: movieFixture.release_date,
  overview: movieFixture.overview,
  poster_path: movieFixture.poster_path,
  backdrop_path: null
}

function respond(pathname) {
  if (pathname === '/trending/all/day') {
    return page([{ ...movie, media_type: 'movie' }])
  }
  if (pathname === '/discover/movie') return page([movie])
  if (pathname === '/discover/tv') return page([])
  // Search: the all-media scope queries both endpoints, while Movies/TV narrow
  // to one. Movies returns the shared fixture and TV has no hits, so an
  // all-scope search resolves to exactly the deterministic movie fixture.
  if (pathname === '/search/movie') return page([movie])
  if (pathname === '/search/tv') return page([])
  if (/^\/movie\/\d+$/.test(pathname)) return json(movie)
  if (/^\/movie\/\d+\/release_dates$/.test(pathname)) {
    return json({
      id: movie.id,
      results: [
        { iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }
      ]
    })
  }
  if (/^\/movie\/\d+\/recommendations$/.test(pathname)) return page([])
  if (/^\/tv\/\d+\/content_ratings$/.test(pathname)) {
    return json({ id: 0, results: [] })
  }
  if (/^\/tv\/\d+\/recommendations$/.test(pathname)) return page([])

  // Fail loudly instead of returning an empty payload: a silent stub would hide
  // an unhandled provider call and produce a false-positive E2E result.
  throw new Error(`Unhandled E2E TMDB request: ${pathname}`)
}

globalThis.fetch = function patchedFetch(input, init) {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url

  if (url.startsWith(TMDB_BASE_URL)) {
    return Promise.resolve(
      respond(url.slice(TMDB_BASE_URL.length).split('?')[0])
    )
  }

  return REAL_FETCH.call(this, input, init)
}
