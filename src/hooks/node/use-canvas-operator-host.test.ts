import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import { STUDIO_OPERATOR_SHELL } from '@/constants/studio-assistant-operator'
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

  /**
   * 画布有顶栏，所以它的两个锚点与另外三处不同（D7b ④）：头像排在顶栏那一行
   * （与「剪辑台」胶囊同高），面板顶边 = 顶栏底 + 6 —— ⛔ 不再压顶栏。
   */
  it('给出画布自己的锚点：面板顶边 = 顶栏底 + 6，头像排在顶栏行', () => {
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
    expect(result.current.anchor).toEqual({
      avatarTopPx:
        CANVAS_SHELL_LAYOUT.edgeInsetPx +
        (CANVAS_SHELL_LAYOUT.pillHeightPx -
          STUDIO_OPERATOR_SHELL.avatarSizePx) /
          2,
      avatarRightPx: CANVAS_SHELL_LAYOUT.edgeInsetPx,
      panelTopPx:
        CANVAS_SHELL_LAYOUT.edgeInsetPx +
        CANVAS_SHELL_LAYOUT.pillHeightPx +
        CANVAS_SHELL_LAYOUT.assistantPanelGapPx,
      panelRightPx: CANVAS_SHELL_LAYOUT.edgeInsetPx,
    })
    expect(CANVAS_SHELL_LAYOUT.assistantPanelGapPx).toBe(6)
  })
})
