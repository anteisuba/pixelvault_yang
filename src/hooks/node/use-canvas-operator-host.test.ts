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
  useLocale: () => 'zh',
}))

const mockLibraryCards = vi.hoisted(() => ({ value: [] as unknown[] }))
const deleteAssistantMemoryAPI = vi.hoisted(() => vi.fn())
const deleteProjectRuleAPI = vi.hoisted(() => vi.fn())
const revertAssistantAssetWriteAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/assistant-memories', () => ({
  deleteAssistantMemoryAPI,
}))
vi.mock('@/lib/api-client/assistant-persona', () => ({ deleteProjectRuleAPI }))
vi.mock('@/lib/api-client/assistant-operator', () => ({
  revertAssistantAssetWriteAPI,
}))
vi.mock('@/hooks/cards/use-character-library', () => ({
  useCharacterLibrary: () => ({
    cards: mockLibraryCards.value,
    loaded: true,
    find: () => null,
  }),
}))

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import {
  STUDIO_OPERATOR_FACE_PILLS,
  STUDIO_OPERATOR_FACE_PILL_LIMIT,
  STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR,
} from '@/constants/studio-assistant-operator'
import { useCanvasOperatorHost } from '@/hooks/node/use-canvas-operator-host'
import {
  applyInverseV4,
  applyNodeAssistantOpV4,
} from '@/lib/node-assistant-op-apply-v4'
import type {
  NodeV4,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

/**
 * ⭐ 守的是「画布整体豁免注意力收放法则」（2026-09-19 owner 拍板）。
 *
 * ⚠ 失效的表现是**真机上助手一点就关**：面板外面就是工作面，平移 / 框选 / 拖节点
 * 每一下都会命中 Dock 那条 `pointerdown` 监听。而单测里那条监听住在 Dock 上，
 * 这里只钉宿主这一侧说没说对 —— Dock 那一侧的两档由
 * `StudioOperatorDock.web.test.tsx` 钉住。
 */
describe('useCanvasOperatorHost', () => {
  it('画布接通规则和素材库撤销，图操作没有撤销本钱时返回失败', async () => {
    deleteAssistantMemoryAPI.mockReset().mockResolvedValue({ success: true })
    deleteProjectRuleAPI.mockReset().mockResolvedValue({ success: true })
    revertAssistantAssetWriteAPI.mockReset().mockResolvedValue({
      revertedCount: 1,
      skipped: 0,
    })
    const { result } = renderHook(() =>
      useCanvasOperatorHost({
        nodes: [],
        edges: [],
        selectedNodeIds: [],
        projectId: 'project-a',
        projectName: 'test',
        applyOp: vi.fn(() => true),
        undo: vi.fn(),
        canUndo: false,
        generateNodes: vi.fn(),
        open: true,
        setOpen: vi.fn(),
        onLocate: vi.fn(),
      }),
    )

    expect(
      await result.current.apply.deleteProjectRule?.({
        ruleId: 'memory-1',
        kind: 'note',
      }),
    ).toBe(true)
    expect(
      await result.current.apply.deleteProjectRule?.({
        ruleId: 'rule-1',
        kind: 'sourceDeny',
      }),
    ).toBe(true)
    expect(deleteAssistantMemoryAPI).toHaveBeenCalledWith('memory-1')
    expect(deleteProjectRuleAPI).toHaveBeenCalledWith('rule-1')
    expect(
      await result.current.apply.revertAssetWrite?.({
        tool: 'create_folder',
        folderId: 'folder-1',
      }),
    ).toBe(true)
    expect(result.current.apply.canvas?.revertOp('absent')).toBe(false)
  })

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
        onLocate: vi.fn(),
      }),
    )
    expect(result.current.collapseOnOutsidePointer).toBe(false)
    expect(result.current.domain).toBe(ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas)
  })

  it('画布沿用布局 A 面板锚点，头像仍贴右上 16px', () => {
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
        onLocate: vi.fn(),
      }),
    )
    expect(result.current.anchor).toEqual({
      ...STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR,
      avatarTopPx: CANVAS_SHELL_LAYOUT.edgeInsetPx,
      avatarRightPx: CANVAS_SHELL_LAYOUT.edgeInsetPx,
    })
    expect(result.current.anchor?.panelTopPx).toBe(66)
    expect(result.current.anchor?.panelRightPx).toBe(18)
    expect(result.current.anchor?.panelBottomPx).toBe(18)
    expect(result.current.anchor?.avatarStays).toBe(true)
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
          onLocate: vi.fn(),
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
          onLocate: vi.fn(),
        }),
      { initialProps: { nodes, projectId: 'project-a' } },
    )
    return { ...hook, applyOp }
  }

  it('快照带上角色库：画布上的那位标 onCanvas 并带设定，其余只有名字', () => {
    mockLibraryCards.value = [
      {
        id: 'denia',
        name: 'Denia',
        description: '粉发红眼',
        sourceImageUrl: null,
        referenceSlots: [],
        persona: null,
        cardTags: { character: [], appearance: [], loraTrigger: '' },
        workOverride: null,
        generationCount: 0,
      },
      {
        id: 'rixi',
        name: 'Rixi',
        description: null,
        sourceImageUrl: null,
        referenceSlots: [],
        persona: null,
        cardTags: { character: [], appearance: [], loraTrigger: '' },
        workOverride: null,
        generationCount: 3,
      },
    ]
    const placed = {
      ...image('c_1'),
      data: {
        ...image('c_1').data,
        subtype: 'character',
        characterId: 'denia',
      },
    } as NodeV4
    const { result } = setup([placed])
    const characters = result.current.buildSnapshot().canvas?.characters
    mockLibraryCards.value = []
    expect(characters?.total).toBe(2)
    expect(characters?.list[0]).toMatchObject({
      name: 'Denia',
      onCanvas: true,
      profile: { look: '粉发红眼' },
    })
    expect(characters?.list[1]).toMatchObject({ name: 'Rixi', onCanvas: false })
  })

  it('⭐ 文本节点进 @ 列表；这句话里 @ 到的文本节点在快照里给全文', () => {
    const body = `${'剧情推进。'.repeat(150)}结尾`
    const text = {
      id: 'script-1',
      position: { x: 0, y: 0 },
      data: {
        kind: 'text',
        subtype: 'script',
        name: '剧本设定',
        status: 'idle',
        createdAt: '2026-09-21T00:00:00.000Z',
        body,
      },
    } as NodeV4
    const { result } = setup([text])
    expect(result.current.mentionTextNodes).toEqual([
      { id: 'script-1', name: '剧本设定', preview: body.slice(0, 200) },
    ])
    const nodeOf = (latestMessage?: string) =>
      result.current
        .buildSnapshot(latestMessage ? { latestMessage } : undefined)
        .canvas?.shots.flatMap((shot) => (shot.expanded ? shot.nodes : []))
        .find((entry) => entry.id === 'script-1')
    expect(nodeOf()?.textTruncated).toBe(true)
    expect(nodeOf('把 @剧本设定 的第二幕改紧凑一点')).toMatchObject({
      text: body,
    })
  })

  // 方向 B：改动清单要能说出卡名、点一行定位过去。
  it('canvasTargets 现读卡名（卡不在了就是 undefined），locate 交给画布', () => {
    const { result } = setup([image('one', 'https://example.com/one.png')])
    expect(result.current.canvasTargets?.nameOf('one')).toBe('one')
    expect(result.current.canvasTargets?.nameOf('gone')).toBeUndefined()
  })

  it('确认卡按目标 id 现读参数，与新快照一致，改参后不保留旧值', () => {
    const node = image('one')
    if (node.data.kind !== 'image') throw new Error('Expected image')
    node.data.params = { aspectRatio: '3:4', quality: 'high', count: 2 }
    const { result, rerender } = setup([node, image('other')])
    expect(
      result.current.canvasTargets?.generationStateOf?.('one')?.parameters
        ?.values,
    ).toMatchObject(node.data.params)
    const updated = {
      ...node,
      data: { ...node.data, params: { aspectRatio: '16:9', quality: 'low' } },
    }
    rerender({ nodes: [updated, image('other')], projectId: 'project-a' })
    const current = result.current.canvasTargets?.generationStateOf?.('one')
    expect(current?.parameters?.values).toEqual({
      aspectRatio: '16:9',
      quality: 'low',
      count: 1,
    })
    const snapshot = result.current
      .buildSnapshot()
      .canvas?.shots.flatMap((shot) => (shot.expanded ? shot.nodes : []))
      .find((entry) => entry.id === 'one')
    expect(snapshot?.parameters).toEqual(current?.parameters)
    expect(
      result.current.canvasTargets?.generationStateOf?.('gone'),
    ).toBeUndefined()
  })

  it('exposes existing canvas images without requiring node selection', () => {
    const { result } = setup([
      image('one', 'https://example.com/one.png'),
      image('empty'),
      image('duplicate', 'https://example.com/one.png'),
    ])
    expect(result.current.referenceImages).toEqual([
      { url: 'https://example.com/one.png', name: 'one', implicit: true },
    ])
    expect(result.current.referenceLimit).toBeGreaterThan(0)
  })

  // owner 2026-09-29：画布上的图不摆成 chip（`implicit`），手动挂上的才摆；× 只是取消挂上。
  it('pinning a canvas image makes it a chip; removing the chip only unpins it', () => {
    const { result } = setup([image('one', 'https://example.com/one.png')])
    act(() => result.current.apply.addReference('https://example.com/one.png'))
    expect(result.current.referenceImages).toEqual([
      { url: 'https://example.com/one.png', name: 'one' },
    ])
    act(() =>
      result.current.apply.removeReference('https://example.com/one.png'),
    )
    expect(result.current.referenceImages).toEqual([
      { url: 'https://example.com/one.png', name: 'one', implicit: true },
    ])
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
      { url: 'https://example.com/two.png', name: 'two', implicit: true },
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

describe('assistant prompt input review boundary', () => {
  const image = (id: string, prompt?: string): NodeV4 => ({
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'shot',
      name: id,
      status: 'idle',
      createdAt: '2026-09-26T00:00:00.000Z',
      ...(prompt ? { prompt } : {}),
    },
  })
  const referenceEdge: NodeWorkflowEdgeV4 = {
    id: 'reference-edge',
    source: 'source',
    target: 'target',
    sourceHandle: 'out',
    slot: 'reference',
    data: { via: 'mention' },
  }
  function setup(prompt = '原有提示词', edges: NodeWorkflowEdgeV4[] = []) {
    const nodes = [image('source'), image('target', prompt)]
    const applyOp = vi.fn(() => true)
    const undo = vi.fn()
    const hook = renderHook(() =>
      useCanvasOperatorHost({
        nodes,
        edges,
        selectedNodeIds: [],
        projectId: 'project-a',
        projectName: 'test',
        applyOp,
        getApplyError: () => 'graph failure',
        undo,
        canUndo: true,
        generateNodes: vi.fn(),
        open: true,
        setOpen: vi.fn(),
        onLocate: vi.fn(),
      }),
    )
    return { ...hook, nodes, edges, applyOp, undo }
  }

  it.each(['replace', 'append'] as const)(
    '助手 %s 新增引用时原子拒绝，并给出明确连线诊断',
    (mode) => {
      const { result, nodes, edges, applyOp, undo } = setup()
      const before = JSON.stringify({ nodes, edges })
      expect(
        result.current.apply.canvas?.applyOp('write', {
          op: 'set_prompt',
          target: 'target',
          mode,
          prompt: '按 @source 保持身份',
        }),
      ).toBe(false)
      expect(applyOp).not.toHaveBeenCalled()
      expect(JSON.stringify({ nodes, edges })).toBe(before)
      expect(result.current.apply.canvas?.needsPromptInputSync?.()).toBe(true)
      expect(result.current.apply.canvas?.getApplyError?.()).toContain(
        '"op":"connect","source":"source","target":"target","slot":"reference"',
      )
      result.current.apply.canvas?.revertOp('write')
      expect(undo).not.toHaveBeenCalled()
    },
  )

  it('助手删除 mention 引用时不写提示词也不断边，先要求显式断线', () => {
    const { result, nodes, edges, applyOp } = setup('按 @source 保持身份', [
      referenceEdge,
    ])
    const before = JSON.stringify({ nodes, edges })
    expect(
      result.current.apply.canvas?.applyOp('write', {
        op: 'set_prompt',
        target: 'target',
        mode: 'replace',
        prompt: '新的独立肖像',
      }),
    ).toBe(false)
    expect(applyOp).not.toHaveBeenCalled()
    expect(JSON.stringify({ nodes, edges })).toBe(before)
    expect(result.current.apply.canvas?.getApplyError?.()).toContain(
      '"op":"disconnect","edgeId":"reference-edge"',
    )
  })

  it('输入没有改变时正常写入，append 按合并后的全文判断', () => {
    const { result, applyOp, undo } = setup('按 @source 保持身份', [
      referenceEdge,
    ])
    const op = {
      op: 'set_prompt',
      target: 'target',
      mode: 'append',
      prompt: '背景简洁',
    } as const
    expect(result.current.apply.canvas?.applyOp('write', op)).toBe(true)
    expect(applyOp).toHaveBeenCalledWith(op)
    expect(result.current.apply.canvas?.needsPromptInputSync?.()).toBe(false)
    result.current.apply.canvas?.revertOp('write')
    expect(undo).toHaveBeenCalledOnce()
  })

  it('下一条普通失败不沿用输入变更标记或诊断', () => {
    const { result, applyOp } = setup()
    result.current.apply.canvas?.applyOp('write', {
      op: 'set_prompt',
      target: 'target',
      mode: 'replace',
      prompt: '@source',
    })
    applyOp.mockReturnValue(false)
    expect(
      result.current.apply.canvas?.applyOp('model', {
        op: 'set_model',
        target: 'target',
        modelId: 'missing',
      }),
    ).toBe(false)
    expect(result.current.apply.canvas?.needsPromptInputSync?.()).toBe(false)
    expect(result.current.apply.canvas?.getApplyError?.()).toBe('graph failure')
  })

  it('用户原有写入路径仍自动连断引用，撤销同时恢复词和边', () => {
    const state: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [image('source'), image('target', '原词')],
      edges: [],
    }
    let id = 0
    const context = {
      refs: new Map<string, string>(),
      mintId: (prefix: string) => `${prefix}-${++id}`,
    }
    const added = applyNodeAssistantOpV4(
      state,
      {
        op: 'set_prompt',
        target: 'target',
        mode: 'replace',
        prompt: '@source 新词',
      },
      context,
    )
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(added.state.edges).toHaveLength(1)
    const removed = applyNodeAssistantOpV4(
      added.state,
      {
        op: 'set_prompt',
        target: 'target',
        mode: 'replace',
        prompt: '没有引用',
      },
      context,
    )
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.state.edges).toHaveLength(0)
    const restored = applyInverseV4(removed.state, removed.inverse, context)
    expect(restored.edges).toEqual(added.state.edges)
    expect(
      restored.nodes.find((node) => node.id === 'target')?.data,
    ).toMatchObject({
      prompt: '@source 新词',
    })
  })
})
