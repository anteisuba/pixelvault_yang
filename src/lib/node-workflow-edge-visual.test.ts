import { describe, expect, it } from 'vitest'

import { NODE_STUDIO_EDGE_VISUALS } from '@/constants/node-studio'

import {
  isNodeWorkflowGenerating,
  resolveNodeWorkflowEdgeVisual,
} from './node-workflow-edge-visual'

describe('isNodeWorkflowGenerating', () => {
  it('is true while running or pending', () => {
    expect(isNodeWorkflowGenerating('running', undefined)).toBe(true)
    expect(isNodeWorkflowGenerating(undefined, 'pending')).toBe(true)
  })

  it('is false otherwise', () => {
    expect(isNodeWorkflowGenerating('idle', 'idle')).toBe(false)
    expect(isNodeWorkflowGenerating('done', 'success')).toBe(false)
    expect(isNodeWorkflowGenerating(undefined, undefined)).toBe(false)
  })
})

describe('resolveNodeWorkflowEdgeVisual', () => {
  it('default state = neutral gray, base width, no pulse', () => {
    expect(
      resolveNodeWorkflowEdgeVisual({
        running: false,
        selected: false,
        hovered: false,
      }),
    ).toEqual({
      color: 'var(--node-edge)',
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.strokeWidth,
      pulsing: false,
    })
  })

  it('hover lifts to the bright neutral (brightness, not hue)', () => {
    const v = resolveNodeWorkflowEdgeVisual({
      running: false,
      selected: false,
      hovered: true,
    })
    expect(v.color).toBe('var(--node-edge-active)')
    expect(v.pulsing).toBe(false)
  })

  it('selected lifts color and thickens', () => {
    const v = resolveNodeWorkflowEdgeVisual({
      running: false,
      selected: true,
      hovered: false,
    })
    expect(v.color).toBe('var(--node-edge-active)')
    expect(v.strokeWidth).toBe(NODE_STUDIO_EDGE_VISUALS.strokeWidth + 0.5)
  })

  it('running lifts color and pulses', () => {
    const v = resolveNodeWorkflowEdgeVisual({
      running: true,
      selected: false,
      hovered: false,
    })
    expect(v.color).toBe('var(--node-edge-active)')
    expect(v.pulsing).toBe(true)
  })
})
