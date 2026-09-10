import type { NodeProps } from '@xyflow/react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// ReactFlow 的 `Handle` 在测试里没有 store，桩成一个带 data-* 的 span 就够——
// 本组测试要断言的是「哪些槽渲染成了端口、拖线时点不点亮」，不是 ReactFlow 内部。
vi.mock('@xyflow/react', () => ({
  Handle: (props: Record<string, unknown>) => (
    <span
      data-testid="handle"
      data-slot={props['data-slot'] as string}
      data-output={props['data-output'] as string}
      data-lit={props['data-lit'] as string}
      data-type={props.type as string}
    />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top' },
  // `NodeResizer` / `NodeToolbar` 同样要 ReactFlow 的 store。桩成可断言的壳：
  // 工具条要能点（删除/克隆/审核都从它出去），resizer 只需存在性。
  NodeResizer: (props: Record<string, unknown>) => (
    <span data-testid="resizer" data-visible={String(props.isVisible)} />
  ),
  NodeToolbar: (props: Record<string, unknown>) =>
    props.isVisible ? (
      <div data-testid="node-toolbar">{props.children as ReactNode}</div>
    ) : null,
}))

vi.mock('@/components/ui/markdown', () => ({
  Markdown: ({ children }: { children: ReactNode }) => (
    <div data-testid="markdown">{children}</div>
  ),
}))

vi.mock('@/components/ui/audio-player', () => ({
  AudioPlayer: ({ src }: { src: string }) => (
    <div data-testid="audio">{src}</div>
  ),
}))

import { reconcileStateSlots } from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import { AudioNodeV4 } from './MediaNodeV4'
import { ImageNodeV4 } from './ImageNodeV4'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'
import { VideoNodeV4 } from './VideoNodeV4'

const NOW = '2026-09-07T00:00:00.000Z'

function node(
  id: string,
  data: Partial<NodeV4['data']> & { kind: NodeV4['data']['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      name: id,
      status: 'idle',
      createdAt: NOW,
      ...data,
    } as NodeV4['data'],
  }
}

function scene(): NodeWorkflowStateV4 {
  return reconcileStateSlots(
    {
      version: 4,
      nodes: [
        node('t_02', {
          kind: 'text',
          subtype: 'shotNote',
          body: '# S02\n\n控制室广角\n\n第二段',
        }),
        node('i_kf', {
          kind: 'image',
          subtype: 'shot',
          url: 'https://cdn.test/kf.png',
        }),
        node('i_kf2', {
          kind: 'image',
          subtype: 'shot',
          url: 'https://cdn.test/kf2.png',
        }),
        node('a_v', {
          kind: 'audio',
          subtype: 'voice',
          url: 'https://cdn.test/v.mp3',
          durationSec: 4,
        }),
        // `video.shot` 的 `label` 必填 —— 稳定名就是它，`S02` 只是显示前缀。
        node('v_02', {
          kind: 'video',
          subtype: 'shot',
          shotNo: 2,
          label: '有人还在',
        }),
      ],
      edges: [
        {
          id: 'e1',
          source: 'i_kf',
          sourceHandle: 'out',
          target: 'v_02',
          slot: 'firstFrame',
        },
        {
          id: 'e2',
          source: 'i_kf2',
          sourceHandle: 'out',
          target: 'v_02',
          slot: 'firstFrame',
        },
        {
          id: 'e3',
          source: 'a_v',
          sourceHandle: 'out',
          target: 'v_02',
          slot: 'voice',
        },
        {
          id: 'e4',
          source: 't_02',
          sourceHandle: 'out',
          target: 'v_02',
          slot: 'text',
        },
      ],
    },
    { now: NOW },
  )
}

function harness(
  state: NodeWorkflowStateV4,
  overrides: Partial<NodeV4CanvasContextValue> = {},
): NodeV4CanvasContextValue {
  return {
    nodes: state.nodes,
    edges: state.edges,
    draggingFrom: null,
    changedNodeIds: [],
    expandedNodeId: null,
    onToggleExpanded: vi.fn(),
    onSelectSlotVersion: vi.fn(),
    onDisconnectSlot: vi.fn(),
    onFocusNode: vi.fn(),
    onEditText: vi.fn(),
    onDeriveFromText: vi.fn(),
    modelOptionsByKind: {},
    onSetPrompt: vi.fn(),
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onApplyOp: vi.fn(),
    onTidyLayout: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    selectedNodeIds: [],
    ...overrides,
  }
}

function renderNode(
  Component: (props: NodeProps) => ReactNode,
  nodeId: string,
  context: NodeV4CanvasContextValue,
) {
  const target = context.nodes.find((item) => item.id === nodeId)!
  return render(
    <NodeV4CanvasProvider value={context}>
      {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
      <Component id={nodeId} data={target.data} selected={false} />
    </NodeV4CanvasProvider>,
  )
}

describe('四类节点的两态渲染', () => {
  it('图片节点收起态显示缩略图', () => {
    const state = scene()
    renderNode(ImageNodeV4, 'i_kf', harness(state))
    expect(screen.getByAltText('i_kf')).toHaveAttribute(
      'src',
      'https://cdn.test/kf.png',
    )
  })

  it('音频节点收起态显示时长条，展开态出播放器', () => {
    const state = scene()
    renderNode(AudioNodeV4, 'a_v', harness(state))
    expect(screen.getByText('audioDuration')).toBeInTheDocument()
    expect(screen.queryByTestId('audio')).not.toBeInTheDocument()

    renderNode(AudioNodeV4, 'a_v', harness(state, { expandedNodeId: 'a_v' }))
    expect(screen.getByTestId('audio')).toBeInTheDocument()
  })

  it('镜头节点展开态是固定版式：上排文本槽摘要，下排四槽卡', () => {
    const state = scene()
    const { container } = renderNode(
      VideoNodeV4,
      'v_02',
      harness(state, { expandedNodeId: 'v_02' }),
    )
    const textRow = container.querySelector('[data-shot-row="text"]')!
    expect(within(textRow as HTMLElement).getByText(/t_02/)).toBeInTheDocument()
    const mediaRow = container.querySelector('[data-shot-row="media"]')!
    expect(
      [...mediaRow.querySelectorAll('[data-slot-id]')].map((element) =>
        element.getAttribute('data-slot-id'),
      ),
      // 顺序 = 端口表的槽顺序，text 槽在上排不重复出现
    ).toEqual(['firstFrame', 'lastFrame', 'reference', 'voice'])
  })

  it('镜头卡头显示 `S02·label`——序号是显示前缀，落库的是 label 与 shotNo', () => {
    const state = scene()
    renderNode(VideoNodeV4, 'v_02', harness(state))
    expect(screen.getByText('S02·有人还在')).toBeInTheDocument()
    // ⛔ 存的不是这一串：节点自己的 name 与 label 都不带前缀。
    const stored = state.nodes.find((item) => item.id === 'v_02')!.data
    expect(stored.kind === 'video' && stored.label).toBe('有人还在')
  })

  it('文本槽的每一项带角色小标（C1 契约修正 2）', () => {
    const state = scene()
    const { container } = renderNode(
      VideoNodeV4,
      'v_02',
      harness(state, { expandedNodeId: 'v_02' }),
    )
    const textRow = container.querySelector('[data-shot-row="text"]')!
    expect(
      [...textRow.querySelectorAll('[data-text-role]')].map((element) =>
        element.getAttribute('data-text-role'),
      ),
      // t_02 是 shotNote 子型 → 推不出角色，按缺省 script 落
    ).toEqual(['script'])
  })

  it('空槽渲染成虚线 + 槽名', () => {
    const state = scene()
    const { container } = renderNode(
      VideoNodeV4,
      'v_02',
      harness(state, { expandedNodeId: 'v_02' }),
    )
    const lastFrame = container.querySelector('[data-slot-id="lastFrame"]')!
    expect(lastFrame.getAttribute('data-slot-empty')).toBe('true')
    expect(lastFrame.className).toContain('border-dashed')
  })
})

describe('具名端口与拖线点亮', () => {
  it('镜头节点按端口表渲染五个具名入口 + out/tailFrame 两个出口', () => {
    const state = scene()
    const { container } = renderNode(VideoNodeV4, 'v_02', harness(state))
    const inputs = [...container.querySelectorAll('[data-type="target"]')].map(
      (element) => element.getAttribute('data-slot'),
    )
    expect(inputs).toEqual([
      'firstFrame',
      'lastFrame',
      'reference',
      'voice',
      'text',
    ])
    const outputs = [...container.querySelectorAll('[data-type="source"]')].map(
      (element) => element.getAttribute('data-output'),
    )
    expect(outputs).toEqual(['out', 'tailFrame'])
  })

  it('从图片拖线时只点亮 firstFrame/lastFrame/reference，其余变灰', () => {
    const state = scene()
    const { container } = renderNode(
      VideoNodeV4,
      'v_02',
      harness(state, { draggingFrom: 'i_kf' }),
    )
    const lit = [...container.querySelectorAll('[data-type="target"]')]
      .filter((element) => element.getAttribute('data-lit') === 'true')
      .map((element) => element.getAttribute('data-slot'))
    expect(lit).toEqual(['firstFrame', 'lastFrame', 'reference'])
    const dim = [...container.querySelectorAll('[data-type="target"]')]
      .filter((element) => element.getAttribute('data-lit') === 'false')
      .map((element) => element.getAttribute('data-slot'))
    expect(dim).toEqual(['voice', 'text'])
  })

  it('从文本拖线时只点亮 text 槽', () => {
    const state = scene()
    const { container } = renderNode(
      VideoNodeV4,
      'v_02',
      harness(state, { draggingFrom: 't_02' }),
    )
    const lit = [...container.querySelectorAll('[data-type="target"]')]
      .filter((element) => element.getAttribute('data-lit') === 'true')
      .map((element) => element.getAttribute('data-slot'))
    expect(lit).toEqual(['text'])
  })

  it('script 已满时 text 槽仍然点亮——会落 style，⛔ 不表现成「连不上」', () => {
    const state = scene()
    // 场景里 t_02 已经占了 script（0..1）。再拖一份剧本子型的文本过来。
    const withSecondScript: NodeWorkflowStateV4 = {
      ...state,
      nodes: [
        ...state.nodes,
        node('t_script', { kind: 'text', subtype: 'script', body: '第二份' }),
      ],
    }
    const { container } = renderNode(
      VideoNodeV4,
      'v_02',
      harness(withSecondScript, { draggingFrom: 't_script' }),
    )
    const lit = [...container.querySelectorAll('[data-type="target"]')]
      .filter((element) => element.getAttribute('data-lit') === 'true')
      .map((element) => element.getAttribute('data-slot'))
    expect(lit).toEqual(['text'])
  })
})

describe('槽内版本轮播', () => {
  it('两版首帧显示 1/2 计数，翻页不改 cur，点「设为当前」才改', () => {
    const state = scene()
    const onSelectSlotVersion = vi.fn()
    const { container } = renderNode(
      VideoNodeV4,
      'v_02',
      harness(state, { expandedNodeId: 'v_02', onSelectSlotVersion }),
    )
    const firstFrame = container.querySelector(
      '[data-slot-id="firstFrame"]',
    ) as HTMLElement
    // reconcile 把最后一条边设为当前 → 2/2
    expect(within(firstFrame).getByText('2/2')).toBeInTheDocument()
    expect(within(firstFrame).queryByText('setCurrent')).not.toBeInTheDocument()

    fireEvent.click(within(firstFrame).getByLabelText('versionPrev'))
    expect(within(firstFrame).getByText('1/2')).toBeInTheDocument()
    // 翻着看不产生修改
    expect(onSelectSlotVersion).not.toHaveBeenCalled()

    fireEvent.click(within(firstFrame).getByText('setCurrent'))
    expect(onSelectSlotVersion).toHaveBeenCalledWith(
      'v_02',
      'firstFrame',
      'sv_e1',
    )
  })

  it('点槽内内容 = 平移到源节点，不是打开它', () => {
    const state = scene()
    const onFocusNode = vi.fn()
    const { container } = renderNode(
      VideoNodeV4,
      'v_02',
      harness(state, { expandedNodeId: 'v_02', onFocusNode }),
    )
    const voice = container.querySelector(
      '[data-slot-id="voice"]',
    ) as HTMLElement
    fireEvent.click(within(voice).getByRole('button', { name: 'a_v' }))
    expect(onFocusNode).toHaveBeenCalledWith('a_v')
  })
})

describe('变更高亮（§7）', () => {
  /**
   * ⚠ 主语从图片卡换成镜头卡（2026-09-10 · S3）：图片卡已换到 `NodeCardShell`，
   * 而变更高亮住在旧的 `NodeV4Shell` 上。`NodeCardShell` 还没有「这张卡被助手改过」
   * 这个入口 —— 缺口记在 S3 的报告里，⛔ 不在这里给图片卡补一份私有高亮。
   */
  it('助手改过的节点带描边与角标', () => {
    const state = scene()
    const { container } = renderNode(
      VideoNodeV4,
      'v_02',
      harness(state, { changedNodeIds: ['v_02'] }),
    )
    const card = container.querySelector('[data-changed="true"]')
    expect(card).toBeInTheDocument()
    expect(card?.className).toContain('outline-primary')
  })
})
