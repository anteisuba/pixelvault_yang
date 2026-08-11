import { afterEach, describe, expect, it } from 'vitest'

import {
  createRosterDragGhost,
  updateRosterDragGhost,
} from './canvas-roster-drag-ghost'

describe('canvas roster drag ghost', () => {
  afterEach(() => {
    document.querySelectorAll('[data-roster-drag-ghost]').forEach((node) => {
      node.remove()
    })
  })

  it('普通画布拖动时隐藏，只在合法投放目标上显示', () => {
    const ghost = createRosterDragGhost('https://example.com/image.png')

    expect(ghost).toHaveStyle({ visibility: 'hidden' })
    updateRosterDragGhost(ghost, 100, 120, false)
    expect(ghost).toHaveStyle({ visibility: 'hidden' })
    updateRosterDragGhost(ghost, 100, 120, true)
    expect(ghost).toHaveStyle({ visibility: 'visible' })
  })
})
