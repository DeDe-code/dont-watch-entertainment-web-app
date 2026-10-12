/**
 * User-facing feedback for a bookmark mutation the API rejected.
 *
 * `useBookmarks().toggle` deliberately rejects so callers cannot mistake a
 * failed mutation for a successful one, and it rolls the optimistic flag back
 * before rejecting. Reporting that failure is the caller's job, so the message
 * lives here instead of in each card: every card presentation reports the same
 * thing, and the provider's raw error never becomes part of what the user sees.
 *
 * The notice is a toast rather than inline card content because a card must not
 * change its Figma geometry for a transient message.
 *
 * The toast alone is not an accessible report: assistive technology ignores a
 * live region that is inserted together with its content, and Nuxt UI's toast
 * region only exists once the first toast opens. The app shell therefore keeps
 * its own regions mounted from first paint, and the toast's arrival can never
 * race ahead of the announcement.
 */

// The visible toast and the spoken announcement must never drift apart, so both
// are built from one notice.
const notice = {
  title: 'Bookmark update failed',
  description: 'Please try again.'
} as const

/**
 * Live regions the app shell renders; `reportBookmarkFailure` fills exactly one
 * of them.
 *
 * A live region announces a *change*: writing the same text into the same
 * region again is not a change, so a repeated bookmark failure would be silent.
 * Two regions let every report land as a fresh insertion into an empty region.
 * The switch is one state write, not a clear-then-set pair, so nothing can
 * interleave between emptying one region and filling the other.
 */
export const bookmarkFailureAnnouncementRegions = [0, 1] as const

export interface BookmarkFailureAnnouncement {
  /** Spoken form of the notice; the toast keeps title and description apart. */
  readonly message: string
  /** Region that must carry the message; every other region stays empty. */
  readonly region: (typeof bookmarkFailureAnnouncementRegions)[number]
}

export function useBookmarkFailureNotice() {
  const toast = useToast()

  // Shared state rather than a per-caller ref: the shell that renders the
  // regions is not the component that reports the failure, and every card
  // reports into the same surface.
  const announcement = useState<BookmarkFailureAnnouncement | null>(
    'bookmark-failure-announcement',
    () => null
  )

  function reportBookmarkFailure(): void {
    toast.add({ ...notice, color: 'error' })

    announcement.value = {
      message: `${notice.title} ${notice.description}`,
      region: announcement.value?.region === 0 ? 1 : 0
    }
  }

  return { announcement, reportBookmarkFailure }
}
