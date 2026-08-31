import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

import {
  computeSpawnPosition,
  inferComposerHost,
  resolveComposerPlaceholderKey,
  useGenerateComposer,
} from './use-generate-composer'

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Partial<NodeWorkflowNodeData> = {},
  selected = false,
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 100, y: 200 },
    selected,
    data: { prompt: '', status: 'idle', ...data } as NodeWorkflowNodeData,
  }
}

describe('inferComposerHost (§7.5 宿主推断)', () => {
  it('returns null when nothing is selected', () => {
    expect(inferComposerHost(null)).toBeNull()
  })

  it('locks image mode for every image-kind node type, empty vs populated', () => {
    const empty = inferComposerHost(makeNode('n1', NODE_TYPE_IDS.image))
    expect(empty).toEqual({
      nodeId: 'n1',
      mode: 'image',
      hasMedia: false,
      mediaUrl: undefined,
      mediaLabel: undefined,
    })

    // ⚠ 这里原本用的是 `characterImage` —— 那是**卡片**，现在不再是生成宿主（见下一条）。
    // 换成 shot（镜头图），它才是「图」这一侧、生成真正的落点。
    const populated = inferComposerHost(
      makeNode('n2', NODE_TYPE_IDS.shot, {
        mediaUrl: 'https://cdn.test/a.png',
        mediaLabel: '镜头A',
      }),
    )
    expect(populated).toEqual({
      nodeId: 'n2',
      mode: 'image',
      hasMedia: true,
      mediaUrl: 'https://cdn.test/a.png',
      mediaLabel: '镜头A',
    })
  })

  it('卡片不是生成宿主 —— 角色卡/背景卡都不挂生成框', () => {
    // 卡片是身份档案夹：收集同一个主体的图，自己不产图。要出图就落在图片节点上，
    // 卡片只负责引用（owner 2026-08-08）。
    //
    // ⚠ 此前的判据是「媒体种类」，而卡片的 kind 也是 image，于是生成框直接挂到了
    // 角色卡上 —— 判据必须是 role，那个维度才分得出卡片和图。
    for (const node of [
      // 统一 image 节点 + 卡片 role
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
      }),
      makeNode('c2', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.background,
      }),
      // 两个旧类型：名字里带 Image，渲染的其实是卡片，存量图里还有
      makeNode('c3', NODE_TYPE_IDS.characterImage),
      makeNode('c4', NODE_TYPE_IDS.backgroundImage),
    ]) {
      expect(inferComposerHost(node), node.id).toBeNull()
    }
  })

  it('图这一侧照常当宿主 —— 镜头/关键帧/特写不受影响', () => {
    for (const role of [
      NODE_IMAGE_ROLE_IDS.shot,
      NODE_IMAGE_ROLE_IDS.frame,
      NODE_IMAGE_ROLE_IDS.closeup,
    ]) {
      const host = inferComposerHost(
        makeNode(`i-${role}`, NODE_TYPE_IDS.image, { role }),
      )
      expect(host?.mode, role).toBe('image')
    }
  })

  it('locks audio mode for a voice node', () => {
    const host = inferComposerHost(makeNode('n3', NODE_TYPE_IDS.voice))
    expect(host?.mode).toBe('audio')
  })

  it('does not attach for video/text/other families (§3 — video stays on 组装台)', () => {
    expect(inferComposerHost(makeNode('n4', NODE_TYPE_IDS.seedance))).toBeNull()
    expect(inferComposerHost(makeNode('n5', NODE_TYPE_IDS.shotText))).toBeNull()
    expect(inferComposerHost(makeNode('n6', NODE_TYPE_IDS.composer))).toBeNull()
  })

  it('treats a blank/whitespace mediaUrl as empty, not populated', () => {
    const host = inferComposerHost(
      makeNode('n7', NODE_TYPE_IDS.image, { mediaUrl: '   ' }),
    )
    expect(host?.hasMedia).toBe(false)
  })
})

