import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}))

const { mockBeginDrag, mockDeleteNode } = vi.hoisted(() => ({
  mockBeginDrag: vi.fn(),
  mockDeleteNode: vi.fn(),
}))

vi.mock('./IngestDragLayer', () => ({
  useIngestDrag: () => ({
    beginDrag: mockBeginDrag,
    dragState: { active: false, sourceNodeId: null, ghost: null, reason: null },
  }),
}))

vi.mock('./NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({ deleteNode: mockDeleteNode }),
}))

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { CastCard } from './CastCard'

function FakeIcon({ className }: { className?: string }) {
  return <svg data-testid="fake-icon" className={className} />
}

function makeNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
): NodeWorkflowNode {
  return {
    id,
    type: type as NodeWorkflowNode['type'],
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data },
  } as NodeWorkflowNode
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CastCard', () => {
  it('shows the character name when set', () => {
    const node = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      characterName: '黛西',
    })
    render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByTitle('黛西')).toBeInTheDocument()
    expect(screen.getByText('@黛西')).toBeInTheDocument()
  })

  it('falls back to the section label when the node has no custom name', () => {
    const node = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    // The mock t() returns the raw key — the fallback reads `sections.character`.
    expect(screen.getByTitle('sections.character')).toBeInTheDocument()
  })

  it('renders a thumbnail image when the node has media, an icon fallback otherwise', () => {
    const withMedia = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      characterName: '黛西',
      mediaUrl: 'https://example.com/c1.png',
    })
    const { rerender } = render(
      <CastCard
        node={withMedia}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    // 缩略图是装饰性的（名字已由卡片本体承载），alt="" 使其 role 为
    // presentation —— 按 role 查不到是预期，用 presentation 查。
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      'https://example.com/c1.png',
    )

    const withoutMedia = makeNode('c2', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      characterName: '莱昂',
    })
    rerender(
      <CastCard
        node={withoutMedia}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByTestId('fake-icon')).toBeInTheDocument()
  })

  it('resolves the voice cover image, falling back to the reference-audio cover', () => {
    const node = makeNode('v1', NODE_TYPE_IDS.voice, {
      voiceName: '温柔女声',
      voiceReferenceCoverImage: 'https://example.com/ref-cover.png',
    })
    render(
      <CastCard
        node={node}
        sectionId={NODE_TYPE_IDS.voice}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      'https://example.com/ref-cover.png',
    )
  })

  it('reads the videoReference display name from mediaLabel', () => {
    const node = makeNode('r1', NODE_TYPE_IDS.videoReference, {
      mediaLabel: '开场运镜',
    })
    render(
      <CastCard
        node={node}
        sectionId={NODE_TYPE_IDS.videoReference}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByTitle('开场运镜')).toBeInTheDocument()
  })

  it('shows "出演 N 镜" only when performanceCount is greater than zero', () => {
    const node = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      characterName: '黛西',
    })
    const { rerender } = render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.queryByText(/performanceCount/)).not.toBeInTheDocument()

    rerender(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={2}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('performanceCount {"count":2}')).toBeInTheDocument()
  })

  it('calls onSelect on a keyboard/AT click (event.detail===0) and reflects the selected state', () => {
    const node = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      characterName: '黛西',
    })
    const onSelect = vi.fn()
    render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        selected
        onSelect={onSelect}
      />,
    )
    const card = screen.getByTitle('黛西')
    expect(card).toHaveAttribute('aria-pressed', 'true')
    // Testing Library's fireEvent.click synthesizes detail:0 by default —
    // the same path a screen reader / Enter-Space activation takes.
    fireEvent.click(card)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('calls onSelect on Enter/Space keyboard activation', () => {
    const node = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      characterName: '黛西',
    })
    const onSelect = vi.fn()
    render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={onSelect}
      />,
    )
    fireEvent.keyDown(screen.getByTitle('黛西'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('starts an ingest drag on pointerdown, handing the engine the card label/thumbnail/onTap fallback', () => {
    const node = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      characterName: '黛西',
      mediaUrl: 'https://example.com/c1.png',
    })
    const onSelect = vi.fn()
    render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={onSelect}
      />,
    )
    fireEvent.pointerDown(screen.getByTitle('黛西'), {
      pointerId: 1,
      button: 0,
    })

    expect(mockBeginDrag).toHaveBeenCalledTimes(1)
    const call = mockBeginDrag.mock.calls[0][0]
    expect(call.source).toEqual({
      node,
      sectionId: NODE_IMAGE_ROLE_IDS.character,
      label: '黛西',
      thumbnailUrl: 'https://example.com/c1.png',
    })
    expect(call.onTap).toBe(onSelect)
  })

  it('deletes the underlying node when the hover-reveal × is clicked, without opening the card', () => {
    const node = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      characterName: '黛西',
    })
    const onSelect = vi.fn()
    render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={onSelect}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'deleteCard {"name":"黛西"}' }),
    )

    expect(mockDeleteNode).toHaveBeenCalledWith('c1')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows the identity badge row only when referenceCount or hasVoice is truthy (零内容不显示)', () => {
    const node = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      characterName: '黛西',
    })
    const { rerender } = render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        referenceCount={0}
        hasVoice={false}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.queryByText(/📷|♪/)).not.toBeInTheDocument()

    rerender(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        referenceCount={3}
        hasVoice
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('📷3 ♪')).toBeInTheDocument()

    rerender(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        referenceCount={0}
        hasVoice
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('♪')).toBeInTheDocument()
  })

  it('assigns a deterministic tilt class that is stable across renders', () => {
    const node = makeNode('stable-id-42', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      characterName: '黛西',
    })
    const { unmount } = render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    const firstClassName = screen.getByTitle('黛西').className
    unmount()

    render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByTitle('黛西').className).toBe(firstClassName)
    expect(firstClassName).toMatch(/(^|\s)-?rotate-[12](\s|$)/)
  })
})
