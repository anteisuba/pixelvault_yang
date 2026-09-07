/**
 * HIG 定稿（owner 2026-09-08 = `proto6-expanded-A-hig`）的**结构断言**。
 *
 * ⚠ 为什么是 DOM 断言而不是真机截图：`NODE_CANVAS_RENDER_V4` 现在是 `false`
 * （③c 正在做存储翻转），画布上还渲染不出一张 v4 卡，所以这一版的证据是
 * 「标记与类名确实按稿落了」+ 「Tailwind 确实把这些类编出来了」（后者由
 * `@tailwindcss/postcss` 编译产物核对，见实现报告）。翻转后补真机三张截图。
 *
 * 这里只钉**会被后续改动悄悄推翻**的那几条：卡的圆角档与弹簧档、卡头 44px 命中
 * 区、展开态的高上限与内滚、槽轨的定宽算术、浮层材质。⛔ 不逐个类名拍快照——
 * 那种测试每次调间距都红，除了让人加 `-u` 之外没有任何作用。
 */

import type { NodeProps } from '@xyflow/react'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  Handle: () => <span data-testid="handle" />,
  Position: { Left: 'left', Right: 'right', Top: 'top' },
  NodeResizer: () => <span data-testid="resizer" />,
  NodeToolbar: (props: Record<string, unknown>) =>
    props.isVisible ? (
      <div data-node-toolbar="" className={props.className as string}>
        {props.children as ReactNode}
      </div>
    ) : null,
}))