describe('resolveComposerPlaceholderKey (§4/《画布修法》02 节刀 1 按物种说话)', () => {
  it('image 宿主：空态与编辑态两条既有文案不回归', () => {
    expect(resolveComposerPlaceholderKey('image', false)).toBe(
      'placeholderEmpty',
    )
    expect(resolveComposerPlaceholderKey('image', true)).toBe(
      'placeholderEditing',
    )
  })

  it('voice 宿主：空态与有内容态必须落声音文案，不能沿用图片那两条（旧 bug）', () => {
    expect(resolveComposerPlaceholderKey('audio', false)).toBe(
      'placeholderEmptyAudio',
    )
    expect(resolveComposerPlaceholderKey('audio', true)).toBe(
      'placeholderEditingAudio',
    )
    // ⚠ 这条锁的正是旧 bug 本身：旧实现只读 hasMedia 一维，空音色卡
    // （mode='audio', hasMedia=false）会落进图片的空态键。
    expect(resolveComposerPlaceholderKey('audio', false)).not.toBe(
      'placeholderEmpty',
    )
  })
})

describe('computeSpawnPosition (§7 新卡落原卡右侧)', () => {
  it('places the first new node to the right using the shared derivedImage offset', () => {
    const pos = computeSpawnPosition({ x: 0, y: 0 }, 0)
    expect(pos).toEqual({ x: 460, y: 0 })
  })

  it('wraps into a new row after `columns` new nodes (matches placeDerivedImages grid)', () => {
    // derivedImage.columns = 3 — index 3 should start row 2, column 0.
    const first = computeSpawnPosition({ x: 100, y: 100 }, 0)
    const third = computeSpawnPosition({ x: 100, y: 100 }, 2)
    const fourth = computeSpawnPosition({ x: 100, y: 100 }, 3)
    expect(first.y).toBe(third.y)
    expect(fourth.y).toBeGreaterThan(first.y)
    expect(fourth.x).toBe(first.x)
  })
})

// ---- Hook-level behavior ----

const { graphState, actions } = vi.hoisted(() => ({
  graphState: { nodes: [] as NodeWorkflowNode[] },
  actions: {
    // ⚠ 形参必须显式写出来。`vi.fn(async () => …)` 推出来的是**零参**函数，
    // 于是 `mock.calls[0]` 的类型是空元组 `[]`，下面读 `calls[0][0]` 会报
    // TS2493（运行期照样能拿到值，所以 vitest 绿而 tsc 红）。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 形参只为撑出元组类型，见上方说明；项目 eslint 未开 argsIgnorePattern
    runGenerateComposer: vi.fn(async (_input: unknown) => ['new-node-1']),
    heavyOverlayOpen: false,
    transientLayerOpen: false,
    multiSelectActive: false,
    quickEditNodeId: null as string | null,
  },
}))

vi.mock('@xyflow/react', () => ({
  useNodes: () => graphState.nodes,
}))

vi.mock('@/components/business/node/NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => actions,
}))

