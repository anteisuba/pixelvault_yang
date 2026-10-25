import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { Switch } from './switch'

function root() {
  return document.querySelector('[data-slot="switch"]') as HTMLElement
}
function thumb() {
  return document.querySelector('[data-slot="switch-thumb"]') as HTMLElement
}

describe('Switch', () => {
  // ui-spec.md §9：只有一种 32×20，圆钮 16 + 2px 内嵌 → 行程 12px。
  it('renders the single 32x20 size with a 12px knob travel', () => {
    render(<Switch checked onCheckedChange={() => {}} />)
    expect(root().className).toContain('h-5')
    expect(root().className).toContain('w-8')
    expect(root()).toHaveAttribute('data-state', 'checked')
    expect(thumb().className).toContain('data-[state=checked]:translate-x-3')
  })
})
