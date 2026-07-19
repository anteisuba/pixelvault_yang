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
  it('default state (骨干常显) = neutral gray, base width, no pulse', () => {
    expect(
      resolveNodeWorkflowEdgeVisual({
        running: false,
        selected: false,
        revealed: false,
        hovered: false,
      }),
    ).toEqual({
      color: 'var(--node-edge)',
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.strokeWidth,
      pulsing: false,
    })
  })

  it('hover lifts to the bright neutral (brightness, not hue) and thickens to hover width', () => {
    const v = resolveNodeWorkflowEdgeVisual({
      running: false,
      selected: false,
      revealed: false,
      hovered: true,
    })
    expect(v).toEqual({
      color: 'var(--node-edge-active)',
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.hoverStrokeWidth,
      pulsing: false,
    })
  })

  it('revealed (ingredient edge shown by node selection) = 石绿 mix, thin width', () => {
    const v = resolveNodeWorkflowEdgeVisual({
      running: false,
      selected: false,
      revealed: true,
      hovered: false,
    })
    expect(v).toEqual({
      color: NODE_STUDIO_EDGE_VISUALS.revealedColor,
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.revealedStrokeWidth,
      pulsing: false,
    })
  })

  it('selected (the edge itself is selected) = pure 石绿, thickened', () => {
    const v = resolveNodeWorkflowEdgeVisual({
      running: false,
      selected: true,
      revealed: false,
      hovered: false,
    })
    expect(v).toEqual({
      color: NODE_STUDIO_EDGE_VISUALS.selectedColor,
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.selectedStrokeWidth,
      pulsing: false,
    })
  })

  it('running lifts color and pulses', () => {
    const v = resolveNodeWorkflowEdgeVisual({
      running: true,
      selected: false,
      revealed: false,
      hovered: false,
    })
    expect(v.color).toBe('var(--node-edge-active)')
    expect(v.pulsing).toBe(true)
  })

  it('precedence: running beats selected/revealed/hover', () => {
    const v = resolveNodeWorkflowEdgeVisual({
      running: true,
      selected: true,
      revealed: true,
      hovered: true,
    })
    expect(v).toEqual({
      color: NODE_STUDIO_EDGE_VISUALS.previewColor,
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.strokeWidth,
      pulsing: true,
    })
  })

  it('precedence: selected beats revealed/hover', () => {
    const v = resolveNodeWorkflowEdgeVisual({
      running: false,
      selected: true,
      revealed: true,
      hovered: true,
    })
    expect(v.color).toBe(NODE_STUDIO_EDGE_VISUALS.selectedColor)
    expect(v.strokeWidth).toBe(NODE_STUDIO_EDGE_VISUALS.selectedStrokeWidth)
  })

  it('precedence: revealed beats hover', () => {
    const v = resolveNodeWorkflowEdgeVisual({
      running: false,
      selected: false,
      revealed: true,
      hovered: true,
    })
    expect(v.color).toBe(NODE_STUDIO_EDGE_VISUALS.revealedColor)
    expect(v.strokeWidth).toBe(NODE_STUDIO_EDGE_VISUALS.revealedStrokeWidth)
  })
})
