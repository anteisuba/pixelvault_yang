import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LookupFavoriteButton } from './LookupDetail'

describe('LookupFavoriteButton', () => {
  it('draws a different star once it is on, not just a different colour', () => {
    const star = (on: boolean) =>
      render(
        <LookupFavoriteButton on={on} label="x" onToggle={vi.fn()} />,
      ).container.querySelector('svg')!.innerHTML
    expect(star(true)).not.toBe(star(false))
  })
})
