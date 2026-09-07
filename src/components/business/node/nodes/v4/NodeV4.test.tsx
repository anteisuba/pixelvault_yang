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
  Position: { Left: 'left', Right: 'right' },
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

import { AudioNodeV4, ImageNodeV4 } from './MediaNodeV4'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'
import { TextNodeV4 } from './TextNodeV4'
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
        node('v_02', { kind: 'video', subtype: 'shot', shotNo: 2 }),
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
  it('文本节点收起态显示标题与字数段数，展开态渲染 Markdown', () => {
    const state = scene()
    const { rerender } = renderNode(TextNodeV4, 't_02', harness(state))
    expect(screen.getByText('S02')).toBeInTheDocument()
    expect(screen.getByText('textMeta')).toBeInTheDocument()
    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument()

    const expanded = harness(state, { expandedNodeId: 't_02' })
    rerender(
      <NodeV4CanvasProvider value={expanded}>
        {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
        <TextNodeV4 id="t_02" data={state.nodes[0]!.data} selected={false} />
      </NodeV4CanvasProvider>,
    )
    expect(screen.getByTestId('markdown')).toBeInTheDocument()
  })

  it('文本节点展开后可切编辑态，失焦即存', () => {
    const state = scene()
    const onEditText = vi.fn()
    renderNode(
      TextNodeV4,
      't_02',
      harness(state, { expandedNodeId: 't_02', onEditText }),
    )
    fireEvent.click(screen.getByText('editText'))
    const editor = screen.getByLabelText('editText')
    fireEvent.change(editor, { target: { value: '改过的正文' } })
    fireEvent.blur(editor)
    expect(onEditText).toHaveBeenCalledWith('t_02', '改过的正文')
  })

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
  it('助手改过的节点带描边与角标', () => {
    const state = scene()
    const { container } = renderNode(
      ImageNodeV4,
      'i_kf',
      harness(state, { changedNodeIds: ['i_kf'] }),
    )
    const card = container.querySelector('[data-changed="true"]')
    expect(card).toBeInTheDocument()
    expect(card?.className).toContain('outline-primary')
  })
})

describe('文本派生工具条（§8）', () => {
  it('五个动作都在，点了把动作交给画布', () => {
    const state = scene()
    const onDeriveFromText = vi.fn()
    const { container } = renderNode(
      TextNodeV4,
      't_02',
      harness(state, { expandedNodeId: 't_02', onDeriveFromText }),
    )
    const actions = [...container.querySelectorAll('[data-derive-action]')].map(
      (element) => element.getAttribute('data-derive-action'),
    )
    expect(actions).toEqual([
      'shotImage',
      'video',
      'character',
      'background',
      'askAssistant',
    ])
    fireEvent.click(screen.getByText('derive.video'))
    expect(onDeriveFromText).toHaveBeenCalledWith('t_02', 'video')
  })
})
