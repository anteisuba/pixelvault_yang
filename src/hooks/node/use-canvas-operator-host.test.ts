import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// 这条用例验的是宿主契约的那几格，⛔ 不验文案 —— 词表由 i18n 完整性用例守着。
vi.mock('next-intl', () => ({
  /**
   * ⚠ 带值的键把值一起串出来：四张脸那一句（`face.*.context`）验的正是「值跟着
   * 宿主状态变」，回一个光秃秃的 key 会让那条断言恒真。
   */
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}|${Object.values(values).join('·')}` : key,
}))

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import {
  STUDIO_OPERATOR_FACE_PILLS,
  STUDIO_OPERATOR_FACE_PILL_LIMIT,
  STUDIO_OPERATOR_SHELL,
} from '@/constants/studio-assistant-operator'
import { useCanvasOperatorHost } from '@/hooks/node/use-canvas-operator-host'
import type { NodeV4 } from '@/types/node-workflow'

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
        projectId: 'project-a',
        projectName: '借伞',
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
        projectId: 'project-a',
        projectName: '借伞',
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

/**
 * **画布那张脸**（D7b ③ · 画板 `DesignD7bFaces`）—— 全能导演。
 *
 * ⚠ 那一句读的是 render 期的 `selectedNodeIds`（⛔ 不是给「现读」用的那只 ref）：
 * 用 ref 的表现是「框选了几个节点胶囊不动」。
 */
describe('useCanvasOperatorHost 的 face（D7b ③）', () => {
  const render = (selectedNodeIds: readonly string[], projectName: string) =>
    renderHook(
      ({ ids, name }: { ids: readonly string[]; name: string }) =>
        useCanvasOperatorHost({
          nodes: [],
          edges: [],
          selectedNodeIds: ids,
          projectId: 'project-a',
          projectName: name,
          applyOp: vi.fn(() => true),
          undo: vi.fn(),
          canUndo: false,
          generateNodes: vi.fn(),
          open: true,
          setOpen: vi.fn(),
        }),
      { initialProps: { ids: selectedNodeIds, name: projectName } },
    )

  it('那一句 =「{项目名} · 选中 {n} 个节点」，随选择实时刷', () => {
    const { result, rerender } = render([], '借伞分镜')
    expect(result.current.face.contextLine()).toBe(
      'face.canvas.context|借伞分镜·0',
    )
    rerender({ ids: ['n-1', 'n-2'], name: '借伞分镜' })
    expect(result.current.face.contextLine()).toBe(
      'face.canvas.context|借伞分镜·2',
    )
  })

  it('药丸来自画布那张脸，数量 ≤ 封顶（五颗）', () => {
    const { result } = render([], '借伞分镜')
    expect(result.current.face.starterPills).toEqual(
      STUDIO_OPERATOR_FACE_PILLS[ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas].map(
        (id) => `face.pill.${id}`,
      ),
    )
    expect(result.current.face.starterPills.length).toBeLessThanOrEqual(
      STUDIO_OPERATOR_FACE_PILL_LIMIT,
    )
    expect(result.current.face.emptyLine).toBe('face.canvas.empty')
    expect(result.current.face.inputPlaceholder).toBe('face.canvas.placeholder')
  })
})

describe('canvas assistant image references', () => {
  const image = (id: string, url?: string): NodeV4 =>
    ({
      id,
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        subtype: 'shot',
        name: id,
        status: 'idle',
        createdAt: '2026-09-21T00:00:00.000Z',
        ...(url ? { url } : {}),
      },
    }) as NodeV4
  function setup(nodes: readonly NodeV4[] = []) {
    const applyOp = vi.fn(() => true)
    const hook = renderHook(
      ({ nodes, projectId }) =>
        useCanvasOperatorHost({
          nodes,
          projectId,
          projectName: 'same name',
          edges: [],
          selectedNodeIds: [],
          applyOp,
          undo: vi.fn(),
          canUndo: false,
          generateNodes: vi.fn(),
          open: true,
          setOpen: vi.fn(),
        }),
      { initialProps: { nodes, projectId: 'project-a' } },
    )
    return { ...hook, applyOp }
  }

  it('exposes existing canvas images without requiring node selection', () => {
    const { result } = setup([
      image('one', 'https://example.com/one.png'),
      image('empty'),
      image('duplicate', 'https://example.com/one.png'),
    ])
    expect(result.current.referenceImages).toEqual([
      { url: 'https://example.com/one.png', name: 'one' },
    ])
    expect(result.current.referenceLimit).toBeGreaterThan(0)
  })

  it('retains library/upload references, deduplicates them, and removes them without editing the graph', () => {
    const { result, applyOp } = setup()
    act(() => {
      result.current.apply.addReference('https://example.com/library.png')
      result.current.apply.addReference('https://example.com/library.png')
    })
    expect(result.current.referenceImages).toEqual([
      { url: 'https://example.com/library.png' },
    ])
    act(() =>
      result.current.apply.removeReference('https://example.com/library.png'),
    )
    expect(result.current.referenceImages).toEqual([])
    expect(applyOp).not.toHaveBeenCalled()
  })

  it('removing an assistant reference does not delete its canvas node', () => {
    const nodes = [image('one', 'https://example.com/one.png')]
    const { result, rerender, applyOp } = setup(nodes)
    act(() =>
      result.current.apply.removeReference('https://example.com/one.png'),
    )
    rerender({ nodes: [...nodes], projectId: 'project-a' })
    expect(result.current.referenceImages).toEqual([])
    expect(applyOp).not.toHaveBeenCalled()
    act(() => result.current.apply.addReference('https://example.com/one.png'))
    expect(result.current.referenceImages).toEqual([
      { url: 'https://example.com/one.png', name: 'one' },
    ])
  })

  it('clears local reference changes when switching projects with the same name', () => {
    const { result, rerender } = setup()
    act(() =>
      result.current.apply.addReference('https://example.com/library.png'),
    )
    rerender({
      nodes: [image('two', 'https://example.com/two.png')],
      projectId: 'project-b',
    })
    expect(result.current.referenceImages).toEqual([
      { url: 'https://example.com/two.png', name: 'two' },
    ])
  })

  it('keeps existing reference numbers when nodes are added or reordered', () => {
    const one = image('one', 'https://example.com/one.png')
    const two = image('two', 'https://example.com/two.png')
    const { result, rerender } = setup([one])
    act(() =>
      result.current.apply.addReference('https://example.com/library.png'),
    )
    rerender({ nodes: [two, one], projectId: 'project-a' })
    expect(result.current.referenceImages.map((entry) => entry.url)).toEqual([
      'https://example.com/one.png',
      'https://example.com/library.png',
      'https://example.com/two.png',
    ])
  })

  it('updates references when a canvas output disappears', () => {
    const { result, rerender } = setup([
      image('one', 'https://example.com/one.png'),
    ])
    rerender({ nodes: [], projectId: 'project-a' })
    expect(result.current.referenceImages).toEqual([])
  })
})
