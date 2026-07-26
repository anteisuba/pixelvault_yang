import { describe, expect, it } from 'vitest'

import { NODE_STUDIO_EDGE_VISUALS } from '@/constants/node-studio'

import {
  isNodeWorkflowGenerating,
  isPendingSourceNode,
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

// S3（2026-07-26）连线语言：虚实编码「就绪与否」。
describe('S3 未就绪档', () => {
  it('源节点还没产出时给细虚线 + 降透明', () => {
    const visual = resolveNodeWorkflowEdgeVisual({
      running: false,
      selected: false,
      revealed: false,
      hovered: false,
      pending: true,
    })
    expect(visual.strokeWidth).toBe(NODE_STUDIO_EDGE_VISUALS.pendingStrokeWidth)
    expect(visual.dashArray).toBe(NODE_STUDIO_EDGE_VISUALS.pendingDashArray)
    expect(visual.opacity).toBe(NODE_STUDIO_EDGE_VISUALS.pendingOpacity)
  })

  // 正在生成比"还没就绪"更该被看见，所以 running 优先。
  it('源节点正在生成时仍走 running 的脉冲，不降级成虚线', () => {
    const visual = resolveNodeWorkflowEdgeVisual({
      running: true,
      selected: false,
      revealed: false,
      hovered: false,
      pending: true,
    })
    expect(visual.pulsing).toBe(true)
    expect(visual.dashArray).toBeUndefined()
  })

  it('已建立档是实线，不带 dash / opacity', () => {
    const visual = resolveNodeWorkflowEdgeVisual({
      running: false,
      selected: false,
      revealed: false,
      hovered: false,
    })
    expect(visual.strokeWidth).toBe(NODE_STUDIO_EDGE_VISUALS.strokeWidth)
    expect(visual.dashArray).toBeUndefined()
    expect(visual.opacity).toBeUndefined()
  })
})

// 身份卡 / 音色卡本来就不带 mediaUrl，不能一律当未就绪——否则虚实这个
// 编码位就废了（整张画布全虚线）。
describe('isPendingSourceNode', () => {
  it('会产媒体的类型没有 mediaUrl 时算未就绪', () => {
    expect(isPendingSourceNode({ type: 'image', data: {} })).toBe(true)
    expect(isPendingSourceNode({ type: 'seedance', data: {} })).toBe(true)
  })

  it('已经产出过就是已建立', () => {
    expect(
      isPendingSourceNode({
        type: 'image',
        data: { mediaUrl: 'https://x/y.png' },
      }),
    ).toBe(false)
  })

  it('不产媒体的类型一律不算未就绪', () => {
    expect(isPendingSourceNode({ type: 'voice', data: {} })).toBe(false)
    expect(isPendingSourceNode(undefined)).toBe(false)
  })
})
