import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import type { NuxtError } from '#app'
import ErrorPage from '../../app/error.vue'

const { clearErrorMock } = vi.hoisted(() => ({ clearErrorMock: vi.fn() }))

mockNuxtImport('clearError', () => clearErrorMock)

function makeError(overrides: Partial<NuxtError> = {}): NuxtError {
  return {
    statusCode: 500,
    statusMessage: 'Internal Server Error',
    message: 'Internal Server Error',
    ...overrides
  } as NuxtError
}

async function mountErrorPage(error: NuxtError) {
  return mountSuspended(ErrorPage, { props: { error } })
}

describe('application error page', () => {
  it('presents a page-not-found message for a 404', async () => {
    const wrapper = await mountErrorPage(
      makeError({ statusCode: 404, statusMessage: 'Page Not Found' })
    )

    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(wrapper.get('h1').text()).toBe('Page not found')
    expect(wrapper.get('button').text()).toBe('Back to Home')
    wrapper.unmount()
  })

  it('presents a generic failure message for a non-404 error', async () => {
    const wrapper = await mountErrorPage(makeError({ statusCode: 500 }))

    expect(wrapper.get('h1').text()).toBe('Something went wrong')
    // The server-provided status message is implementation detail, not copy.
    expect(wrapper.text()).not.toContain('Internal Server Error')
    wrapper.unmount()
  })

  it('never renders raw error internals', async () => {
    const wrapper = await mountErrorPage(
      makeError({
        statusCode: 500,
        statusMessage: 'PrismaClientKnownRequestError',
        message: 'relation "users" does not exist',
        stack: 'Error: boom\n    at server/services/bookmarks.ts:12:3',
        data: { databaseUrl: 'postgres://secret@localhost/app' }
      })
    )

    const html = wrapper.html()
    for (const leak of [
      'relation',
      'PrismaClientKnownRequestError',
      'bookmarks.ts',
      'postgres://'
    ]) {
      expect(html).not.toContain(leak)
    }
    wrapper.unmount()
  })

  it('clears the error and returns to Home from the recovery action', async () => {
    clearErrorMock.mockReset()
    const wrapper = await mountErrorPage(makeError({ statusCode: 404 }))

    await wrapper.get('button').trigger('click')

    expect(clearErrorMock).toHaveBeenCalledWith({ redirect: '/' })
    wrapper.unmount()
  })
})
