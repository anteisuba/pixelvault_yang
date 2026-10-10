import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRecord } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  TransformComponent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/audio-player', () => ({ AudioPlayer: () => null }))
vi.mock('@/components/business/VideoPlayer', () => ({
  default: ({ fit }: { fit?: string }) => (
    <div data-testid="video-player" data-fit={fit} />
  ),
}))
vi.mock('@/components/business/ImageDetailModal', () => ({
  ImageDetailModal: () => null,
}))
vi.mock('@/components/business/studio/StudioEmptyState', () => ({
  StudioEmptyState: () => null,
}))
// 进度层自己的画法在它自己的测试里；这里只看舞台递给它什么（失败原因、重试）。
vi.mock('@/components/business/studio-shared', () => ({
  StudioGeneratingProgress: ({
    variant,
    failure,
  }: {
    variant?: string
    failure?: { message: string; retryLabel: string; onRetry?: () => void }
  }) => (
    <div data-testid="generating-progress" data-variant={variant}>
      {failure ? (
        <div role="alert">
          {failure.message}
          {failure.onRetry ? (
            <button type="button" onClick={failure.onRetry}>
              {failure.retryLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  ),
}))
vi.mock('@/hooks/use-studio-draggable', () => ({
  useStudioDraggable: () => ({ current: null }),
}))
vi.mock('@/lib/api-client/generation', () => ({
  downloadRemoteAsset: vi.fn(),
}))

let mockIsMobile = false
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile,
  useIsTablet: () => false,
}))

// §3.0b 第 4 条的注入口。真实实现要 StudioProvider —— 这里要验的是
// 「按钮按下去带的是这张图的 URL」，不是 reducer。
const askAssistantMock = vi.fn()
vi.mock('@/hooks/use-ask-assistant-about-image', () => ({
  useAskAssistantAboutImage: () => askAssistantMock,
}))

let mockOutputType: 'image' | 'video' = 'image'
let mockDialect = 'natural'
let mockGen: {
  error: string | null
  errorCode?: string | null
  isGenerating: boolean
  elapsedSeconds: number
  activeRun: unknown
  cancelRunItem: () => void
}
function idleGen(): typeof mockGen {
  return {
    error: null,
    isGenerating: false,
    elapsedSeconds: 0,
    activeRun: null,
    cancelRunItem: vi.fn(),
  }
}
vi.mock('@/contexts/studio-context', () => ({
  useStudioGen: () => mockGen,
  useStudioForm: () => ({
    state: {
      outputType: mockOutputType,
      promptDialect: mockDialect,
      aspectRatio: '1:1',
      advancedParams: {},
    },
    dispatch: vi.fn(),
  }),
}))

import { GenerationPreview } from './GenerationPreview'

function makeGeneration(
  overrides: Partial<GenerationRecord> = {},
): GenerationRecord {
  return {
    id: 'gen-1',
    url: 'https://cdn.example.com/gen-1.png',
    prompt: 'a cat',
    outputType: 'IMAGE',
    ...overrides,
  } as GenerationRecord
}

beforeEach(() => {
  mockIsMobile = false
  mockOutputType = 'image'
  mockDialect = 'natural'
  mockGen = idleGen()
  askAssistantMock.mockClear()
})

describe('GenerationPreview — 问助手 entry', () => {
  it('adds the ask-assistant tool for an image result and hands it that image url', () => {
    render(<GenerationPreview generation={makeGeneration()} isLatestResult />)

    fireEvent.click(screen.getByRole('button', { name: 'toolAskAssistant' }))
    expect(askAssistantMock).toHaveBeenCalledWith(
      'https://cdn.example.com/gen-1.png',
    )
  })

  // ⚠ vision 借路只吃图。视频/音频上放一个按下去必失败的按钮比没有更糟，
  // 所以这一档是**结构性缺席**而不是禁用态。
  it('omits the entry on non-image results', () => {
    render(
      <GenerationPreview
        generation={makeGeneration({
          outputType: 'VIDEO',
          url: 'https://cdn.example.com/gen-1.mp4',
        })}
        isLatestResult
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'toolAskAssistant' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the entry reachable in the mobile tool drawer', () => {
    mockIsMobile = true
    render(<GenerationPreview generation={makeGeneration()} isLatestResult />)

    fireEvent.click(screen.getByRole('button', { name: 'toolAskAssistant' }))
    expect(askAssistantMock).toHaveBeenCalledWith(
      'https://cdn.example.com/gen-1.png',
    )
  })
})

describe('GenerationPreview — video sizing', () => {
  it('contains a video result inside the available stage', () => {
    render(
      <GenerationPreview
        generation={makeGeneration({
          outputType: 'VIDEO',
          url: 'https://cdn.example.com/gen-1.mp4',
        })}
        isLatestResult
      />,
    )

    expect(screen.getByTestId('video-player')).toHaveAttribute(
      'data-fit',
      'contain',
    )
  })
})

/**
 * 加载态 A（owner 2026-09-27「画布与工作台都就地说」）：失败在舞台上就地说一句原因
 * +「重试」—— ⛔ 错误对话框、⛔ 红框。
 */
describe('GenerationPreview — 加载态 A', () => {
  it('隐藏其他台的进度和错误，回到来源台才显示', () => {
    mockGen = {
      ...idleGen(),
      isGenerating: true,
      activeRun: {
        outputType: 'IMAGE',
        mode: 'single',
        items: [
          {
            id: 'item-1',
            modelId: 'nai-diffusion-5-full',
            status: 'generating',
          },
        ],
      },
    }
    const view = render(<GenerationPreview generation={null} />)
    expect(screen.queryByTestId('generating-progress')).toBeNull()
    mockDialect = 'tags'
    view.rerender(<GenerationPreview generation={null} fillStage />)
    expect(screen.getByTestId('generating-progress')).toBeInTheDocument()
    view.unmount()
    mockDialect = 'natural'
    mockGen = { ...mockGen, isGenerating: false, error: 'tag failure' }
    render(<GenerationPreview generation={null} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('生成中：图框只有进度那一条边（⛔ 虚线外框、⛔ shimmer）', () => {
    mockGen = { ...idleGen(), isGenerating: true, elapsedSeconds: 8 }
    const { container } = render(<GenerationPreview generation={null} />)

    expect(screen.getByTestId('generating-progress')).toHaveAttribute(
      'data-variant',
      'full',
    )
    expect(container.querySelector('.border-dashed')).toBeNull()
    expect(container.querySelector('.studio-reveal-shimmer')).toBeNull()
  })

  it('新生成失败：舞台上就地说原因 +「重试」', () => {
    const onRetry = vi.fn()
    mockGen = { ...idleGen(), error: '服务商的内容审核未通过。' }
    render(<GenerationPreview generation={null} onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      '服务商的内容审核未通过。',
    )
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    // 取消键只在生成中给。
    expect(screen.queryByTestId('generation-preview-cancel')).toBeNull()
  })

  it('余额不足这类重试也没用的失败：只说原因，不给「重试」', () => {
    mockGen = {
      ...idleGen(),
      error: 'NovelAI 账户的 Anlas 不够',
      errorCode: 'provider_insufficient_balance',
    }
    render(<GenerationPreview generation={null} onRetry={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'NovelAI 账户的 Anlas 不够',
    )
    expect(screen.queryByRole('button', { name: 'retry' })).toBeNull()
  })

  it('重画失败：旧图留着，原因 +「重试」在图上那一层（⛔ 图下面的红框）', () => {
    const onRetry = vi.fn()
    mockGen = { ...idleGen(), error: '请求过于频繁，请稍后再试' }
    render(
      <GenerationPreview
        generation={makeGeneration()}
        isLatestResult
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('img', { name: 'a cat' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '请求过于频繁，请稍后再试',
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('视频的失败由队列那一行说：舞台 ⛔ 再压一层（上一条视频照常看）', () => {
    mockOutputType = 'video'
    mockGen = { ...idleGen(), error: '提交失败：配额已用完' }
    render(
      <GenerationPreview
        generation={makeGeneration({
          outputType: 'VIDEO',
          url: 'https://cdn.example.com/gen-1.mp4',
        })}
        isLatestResult
      />,
    )

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByTestId('generating-progress')).toBeNull()
    expect(screen.getByTestId('video-player')).toBeInTheDocument()
  })
})
