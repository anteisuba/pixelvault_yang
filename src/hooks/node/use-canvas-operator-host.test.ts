import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { useCanvasOperatorHost } from '@/hooks/node/use-canvas-operator-host'

/**
 * ⭐ 守的是「画布整体豁免注意力收放法则」（2026-09-19 owner 拍板）。
 *
 * ⚠ 失效的表现是**真机上助手一点就关**：面板外面就是工作面，平移 / 框选 / 拖节点
 * 每一下都会命中 Dock 那条 `pointerdown` 监听。而单测里那条监听住在 Dock 上，
 * 这里只钉宿主这一侧说没说对 —— Dock 那一侧的两档由
 * `StudioOperatorDock.web.test.tsx` 钉住。
 */
describe('useCanvasOperatorHost', () => {
  it('把外部点击收起置为不收，域仍是 canvas', () => {
    const { result } = renderHook(() =>
      useCanvasOperatorHost({
        nodes: [],
        edges: [],
        selectedNodeIds: [],
        applyOp: vi.fn(() => true),
        undo: vi.fn(),
        canUndo: false,
        generateNodes: vi.fn(),
        open: true,
        setOpen: vi.fn(),
      }),
    )
    expect(result.current.collapseOnOutsidePointer).toBe(false)
    expect(result.current.domain).toBe(ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas)
  })
})
