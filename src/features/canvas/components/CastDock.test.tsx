import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}))

const { flowState, mockFocusNode } = vi.hoisted(() => ({
  flowState: {
    nodes: [] as Array<Record<string, unknown>>,
    edges: [] as Array<Record<string, unknown>>,
  },
  mockFocusNode: vi.fn(),
}))

vi.mock('@xyflow/react', () => ({
  useNodes: () => flowState.nodes,
  useEdges: () => flowState.edges,
}))

vi.mock('./nodes/v4/NodeV4ActionsBridge', () => ({
  useNodeCanvasActions: () => ({
    focusNode: mockFocusNode,
  }),
}))

import { NODE_STATUS_IDS } from '@/constants/node-types'

import { CastDock, countCanvasNodes } from './CastDock'

// G1（画布修法 P2）：CastDock 的 query 从内部 `useState` 改成了 controlled
// prop（`CanvasRosterRail` 现在拿同一份 query 去过滤下段的卡片区）。这个壳
// 在测试里补回「自己管理 state」的那部分，让既有的输入/断言写法不用大改。
function ControlledCastDock() {
  const [query, setQuery] = useState('')
  return <CastDock query={query} onQueryChange={setQuery} />
}

/**
 * ⚠ ③d-4：定位器只吃 v4 节点。分组就是 `kind`，类型名读**子型标签表**，
 * 显示名就是稳定名 `data.name`。
 */
function makeNode(
  id: string,
  kind: string,
  subtype: string,
  data: Record<string, unknown> = {},
) {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    data: {
      kind,
      subtype,
      name: id,
      status: NODE_STATUS_IDS.idle,
      createdAt: '2026-09-08T00:00:00.000Z',
      ...data,
    },
  }
}

describe('CastDock all-node locator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    flowState.nodes = []
    flowState.edges = []
  })

  it('groups every live node by modality and renders each exactly once', () => {
    flowState.nodes = [
      makeNode('text-1', 'text', 'script', { name: '第一镜', body: '' }),
      makeNode('image-1', 'image', 'character', {
        name: '黛西',
        url: 'https://cdn.example.com/daisy.png',
      }),
      makeNode('audio-1', 'audio', 'voice', { name: '旁白' }),
      makeNode('video-1', 'video', 'shot', {
        name: '渡轮甲板',
        label: '渡轮甲板',
      }),
      makeNode('video-2', 'video', 'clip', { name: '雨夜参考' }),
    ]

    render(<ControlledCastDock />)

    expect(screen.getByText('groups.text')).toBeInTheDocument()
    expect(screen.getByText('groups.image')).toBeInTheDocument()
    expect(screen.getByText('groups.audio')).toBeInTheDocument()
    expect(screen.getByText('groups.video')).toBeInTheDocument()
    expect(screen.getByText('第一镜')).toBeInTheDocument()
    expect(screen.getByText('黛西')).toBeInTheDocument()
    expect(screen.getByText('旁白')).toBeInTheDocument()
    expect(screen.getByText('渡轮甲板')).toBeInTheDocument()
    expect(screen.getByText('雨夜参考')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('搜索同时认稳定名、子型标签与提示词', () => {
    flowState.nodes = [
      makeNode('image-1', 'image', 'background', {
        name: '码头',
        prompt: '潮湿的海边与远处灯塔',
      }),
      makeNode('voice-1', 'audio', 'voice', { name: '旁白' }),
    ]

    render(<ControlledCastDock />)
    const search = screen.getByRole('searchbox', { name: 'searchLabel' })

    fireEvent.change(search, { target: { value: '灯塔' } })
    expect(screen.getByText('码头')).toBeInTheDocument()
    expect(screen.queryByText('旁白')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '旁' } })
    expect(screen.queryByText('码头')).not.toBeInTheDocument()
    expect(screen.getByText('旁白')).toBeInTheDocument()
  })

  it('selects and locates the real node without opening a detail surface', () => {
    flowState.nodes = [
      makeNode('image-1', 'image', 'character', { name: '黛西' }),
    ]

    render(<ControlledCastDock />)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'locateNode {"name":"黛西"}',
      }),
    )

    expect(mockFocusNode).toHaveBeenCalledWith('image-1')
  })

  // 包 H（画布修法《手机 390px》）：手机定位器传 `onSelectNode` 换掉点击目标
  // （打开只读预览，而不是飞一个用户看不见的画布相机）。默认行为（上一个用例）
  // 必须保持字节不变，这里只加一个用例覆盖新分支，不改旧的。
  it('calls onSelectNode instead of focusNode when provided', () => {
    flowState.nodes = [
      makeNode('image-1', 'image', 'character', { name: '黛西' }),
    ]
    const onSelectNode = vi.fn()

    function ControlledWithSelect() {
      const [query, setQuery] = useState('')
      return (
        <CastDock
          query={query}
          onQueryChange={setQuery}
          onSelectNode={onSelectNode}
        />
      )
    }

    render(<ControlledWithSelect />)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'locateNode {"name":"黛西"}',
      }),
    )

    expect(onSelectNode).toHaveBeenCalledWith('image-1')
    expect(mockFocusNode).not.toHaveBeenCalled()
  })

  it('shows outgoing reference counts but no create, edit, or delete controls', () => {
    flowState.nodes = [
      makeNode('source', 'image', 'character', { name: '黛西' }),
      makeNode('target', 'video', 'shot', {
        name: '镜头视频',
        label: '镜头视频',
      }),
    ]
    flowState.edges = [
      { id: 'edge-1', source: 'source', target: 'target' },
      { id: 'edge-2', source: 'source', target: 'target-2' },
    ]

    render(<ControlledCastDock />)

    expect(screen.getByText('referenceCount {"count":2}')).toBeInTheDocument()
    expect(screen.queryByText('create')).not.toBeInTheDocument()
    expect(screen.queryByText('deleteCard')).not.toBeInTheDocument()
  })

  // G1（画布修法 P2）：query 现在是纯 controlled prop——组件自己不再持有任何
  // 输入历史。这是「同一个 query 也能喂给 CanvasRosterRail 下段卡片区」这个
  // 修法的前提，得单独锁住，免得日后又长回内部 `useState`。
  it('is a controlled input — reports changes via onQueryChange instead of owning state', () => {
    flowState.nodes = [makeNode('voice-1', 'audio', 'voice', { name: '旁白' })]
    const onQueryChange = vi.fn()

    render(<CastDock query="" onQueryChange={onQueryChange} />)
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '旁' },
    })

    expect(onQueryChange).toHaveBeenCalledWith('旁')
    // The parent never echoed the new value back in (`query` prop is still
    // ""), so the list must not have filtered itself off private state.
    expect(screen.getByText('旁白')).toBeInTheDocument()
  })

  it('distinguishes an empty canvas from a search with no matches', () => {
    const { rerender } = render(<ControlledCastDock />)
    expect(screen.getByText('empty')).toBeInTheDocument()

    flowState.nodes = [makeNode('voice-1', 'audio', 'voice', { name: '旁白' })]
    rerender(<ControlledCastDock />)
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '不存在' },
    })
    expect(screen.getByText('noResults')).toBeInTheDocument()
  })

  it('counts all canvas nodes for the left-panel header', () => {
    expect(
      countCanvasNodes([
        makeNode('a', 'text', 'script', { body: '' }),
        makeNode('b', 'audio', 'voice'),
        makeNode('c', 'video', 'shot', { label: 'S01' }),
      ] as never),
    ).toBe(3)
  })
})