vi.mock('@/components/ui/markdown', () => ({
  Markdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { NODE_V4_CARD } from '@/constants/node-studio'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import { ImageNodeV4 } from './ImageNodeV4'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'

const NOW = '2026-09-08T00:00:00.000Z'

function scene(): NodeWorkflowStateV4 {
  return reconcileStateSlots({
    version: 4,
    nodes: [
      {
        id: 'i_01',
        position: { x: 0, y: 0 },
        data: {
          kind: 'image',
          subtype: 'shot',
          name: 'i_01',
          status: 'idle',
          createdAt: NOW,
          url: 'https://cdn.test/a.png',
          mediaWidth: 1024,
          mediaHeight: 768,
        },
      } as NodeV4,
    ],
    edges: [],
  } as unknown as NodeWorkflowStateV4)
}

function renderCard(expandedNodeId: string | null, selected = false) {
  const state = scene()
  const value = {
    nodes: state.nodes,
    edges: state.edges,
    expandedNodeId,
    changedNodeIds: [],
    selectedNodeIds: [],
    modelOptionsByKind: { text: [], image: [], audio: [], video: [] },
    draggingFrom: null,
    onToggleExpanded: vi.fn(),
    onApplyOp: vi.fn(),
    onFocusNode: vi.fn(),
    onTidyLayout: vi.fn(),
    onSelectSlotVersion: vi.fn(),
    onDisconnectSlot: vi.fn(),
    onSetPrompt: vi.fn(),
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onEditText: vi.fn(),
    onDeriveFromText: vi.fn(),
  } as unknown as NodeV4CanvasContextValue

  const props = {
    id: 'i_01',
    data: state.nodes[0]!.data,
    selected,
  } as unknown as NodeProps

  return render(
    <NodeV4CanvasProvider value={value}>
      <ImageNodeV4 {...props} />
    </NodeV4CanvasProvider>,
  )
}

function card(): HTMLElement {
  return document.querySelector('[data-node-kind]') as HTMLElement
}

describe('NodeV4 HIG 定稿结构', () => {
  it('卡走 rounded-node + squircle + 两层阴影，⛔ 不是 rounded-lg shadow-md', () => {
    renderCard(null)
    const className = card().className
    expect(className).toContain('rounded-node')
    expect(className).toContain('corner-squircle')
    expect(className).toContain('shadow-node-card')
    expect(className).not.toContain('rounded-lg')
    expect(className).not.toContain('shadow-md')
  })

  it('卡面不透明：⛔ 不给卡上 backdrop（vibrancy 只给浮层）', () => {
    renderCard('i_01', true)
    expect(card().className).toContain('bg-card')
    expect(card().className).not.toContain('surface-glass')
    // 浮层（工具条）才是玻璃。
    expect(
      document.querySelector('[data-node-toolbar]')?.className ?? '',
    ).toContain('surface-glass')
  })

  it('展开 / 收起走同一条弹簧（宽与影不分家）', () => {
    renderCard(null)
    const className = card().className
    expect(className).toContain('duration-spring-expand')
    expect(className).toContain('ease-spring-expand')
    expect(className).toContain('transition-[width,box-shadow]')
  })

  it('卡头 44px 一行，带 kind 标与等宽读数', () => {
    renderCard(null)
    const head = document.querySelector('.node-v4-head') as HTMLElement
    expect(head.className).toContain('min-h-11')
    expect(head.querySelector('[data-kind-tag]')?.textContent).toBe(
      'kinds.image',
    )
    const readout = head.querySelector('[data-node-readout]') as HTMLElement
    expect(readout.textContent).toBe('readout.dimensions')
    expect(readout.className).toContain('tabular-nums')
  })

  it('展开态 = 单列顺序栈 + 高上限内滚，上限读常量而不是字面量', () => {
    renderCard('i_01')
    const stack = document.querySelector('[data-expanded-stack]') as HTMLElement
    expect(stack.style.maxHeight).toBe(`${NODE_V4_CARD.expandedMaxHeight}px`)
    expect(stack.className).toContain('overflow-y-auto')
    // ⚠ `nowheel`：卡内滚动要自己吃掉滚轮，否则滚卡等于缩放画布。
    expect(stack.className).toContain('nowheel')
  })

  it('展开宽 480，且槽轨定宽让「4 格整齐 + 第 5 格露 24px」成立', () => {
    // 480 − 32 卡内左右内距 = 448；4×100 + 3×8 = 424，第 5 格露 448 − 424 = 24。
    expect(NODE_V4_CARD.expandedWidth).toBe(480)
    const usable = NODE_V4_CARD.expandedWidth - 32
    const four = NODE_V4_CARD.slotCardWidth * 4 + NODE_V4_CARD.slotCardGap * 3
    expect(usable - four).toBe(24)
  })

  it('展开态渲染横轨（⛔ 左列槽轨只留给收起态）', () => {
    renderCard('i_01')
    const rail = document.querySelector(
      '[data-slot-rail="horizontal"]',
    ) as HTMLElement
    expect(rail).not.toBeNull()
    expect(rail.className).toContain('snap-x')
    expect(document.querySelector('[data-slot-rail="vertical"]')).toBeNull()
    const slot = rail.querySelector('[data-slot-id]') as HTMLElement
    expect(slot.style.width).toBe(`${NODE_V4_CARD.slotCardWidth}px`)
  })

  it('媒体坐在沉底的井里，关系带默认展开、证据默认收起', () => {
    renderCard('i_01')
    expect(
      (document.querySelector('[data-media-well]') as HTMLElement).className,
    ).toContain('bg-surface-sunken')
    expect(
      document.querySelector('[data-disclosure="relations"]'),
    ).toHaveAttribute('data-open', 'true')
    expect(
      document.querySelector('[data-disclosure="evidence"]'),
    ).toHaveAttribute('data-open', 'false')
  })

  it('展开钮是旋转的 chevron（⛔ 不是 + / −）', () => {
    renderCard('i_01')
    const toggle = document.querySelector(
      'button[aria-expanded="true"]',
    ) as HTMLElement
    expect(toggle.className).toContain('rotate-180')
    expect(toggle.textContent).toBe('')
    expect(toggle.querySelector('svg')).not.toBeNull()
  })
})
