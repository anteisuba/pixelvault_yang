import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { NodeV4 } from '@/types/node-workflow'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// 抽屉是 vaul 的 portal + 一整套编排件，本片只验「点卡把哪一张递给了它」。
vi.mock('./MobileNodeSheet', () => ({
  MobileNodeSheet: ({ node }: { node: NodeV4 | null }) => (
    <div data-testid="sheet">{node?.id ?? 'closed'}</div>
  ),
}))

// 参考轨绑定要 upload / 素材库 / 整张图；卡的形状不依赖它有没有挂东西。
vi.mock('../nodes/v4/video/use-video-rail-binding', () => ({
  useVideoRailBinding: () => ({
    node: undefined,
    items: [],
    railProps: {
      onRemove: vi.fn(),
      onPickFromCanvas: vi.fn(),
      onUpload: vi.fn(),
      onLibrary: vi.fn(),
    },
    capacity: { images: null, videos: null, voices: null },
    candidatesOf: () => [],
    runUpload: vi.fn(),
    openFilePicker: vi.fn(),
    selfUploading: false,
    uploadProgress: 0,
    backfillMedia: vi.fn(),
    overlays: null,
  }),
}))

const nodes: NodeV4[] = [
  {
    id: 'shot-2',
    type: 'v4',
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      name: '隧道',
      label: '隧道',
      shotNo: 2,
      durationSec: 5,
    },
  },
  {
    id: 'shot-1',
    type: 'v4',
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      name: '站台',
      label: '站台',
      shotNo: 1,
    },
  },
  {
    id: 'img-1',
    type: 'v4',
    position: { x: 0, y: 0 },
    data: { kind: 'image', subtype: 'shot', name: '参考图' },
  },
] as unknown as NodeV4[]

vi.mock('../nodes/v4/NodeV4Context', () => ({
  useNodeV4Canvas: () => ({
    nodes,
    edges: [],
    modelOptionsByKind: {},
  }),
}))

import { CanvasMobileRail } from './CanvasMobileRail'

function renderRail(
  overrides: Partial<Parameters<typeof CanvasMobileRail>[0]> = {},
) {
  return render(
    <CanvasMobileRail
      projectPill={<span data-testid="pill">项目</span>}
      assistant={<div data-testid="assistant" />}
      assistantOpen={false}
      onOpenAssistant={vi.fn()}
      onAddShot={vi.fn()}
      onUploadFiles={vi.fn()}
      {...overrides}
    />,
  )
}

describe('CanvasMobileRail', () => {
  it('镜头列表按镜头带序渲染，项目胶囊复用桌面那一颗', () => {
    const { container } = renderRail()
    expect(screen.getByTestId('pill')).toBeInTheDocument()
    const cards = container.querySelectorAll('[data-mobile-shot-card]')
    expect(
      Array.from(cards).map((card) =>
        card.getAttribute('data-mobile-shot-card'),
      ),
    ).toEqual(['shot-1', 'shot-2'])
  })

  it('分段控件切到「图」时列表换成图片行，⛔ 镜头卡不再渲染', () => {
    const { container } = renderRail()
    fireEvent.click(container.querySelector('[data-mobile-list-tab="images"]')!)
    expect(container.querySelectorAll('[data-mobile-shot-card]')).toHaveLength(
      0,
    )
    expect(
      container.querySelector('[data-mobile-media-row="img-1"]'),
    ).toBeInTheDocument()
  })

  it('点卡把这张卡递给抽屉；助手收起时不挂（⛔ 不自动盖住列表）', () => {
    const { container } = renderRail()
    expect(screen.getByTestId('sheet')).toHaveTextContent('closed')
    expect(screen.queryByTestId('assistant')).toBeNull()
    fireEvent.click(container.querySelector('[data-mobile-shot-open]')!)
    expect(screen.getByTestId('sheet')).toHaveTextContent('shot-1')
  })

  it('助手开着时才挂那块 sheet', () => {
    renderRail({ assistantOpen: true })
    expect(screen.getByTestId('assistant')).toBeInTheDocument()
  })
})