describe('useGenerateComposer (hook-level)', () => {
  it('is hidden with no selection, attaches on a single image node, hides again on multi-select', () => {
    graphState.nodes = []
    const { result, rerender } = renderHook(() => useGenerateComposer())
    expect(result.current.visibility).toBe('hidden')

    graphState.nodes = [makeNode('img1', NODE_TYPE_IDS.image, {}, true)]
    rerender()
    expect(result.current.visibility).toBe('attached')
    expect(result.current.host?.nodeId).toBe('img1')

    graphState.nodes = [
      makeNode('img1', NODE_TYPE_IDS.image, {}, true),
      makeNode('img2', NODE_TYPE_IDS.image, {}, true),
    ]
    rerender()
    expect(result.current.visibility).toBe('hidden')

    graphState.nodes = []
  })

  it('disables send with reason noModel until a model is chosen', () => {
    graphState.nodes = [makeNode('img1', NODE_TYPE_IDS.image, {}, true)]
    const { result } = renderHook(() => useGenerateComposer())
    expect(result.current.disabledReason).toBe('noModel')

    act(() => {
      result.current.setModelSelection({
        optionId: 'opt1',
        modelId: 'model1',
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        // `providerConfig` 是 NodeWorkflowModelSelectionSchema 的必填字段
        // （types/node-workflow.ts:63）——省掉它 vitest 照样绿（运行期没人读），
        // 但 tsc 会报 TS2345。测试替身要跟真类型对齐，否则它守不住任何东西。
        providerConfig: { label: 'OpenAI', baseUrl: 'https://api.test/v1' },
      })
    })
    // Still needs a prompt (empty host has no pinned reference to fall back on).
    expect(result.current.disabledReason).toBe('noInput')

    graphState.nodes = []
  })

  it('audio mode is always disabled with reason noModel (§8 占位，本轮不发送)', () => {
    graphState.nodes = [makeNode('voice1', NODE_TYPE_IDS.voice, {}, true)]
    const { result } = renderHook(() => useGenerateComposer())
    expect(result.current.mode).toBe('audio')
    expect(result.current.disabledReason).toBe('noModel')
    graphState.nodes = []
  })

  it('send() calls runGenerateComposer with the host + draft shape and keeps the draft (§7 owner 2026-07-28 defect ②)', async () => {
    actions.runGenerateComposer.mockClear()
    graphState.nodes = [
      makeNode(
        'img1',
        NODE_TYPE_IDS.image,
        { mediaUrl: 'https://cdn.test/host.png' },
        true,
      ),
    ]
    const { result, rerender } = renderHook(() => useGenerateComposer())

    act(() => {
      result.current.setModelSelection({
        optionId: 'opt1',
        modelId: 'model1',
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        // `providerConfig` 是 NodeWorkflowModelSelectionSchema 的必填字段
        // （types/node-workflow.ts:63）——省掉它 vitest 照样绿（运行期没人读），
        // 但 tsc 会报 TS2345。测试替身要跟真类型对齐，否则它守不住任何东西。
        providerConfig: { label: 'OpenAI', baseUrl: 'https://api.test/v1' },
      })
    })
    rerender()
    act(() => {
      result.current.setPromptDraft('让她笑一点')
    })
    rerender()
    expect(result.current.canSend).toBe(true)

    await act(async () => {
      result.current.send()
    })

    expect(actions.runGenerateComposer).toHaveBeenCalledTimes(1)
    const input = actions.runGenerateComposer.mock.calls[0][0]
    expect(input).toMatchObject({
      hostNodeId: 'img1',
      hostHasMedia: true,
      prompt: '让她笑一点',
      model: { optionId: 'opt1', modelId: 'model1' },
      referenceUrls: ['https://cdn.test/host.png'],
    })

    rerender()
    // §7 owner 2026-07-28 defect ②: the old "optimistic reset" cleared the
    // draft before the send was even known to succeed — a failure lost the
    // user's exact words. Spec now requires "发送后保留全部草稿" so the box
    // stays ready to tweak-and-resend. This mock never moves selection away
    // from 'img1' (it doesn't touch graphState.nodes), so this only proves
    // the in-place-fill path — see the next test for the host-moves-to-a-
    // new-sibling path (the more common img2img case).
    expect(result.current.promptDraft).toBe('让她笑一点')

    graphState.nodes = []
  })

  it('carries the draft forward when send() moves the host to a brand new sibling node (§7 owner 2026-07-28 defect ②)', async () => {
    // Mirrors the MOST common send shape per canvas-generate-composer.md §7:
    // an existing (has-media) host always spawns a NEW sibling on send, and
    // `handleRunGenerateComposer` moves selection to it SYNCHRONOUSLY, before
    // its own first await — simulated here by having the mock mutate
    // `graphState.nodes` before it returns, exactly like the real
    // implementation in StudioNodeWorkbench.tsx does.
    actions.runGenerateComposer.mockClear()
    graphState.nodes = [
      makeNode(
        'img1',
        NODE_TYPE_IDS.image,
        { mediaUrl: 'https://cdn.test/host.png' },
        true,
      ),
    ]
    actions.runGenerateComposer.mockImplementationOnce(async () => {
      graphState.nodes = [
        makeNode(
          'img1',
          NODE_TYPE_IDS.image,
          { mediaUrl: 'https://cdn.test/host.png' },
          false,
        ),
        makeNode(
          'img2',
          NODE_TYPE_IDS.image,
          { mediaUrl: 'https://cdn.test/host.png' },
          true,
        ),
      ]
      return ['img2']
    })
    const { result, rerender } = renderHook(() => useGenerateComposer())

    act(() => {
      result.current.setModelSelection({
        optionId: 'opt1',
        modelId: 'model1',
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        providerConfig: { label: 'OpenAI', baseUrl: 'https://api.test/v1' },
      })
    })
    rerender()
    act(() => {
      result.current.setPromptDraft('换成夜景')
    })
    rerender()

    await act(async () => {
      result.current.send()
    })
    rerender()

    // Selection has moved to the new sibling — and the box still shows the
    // exact text that was just sent, not a blank box for the fresh node.
    expect(result.current.host?.nodeId).toBe('img2')
    expect(result.current.promptDraft).toBe('换成夜景')

    graphState.nodes = []
  })
})
