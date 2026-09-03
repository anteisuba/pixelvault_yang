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
vi.mock('@/components/business/VideoPlayer', () => ({ default: () => null }))
vi.mock('@/components/business/ImageDetailModal', () => ({
  ImageDetailModal: () => null,
}))
vi.mock('@/components/business/studio/StudioEmptyState', () => ({
  StudioEmptyState: () => null,
}))
vi.mock('@/components/business/studio-shared', () => ({
  StudioGeneratingProgress: () => null,
}))
vi.mock('@/hooks/use-studio-draggable', () => ({
  useStudioDraggable: () => ({ current: null }),
}))
vi.mock('@/lib/api-client/generation', () => ({
  downloadRemoteAsset: vi.fn(),
}))

let mockIsMobile = false
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mockIsMobile }))

// §3.0b 第 4 条的注入口。真实实现要 StudioProvider —— 这里要验的是
// 「按钮按下去带的是这张图的 URL」，不是 reducer。
const askAssistantMock = vi.fn()
vi.mock('@/hooks/use-ask-assistant-about-image', () => ({
  useAskAssistantAboutImage: () => askAssistantMock,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioGen: () => ({
    error: null,
    isGenerating: false,
    elapsedSeconds: 0,
    activeRun: null,
    cancelRunItem: vi.fn(),
  }),
  useStudioForm: () => ({
    state: {
      outputType: 'image',
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
