import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { Switch } from './switch'

function root() {
  return document.querySelector('[data-slot="switch"]') as HTMLElement
}
function thumb() {
  return document.querySelector('[data-slot="switch-thumb"]') as HTMLElement
}

describe('Switch sizes', () => {
  // 画布节点卡的布尔参数走 iOS 形态 44×26（ui-defaults §3.1），⛔ 不新建组件。
  it('exposes the lg (44x26) size through data-size, with its own thumb travel', () => {
    render(<Switch size="lg" checked onCheckedChange={() => {}} />)
    expect(root()).toHaveAttribute('data-size', 'lg')
    expect(root().className).toContain('data-[size=lg]:w-11')
    expect(thumb().className).toContain(
      'group-data-[size=lg]/switch:data-[state=checked]:translate-x-4.5',
    )
  })

  it('keeps default as the fallback size', () => {
    render(<Switch />)
    expect(root()).toHaveAttribute('data-size', 'default')
  })
})
