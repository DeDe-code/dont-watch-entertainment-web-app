import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The reduced-motion contract is CSS-only: `prefers-reduced-motion` cannot be
 * forced from Vitest, and there is no motion utility to unit-test. Asserting the
 * stylesheet source is therefore the only deterministic way to lock in the two
 * things that matter — the media query exists, and it neutralises motion
 * without touching the hover/focus end states themselves.
 */
function reducedMotionBlock(source: string): string | undefined {
  return source.match(
    /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n {2}\}/
  )?.[1]
}

describe('reduced motion', () => {
  it('makes decorative transitions and animations effectively immediate', () => {
    const block = reducedMotionBlock(
      readFileSync(resolve(process.cwd(), 'app/assets/css/main.css'), 'utf8')
    )

    expect(block).toBeDefined()
    expect(block).toContain('transition-duration: 0.01ms')
    expect(block).toContain('animation-duration: 0.01ms')
  })
})
