// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SHOT_TABLE_BOARD } from '@/constants/shot-spec'

import { useShotTableRfNode } from './use-shot-table-rf-node'

const ID = SHOT_TABLE_BOARD.nodeId

describe('useShotTableRfNode', () => {
  it('没有 board = 表不在画布上', () => {
    const { result } = renderHook(() => useShotTableRfNode(undefined))
    expect(result.current.node).toBeNull()
  })

  it('位置读 board；选中 / 尺寸记在本地', () => {
    const { result } = renderHook(() => useShotTableRfNode({ x: 10, y: 20 }))
    expect(result.current.node?.position).toEqual({ x: 10, y: 20 })
    expect(result.current.node?.type).toBe(SHOT_TABLE_BOARD.rfType)
    act(() => {
      result.current.applyChanges([
        { id: ID, type: 'select', selected: true },
        {
          id: ID,
          type: 'dimensions',
          dimensions: { width: 1180, height: 400 },
        },
      ])
    })
    expect(result.current.node?.selected).toBe(true)
    expect(result.current.node?.measured).toEqual({ width: 1180, height: 400 })
  })

  it('拖动中走本地位置；endDrag 之后回到 board（坐标由画布落进 board）', () => {
    let board = { x: 10, y: 20 }
    const { result, rerender } = renderHook(() => useShotTableRfNode(board))
    act(() => {
      result.current.applyChanges([
        {
          id: ID,
          type: 'position',
          position: { x: 300, y: 50 },
          dragging: true,
        },
      ])
    })
    expect(result.current.node?.position).toEqual({ x: 300, y: 50 })
    expect(result.current.node?.dragging).toBe(true)

    board = { x: 300, y: 50 }
    rerender()
    act(() => result.current.endDrag())
    expect(result.current.node?.position).toEqual({ x: 300, y: 50 })
    expect(result.current.node?.dragging).toBe(false)
  })

  it('⛔ remove 变更不在这里删表（删表走 set_shotlist，一步撤销）', () => {
    const { result } = renderHook(() => useShotTableRfNode({ x: 0, y: 0 }))
    act(() => {
      result.current.applyChanges([{ id: ID, type: 'remove' }])
    })
    expect(result.current.node).not.toBeNull()
  })
})
