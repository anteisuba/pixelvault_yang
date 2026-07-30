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

vi.mock('./NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    focusNode: mockFocusNode,
  }),
}))

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'

import { CastDock, countCanvasNodes } from './CastDock'

function makeNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: NODE_STATUS_IDS.idle, ...data },
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
      makeNode('text-1', NODE_TYPE_IDS.shotText, {
        mediaLabel: '第一镜',
      }),
      makeNode('image-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
        mediaUrl: 'https://cdn.example.com/daisy.png',
      }),
      makeNode('audio-1', NODE_TYPE_IDS.voice, { voiceName: '旁白' }),
      makeNode('video-1', NODE_TYPE_IDS.seedance, {
        mediaLabel: '渡轮甲板',
      }),
      makeNode('video-2', NODE_TYPE_IDS.videoReference, {
        mediaLabel: '雨夜参考',
      }),
    ]

    render(<CastDock />)

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

  it('searches display name, localized type, prompt, and image role', () => {
    flowState.nodes = [
      makeNode('image-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.background,
        backgroundName: '码头',
        prompt: '潮湿的海边与远处灯塔',
      }),
      makeNode('voice-1', NODE_TYPE_IDS.voice, { voiceName: '旁白' }),
    ]

    render(<CastDock />)
    const search = screen.getByRole('searchbox', { name: 'searchLabel' })

    fireEvent.change(search, { target: { value: '灯塔' } })
    expect(screen.getByText('码头')).toBeInTheDocument()
    expect(screen.queryByText('旁白')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'nodeTypes.voice' } })
    expect(screen.queryByText('码头')).not.toBeInTheDocument()
    expect(screen.getByText('旁白')).toBeInTheDocument()
  })

  it('selects and locates the real node without opening a detail surface', () => {
    flowState.nodes = [
      makeNode('image-1', NODE_TYPE_IDS.image, {
        characterName: '黛西',
        role: NODE_IMAGE_ROLE_IDS.character,
      }),
    ]

    render(<CastDock />)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'locateNode {"name":"黛西"}',
      }),
    )

    expect(mockFocusNode).toHaveBeenCalledWith('image-1')
  })

  it('shows outgoing reference counts but no create, edit, or delete controls', () => {
    flowState.nodes = [
      makeNode('source', NODE_TYPE_IDS.image, {
        characterName: '黛西',
        role: NODE_IMAGE_ROLE_IDS.character,
      }),
      makeNode('target', NODE_TYPE_IDS.seedance, {
        mediaLabel: '镜头视频',
      }),
    ]
    flowState.edges = [
      { id: 'edge-1', source: 'source', target: 'target' },
      { id: 'edge-2', source: 'source', target: 'target-2' },
    ]

    render(<CastDock />)

    expect(screen.getByText('referenceCount {"count":2}')).toBeInTheDocument()
    expect(screen.queryByText('create')).not.toBeInTheDocument()
    expect(screen.queryByText('deleteCard')).not.toBeInTheDocument()
  })

  it('distinguishes an empty canvas from a search with no matches', () => {
    const { rerender } = render(<CastDock />)
    expect(screen.getByText('empty')).toBeInTheDocument()

    flowState.nodes = [
      makeNode('voice-1', NODE_TYPE_IDS.voice, { voiceName: '旁白' }),
    ]
    rerender(<CastDock />)
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '不存在' },
    })
    expect(screen.getByText('noResults')).toBeInTheDocument()
  })

  it('counts all canvas nodes for the left-panel header', () => {
    expect(
      countCanvasNodes([
        makeNode('a', NODE_TYPE_IDS.shotText),
        makeNode('b', NODE_TYPE_IDS.voice),
        makeNode('c', NODE_TYPE_IDS.seedance),
      ] as never),
    ).toBe(3)
  })
})
