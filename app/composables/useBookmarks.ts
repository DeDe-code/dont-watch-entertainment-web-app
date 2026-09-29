import type {
  MediaItem,
  Provider,
  ProviderIdentity
} from '~/../shared/contracts'

// The stable identity of a bookmarked item. Deliberately a structural subset of
// ProviderIdentity so a MediaItem (or any normalized response item) satisfies it
// without the composable depending on provider-specific fields.
type BookmarkIdentity = Pick<ProviderIdentity, 'mediaType' | 'externalId'>

// The minimum a normalized response item must carry to seed bookmark state. It
// intentionally excludes the rest of MediaItem so seeding never stores media
// content — only the identity and its current bookmark flag.
type BookmarkSeed = Pick<MediaItem, 'mediaType' | 'externalId' | 'isBookmarked'>

// TMDB is the only supported provider, so callers never pass one: the composable
// owns the provider half of the canonical identity used by the bookmark APIs.
const BOOKMARK_PROVIDER: Provider = 'TMDB'

// Identity is namespaced by mediaType so MOVIE:123 and TV:123 are distinct even
// though they share an external id. Key construction stays internal: callers
// pass an identity, never a raw string, so the encoding can change without
// touching call sites.
function bookmarkKey(identity: BookmarkIdentity) {
  return `${identity.mediaType}:${identity.externalId}`
}

/**
 * SSR-safe bookmark state shared by every caller within the same Nuxt app.
 *
 * State is a flat identity → bookmarked map, never a collection of MediaItems,
 * so a bookmark response cannot silently overwrite media metadata (and vice
 * versa). `useState` provides the sharing: SSR requests get isolated state and
 * all client callers observe the same map, with no Pinia or localStorage.
 *
 * Mutations are optimistic. `toggle` is the only public mutation, so callers
 * cannot drift into inconsistent add/remove flows: it derives the required
 * operation from the current flag. A per-identity pending lock (also `useState`,
 * so it is shared rather than duplicated per caller) makes "one mutation per
 * identity at a time" an invariant of the composable instead of a convention
 * callers must remember. A module-level lock was rejected because it would leak
 * across SSR requests.
 */
export function useBookmarks() {
  const bookmarks = useState<Record<string, boolean>>(
    'bookmark-identities',
    () => ({})
  )

  // Pending identities are keyed identically to bookmarks so "is this identity
  // mutating?" mirrors the flag lookup and never depends on media content.
  const pending = useState<Record<string, boolean>>(
    'bookmark-pending-identities',
    () => ({})
  )

  const { status, bootstrap } = useAuth()
  const route = useRoute()

  // Unknown identities are unbookmarked by definition, so callers never have to
  // distinguish "absent" from "false".
  function isBookmarked(identity: BookmarkIdentity): boolean {
    return bookmarks.value[bookmarkKey(identity)] ?? false
  }

  function isPending(identity: BookmarkIdentity): boolean {
    return pending.value[bookmarkKey(identity)] ?? false
  }

  // Re-seeding an identity overwrites its flag in place, keeping the map free of
  // duplicate entries when the same item appears across responses.
  function seed(items: readonly BookmarkSeed[]): void {
    for (const item of items) {
      const key = bookmarkKey(item)
      // An in-flight optimistic mutation owns this identity's flag: a stale
      // response seeded mid-flight would clobber the optimistic value before
      // the mutation's own result lands. Skipping keeps the pending mutation
      // authoritative without exposing that decision to callers.
      if (pending.value[key]) continue
      bookmarks.value[key] = item.isBookmarked
    }
  }

  async function toggle(identity: BookmarkIdentity): Promise<void> {
    const key = bookmarkKey(identity)

    // The lock is acquired synchronously so two rapid calls for the same
    // identity cannot both pass the check before the first request starts.
    // Duplicate calls resolve immediately rather than awaiting the in-flight
    // mutation; the request itself is already guaranteed to be unique.
    if (pending.value[key]) return
    pending.value[key] = true

    try {
      // Awaits only when state is genuinely unknown: an already-known session
      // proceeds synchronously so local state flips in the same tick as the
      // call, keeping optimistic feedback immediate.
      if (status.value === 'unknown') await bootstrap()

      // Bookmark APIs are session-scoped, so an anonymous visitor is sent to
      // login with a safe return path and no bookmark state is touched.
      if (status.value !== 'authenticated') {
        await navigateTo({
          path: '/login',
          query: { redirect: getSafeRedirect(route.fullPath) }
        })
        return
      }

      const previous = bookmarks.value[key] ?? false
      const next = !previous
      // Optimistic write happens before the request (and, when already
      // authenticated, before any await) so local state changes immediately.
      bookmarks.value[key] = next

      try {
        if (next) {
          await $fetch('/api/bookmarks', {
            method: 'POST',
            body: {
              provider: BOOKMARK_PROVIDER,
              externalId: identity.externalId,
              mediaType: identity.mediaType
            }
          })
        } else {
          await $fetch(
            `/api/bookmarks/${BOOKMARK_PROVIDER}/${identity.externalId}/${identity.mediaType}`,
            { method: 'DELETE' }
          )
        }
      } catch (error) {
        // Restore the pre-mutation flag, then surface the failure so callers can
        // report it; a swallowed error would leave optimistic state lying.
        bookmarks.value[key] = previous
        throw error
      }
    } finally {
      Reflect.deleteProperty(pending.value, key)
    }
  }

  return { isBookmarked, isPending, seed, toggle }
}
