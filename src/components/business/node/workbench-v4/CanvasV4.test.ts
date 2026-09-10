import { describe, expect, it } from 'vitest'

import { NODE_PORT_HANDLE_IDS, NODE_SLOT_IDS } from '@/constants/node-slots'
import type { NodeWorkflowEdgeV4 } from '@/types/node-workflow'

import { toRenderEdgeBase } from './CanvasV4'

describe('toRenderEdgeBase（S6e：一入一出）', () => {
  it('槽不进 handle：`targetHandle` 是统一入口，槽仍在 `edge.slot` 上', () => {
    const edge: NodeWorkflowEdgeV4 = {
      id: 'e1',
      source: 'img',
      sourceHandle: 'out',
      target: 'shot',
      slot: NODE_SLOT_IDS.firstFrame,
    }
    expect(toRenderEdgeBase(edge)).toEqual({
      id: 'e1',
      source: 'img',
      sourceHandle: NODE_PORT_HANDLE_IDS.output,
      target: 'shot',
      targetHandle: NODE_PORT_HANDLE_IDS.input,
    })
  })

  it('存量的 `tailFrame` 接续边照样画得出来（那个口不画了，边不能跟着消失）', () => {
    const edge: NodeWorkflowEdgeV4 = {
      id: 'e2',
      source: 'v_01',
      sourceHandle: 'tailFrame',
      target: 'v_02',
      slot: NODE_SLOT_IDS.firstFrame,
    }
    expect(toRenderEdgeBase(edge).sourceHandle).toBe(
      NODE_PORT_HANDLE_IDS.output,
    )
  })
})
