import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}))

const { mockApplyOp, mockBeginDrag, mockMotion } = vi.hoisted(() => ({
  mockApplyOp: vi.fn(),
  mockBeginDrag: vi.fn(),
  mockMotion: { reducedMotion: false },
}))

vi.mock('./IngestDragLayerV4', () => ({
  useIngestDragV4: () => ({
    beginDrag: mockBeginDrag,
    dragState: {
      active: false,
      sourceNodeId: null,
      ghost: null,
      reason: null,
      pendingChoice: null,
    },
    quickThrowSource: null,
    enterQuickThrow: vi.fn(),
    exitQuickThrow: vi.fn(),
    feedQuickThrow: vi.fn(),
  }),
}))

vi.mock('./nodes/v4/NodeV4ActionsBridge', () => ({
  useNodeCanvasActions: () => ({ applyOp: mockApplyOp }),
}))

// 画布修法 05 节「拖了必有回音」：📷N 徽标换成 motion.span 做一次性脉冲。
// motion/react 在 jsdom 里跑真动画意义不大，这里只截下传给它的 `initial`/
// `transition`（画布测试里截 motion props 的通用手法），其余渲染行为（文本内容、× 按钮等）继续走真实 DOM 断言。
const motionCaptures: Array<{
  initial: unknown
  transition: { duration: number }
}> = []

vi.mock('motion/react', () => ({
  useReducedMotion: () => mockMotion.reducedMotion,
  motion: {
    span: ({
      initial,
      animate,
      transition,
      children,
      ...rest
    }: Record<string, unknown> & { children?: ReactNode }) => {
      // 只是从 ...rest 里摘掉，不让它漏到真实 DOM span 上（同 NodeDetailPanel.
      // test.tsx 的 `void` 手法）——本测试不断言 animate 本身的值。
      void animate
      motionCaptures.push({
        initial,
        transition: transition as { duration: number },
      })
      return <span {...rest}>{children}</span>
    },
  },
}))

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeV4 } from '@/types/node-workflow'

import { CastCard } from './CastCard'

function FakeIcon({ className }: { className?: string }) {
  return <svg data-testid="fake-icon" className={className} />
}

/**
 * ⚠ ③d-4：卡吃的是 v4 节点。显示名就是**稳定名** `data.name`（创建即持久化），
 * v3 那条七字段优先链（`characterName` / `voiceName` / `mediaLabel`…）随翻转退役
 * ——连带那条「机器串被当人名显示」的回归用例也失去了对象（v4 里名字只有一个
 * 来源，不存在「哪个字段被写脏了」这回事）。
 */
function makeNode(id: string, data: Record<string, unknown> = {}): NodeV4 {
  return {
    id,
    type: (data.kind as string) ?? 'image',
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'character',
      name: id,
      status: 'idle',
      createdAt: '2026-09-08T00:00:00.000Z',
      ...data,
    },
  } as unknown as NodeV4
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMotion.reducedMotion = false
  motionCaptures.length = 0
})

describe('CastCard', () => {
  it('shows the character name when set', () => {
    const node = makeNode('c1', { name: '黛西' })
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
    const node = makeNode('c1', { name: '' })
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
    const withMedia = makeNode('c1', {
      name: '黛西',
      url: 'https://example.com/c1.png',
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

    const withoutMedia = makeNode('c2', { name: '莱昂' })
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
    const node = makeNode('v1', {
      kind: 'audio',
      subtype: 'voice',
      name: '温柔女声',
      videoThumbnailUrl: 'https://example.com/ref-cover.png',
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

  it('视频片段的卡名同样读稳定名', () => {
    const node = makeNode('r1', {
      kind: 'video',
      subtype: 'clip',
      name: '开场运镜',
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

  /**
   * ⚠ 「机器串被当人名显示」那条回归用例随 ③d-4 删除：它守的是 v3 的七字段
   * 显示名优先链（`characterName` / `mediaLabel` 被写入上传备注常量时的兜底）。
   * v4 里名字只有一个来源 —— 创建即持久化的稳定名 `data.name`，那条链不存在了。
   */

  it('shows "出演 N 镜" only when performanceCount is greater than zero', () => {
    const node = makeNode('c1', { name: '黛西' })
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
    const node = makeNode('c1', { name: '黛西' })
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
    const node = makeNode('c1', { name: '黛西' })
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
    const node = makeNode('c1', {
      name: '黛西',
      url: 'https://example.com/c1.png',
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
      label: '黛西',
      thumbnailUrl: 'https://example.com/c1.png',
    })
    expect(call.onTap).toBe(onSelect)
  })

  it('deletes the underlying node when the hover-reveal × is clicked, without opening the card', () => {
    const node = makeNode('c1', { name: '黛西' })
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

    // ⚠ 断言的是**发出的 op**，不是「调了哪个函数」——外壳的写入口只剩 op 表，
    // 这条断言因此同时锁住了「删卡走 delete op」这条语义。
    expect(mockApplyOp).toHaveBeenCalledWith({ op: 'delete', target: 'c1' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows the identity badge row only when referenceCount or hasVoice is truthy (零内容不显示)', () => {
    const node = makeNode('c1', { name: '黛西' })
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
    const node = makeNode('stable-id-42', { name: '黛西' })
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

  // 画布修法 05 节「拖了必有回音」：📷N 只在 referenceCount 真的增加时弹一次。
  it('does not pop the 📷N badge on first mount, but does once referenceCount increases', () => {
    const node = makeNode('c1', { name: '黛西' })
    const { rerender } = render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        referenceCount={2}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(motionCaptures.at(-1)?.initial).toBe(false)

    rerender(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        referenceCount={3}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(motionCaptures.at(-1)?.initial).toEqual({ scale: 1.2 })
    expect(screen.getByText('📷3')).toBeInTheDocument()
  })

  it('does not pop the 📷N badge when referenceCount decreases', () => {
    const node = makeNode('c1', { name: '黛西' })
    const { rerender } = render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        referenceCount={3}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    rerender(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        referenceCount={1}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(motionCaptures.at(-1)?.initial).toBe(false)
    expect(screen.getByText('📷1')).toBeInTheDocument()
  })

  it('keeps the pulse duration at 0 under prefers-reduced-motion while the badge text still updates', () => {
    mockMotion.reducedMotion = true
    const node = makeNode('c1', { name: '黛西' })
    const { rerender } = render(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        referenceCount={1}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    rerender(
      <CastCard
        node={node}
        sectionId={NODE_IMAGE_ROLE_IDS.character}
        Icon={FakeIcon}
        performanceCount={0}
        referenceCount={2}
        selected={false}
        onSelect={vi.fn()}
      />,
    )
    expect(motionCaptures.at(-1)?.transition.duration).toBe(0)
    expect(screen.getByText('📷2')).toBeInTheDocument()
  })
})
