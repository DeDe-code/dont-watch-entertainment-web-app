import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import HomePage from '../../app/pages/index.vue'

describe('frontend smoke test', () => {
  it('mounts the home page', async () => {
    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.get('#home-trending-heading').text()).toBe('Trending')
    expect(wrapper.get('#home-recommended-heading').text()).toBe(
      'Recommended for you'
    )

    wrapper.unmount()
  })
})
