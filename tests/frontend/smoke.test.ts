import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import HomePage from '../../app/pages/index.vue'

describe('frontend smoke test', () => {
  it('mounts the home page', async () => {
    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.get('h1').text()).toContain(`don't watch entertainment`)
    wrapper.unmount()
  })
})
