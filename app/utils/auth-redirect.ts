export function getSafeRedirect(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  )
    return '/'
  try {
    const url = new URL(value, 'http://localhost')
    return url.origin === 'http://localhost'
      ? `${url.pathname}${url.search}${url.hash}`
      : '/'
  } catch {
    return '/'
  }
}

export function getAuthPageRedirect(route: { query: Record<string, unknown> }) {
  return getSafeRedirect(route.query.redirect)
}
