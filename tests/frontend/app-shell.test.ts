import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppNavigation from '../../app/components/AppNavigation.vue'
import DefaultLayout from '../../app/layouts/default.vue'

const { logoutMock, navigateToMock } = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  navigateToMock: vi.fn()
}))

mockNuxtImport('useAuth', () => () => ({ logout: logoutMock }))
mockNuxtImport('navigateTo', () => navigateToMock)

const labels = ['Home', 'Movies', 'TV Series', 'Bookmarked']
const hrefs = ['/', '/movies', '/tv-series', '/bookmarked']

describe('AppNavigation', () => {
  beforeEach(() => {
    logoutMock.mockReset()
    logoutMock.mockResolvedValue(undefined)
    navigateToMock.mockReset()
    navigateToMock.mockResolvedValue(undefined)
  })

  it('renders the Figma nav items with accessible names and hrefs', async () => {
    const wrapper = await mountSuspended(AppNavigation, { route: '/' })
    const links = wrapper.findAll('.app-nav-link')

    expect(links).toHaveLength(4)
    expect(links.map((link) => link.attributes('aria-label'))).toEqual(labels)
    expect(links.map((link) => link.attributes('href'))).toEqual(hrefs)
    wrapper.unmount()
  })

  it('links the logo home with an accessible name', async () => {
    const wrapper = await mountSuspended(AppNavigation, { route: '/movies' })
    const logo = wrapper.get('.app-nav-logo')

    expect(logo.attributes('href')).toBe('/')
    expect(logo.attributes('aria-label')).toBe('Go to home')
    wrapper.unmount()
  })

  it('marks only the current section link', async () => {
    const wrapper = await mountSuspended(AppNavigation, { route: '/movies' })
    const current = wrapper.findAll('[aria-current="page"]')

    expect(current).toHaveLength(1)
    expect(current[0]!.attributes('aria-label')).toBe('Movies')
    wrapper.unmount()
  })

  it('treats the home link as current only at the root path', async () => {
    const wrapper = await mountSuspended(AppNavigation, { route: '/movies' })
    const home = wrapper
      .findAll('.app-nav-link')
      .find((link) => link.attributes('href') === '/')

    expect(home?.attributes('aria-current')).toBeUndefined()
    wrapper.unmount()
  })

  it('opens a single-action account menu from the avatar button', async () => {
    const wrapper = await mountSuspended(AppNavigation, { route: '/' })
    const trigger = wrapper.get('.app-account-trigger')

    expect(trigger.attributes('aria-label')).toBe('Account menu')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#account-menu').exists()).toBe(false)

    await trigger.trigger('click')

    expect(trigger.attributes('aria-expanded')).toBe('true')
    const menu = wrapper.get('#account-menu')
    expect(menu.findAll('button')).toHaveLength(1)
    expect(menu.get('button').text()).toBe('Log out')
    wrapper.unmount()
  })

  it('closes the account menu on Escape and restores focus', async () => {
    const wrapper = await mountSuspended(AppNavigation, { route: '/' })
    const trigger = wrapper.get('.app-account-trigger')
    const focusSpy = vi.spyOn(trigger.element, 'focus')
    await trigger.trigger('click')
    expect(wrapper.find('#account-menu').exists()).toBe(true)

    await wrapper.get('.app-account').trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('#account-menu').exists()).toBe(false)
    expect(focusSpy).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('closes the account menu on outside interaction', async () => {
    const wrapper = await mountSuspended(AppNavigation, { route: '/' })
    await wrapper.get('.app-account-trigger').trigger('click')
    expect(wrapper.find('#account-menu').exists()).toBe(true)

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(wrapper.find('#account-menu').exists()).toBe(false)
    wrapper.unmount()
  })

  it('logs out and redirects to login from the account menu', async () => {
    const wrapper = await mountSuspended(AppNavigation, { route: '/' })
    await wrapper.get('.app-account-trigger').trigger('click')
    await wrapper.get('.app-account-menu-item').trigger('click')
    await flushPromises()

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith('/login')
    wrapper.unmount()
  })
})

describe('default layout shell', () => {
  it('provides a skip link, a main landmark and the route announcer', async () => {
    const wrapper = await mountSuspended(DefaultLayout, {
      route: '/',
      slots: { default: '<p>page content</p>' }
    })

    expect(wrapper.get('.app-skip-link').attributes('href')).toBe(
      '#main-content'
    )
    expect(wrapper.get('main#main-content').text()).toContain('page content')
    expect(wrapper.find('.nuxt-route-announcer').exists()).toBe(true)
    // The non-Figma generic footer must not remain in the shell.
    expect(wrapper.find('footer').exists()).toBe(false)
    wrapper.unmount()
  })
})
