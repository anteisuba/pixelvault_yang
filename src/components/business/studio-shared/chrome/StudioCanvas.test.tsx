import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRecord } from '@/types'
import type { ActiveRun } from '@/types'

import { StudioCanvas } from './StudioCanvas'

/**
 * 修复：单张生成完成后 `StudioResultFeedback` 不渲染。
 *
 * 根因（见 git log -S"activeRun?.mode"，commit 7da5d0e7 首次接线）：守卫写的是
 * `!activeRun?.mode`。`ActiveRun.mode` 是必填字段（'single' | 'compare' |
 * 'variant'，见 `src/types/index.ts` `RunGroupMode`），单张生成路径从 B0 起就
 * 建 `mode: 'single'` 的 run 做逐项追踪（`use-unified-generate.ts`），且只有
 * 显式 `reset()` 才会把 `activeRun` 清回 `null`——生成完成本身不清。所以
 * `!activeRun?.mode` 在单张生成完成后恒为 false，反馈条永远不出现；这不是
 * 「刻意排除 single」，是漏了 single 分支的 bug（提交信息只说「接上
 * StudioResultFeedback」，没有任何「仅 compare/variant」的意图说明，且组件
 * 本就分支在 `activeRun?.mode !== 'compare' && !== 'variant'` 的 else 分支里，
 * 已经排除了 compare/variant，多余的 `!activeRun?.mode` 纯属误判）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/image',
}))

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  dropTargetForElements: () => () => {},
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({ modelOptions: [] }),
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/lib/api-client', () => ({
  fetchGenerationByIdAPI: vi.fn(),
}))

vi.mock('@/lib/api-client/generation', () => ({
  evaluateGenerationAPI: vi.fn(),
}))

vi.mock('@/lib/focus-studio-prompt', () => ({
  focusStudioPrompt: vi.fn(),
}))

vi.mock('@/lib/studio-remix', () => ({
  buildStudioRemixPreset: vi.fn(),
}))

vi.mock('@/lib/studio/audio-feedback-mapping', () => ({
  applyAudioFeedbackTags: vi.fn(() => ({ actions: [], openPanel: null })),
}))

vi.mock('@/components/business/image/CompareGrid', () => ({
  CompareGrid: () => <div data-testid="compare-grid" />,
}))

vi.mock(
  '@/components/business/studio-shared/chrome/StudioReferenceRail',
  () => ({
    StudioReferenceRail: () => <div data-testid="reference-rail" />,
  }),
)

vi.mock(
  '@/components/business/studio-shared/chrome/StudioVideoQueueStrip',
  () => ({
    StudioVideoQueueStrip: () => <div data-testid="video-queue-strip" />,
  }),
)

vi.mock('@/components/business/studio/GenerationPreview', () => ({
  GenerationPreview: () => <div data-testid="generation-preview" />,
}))

vi.mock('@/components/business/studio/StudioAudioFeedback', () => ({
  StudioAudioFeedback: () => <div data-testid="studio-audio-feedback" />,
}))

vi.mock('@/components/business/image/StudioGenerationErrorDialog', () => ({
  StudioGenerationErrorDialog: () => null,
}))

vi.mock('@/components/business/image/StudioResultFeedback', () => ({
  StudioResultFeedback: ({ generationId }: { generationId: string }) => (
    <div
      data-testid="studio-result-feedback"
      data-generation-id={generationId}
    />
  ),
}))

vi.mock('@/components/business/studio/AudioVariantGrid', () => ({
  AudioVariantGrid: () => <div data-testid="audio-variant-grid" />,
}))

vi.mock(
  '@/components/business/studio-shared/editor/StudioImageEditStage',
  () => ({
    StudioImageEditStage: () => null,
  }),
)

const mockUseStudioForm = vi.hoisted(() => vi.fn())
const mockUseStudioGen = vi.hoisted(() => vi.fn())

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: mockUseStudioForm,
  useStudioData: () => ({
    imageUpload: {
      referenceEntries: [],
      referenceImages: [],
      addFromUrl: vi.fn(),
      removeReferenceImage: vi.fn(),
    },
  }),
  useStudioGen: mockUseStudioGen,
}))

function makeGeneration(): GenerationRecord {
  return {
    id: 'gen-single-1',
    outputType: 'IMAGE',
    url: 'https://cdn.example.com/gen-single-1.png',
    prompt: 'a cat',
    negativePrompt: null,
    model: 'flux-pro',
    provider: 'fal',
    createdAt: new Date().toISOString(),
    status: 'completed',
  } as unknown as GenerationRecord
}

/** 单张生成路径真实建出的 run 形状：mode 恒为 'single'，完成后不会被清空。 */
function makeSingleActiveRun(generation: GenerationRecord): ActiveRun {
  return {
    id: 'run-1',
    mode: 'single',
    outputType: 'IMAGE',
    items: [
      {
        id: 'item-1',
        status: 'completed',
        generation,
        startedAt: Date.now(),
      },
    ],
    selectedItemId: null,
  } as unknown as ActiveRun
}

function makeAudioGeneration(): GenerationRecord {
  return {
    id: 'gen-audio-1',
    outputType: 'AUDIO',
    url: 'https://cdn.example.com/gen-audio-1.mp3',
    prompt: 'a voiceover line',
    negativePrompt: null,
    model: 'fish-audio',
    provider: 'fish',
    createdAt: new Date().toISOString(),
    status: 'completed',
  } as unknown as GenerationRecord
}

function makeSingleAudioActiveRun(generation: GenerationRecord): ActiveRun {
  return {
    id: 'run-audio-1',
    mode: 'single',
    outputType: 'AUDIO',
    items: [
      {
        id: 'item-1',
        status: 'completed',
        generation,
        startedAt: Date.now(),
      },
    ],
    selectedItemId: null,
  } as unknown as ActiveRun
}

describe('StudioCanvas — 单张生成完成后的反馈条', () => {
  beforeEach(() => {
    mockUseStudioForm.mockReturnValue({
      state: {
        outputType: 'image',
        videoMode: 'text-to-video',
      },
      dispatch: vi.fn(),
    })
  })

  it('single 模式下 lastGeneration 到位后渲染 StudioResultFeedback（修复前：!activeRun?.mode 恒假，永不渲染）', () => {
    const generation = makeGeneration()
    mockUseStudioGen.mockReturnValue({
      lastGeneration: generation,
      error: null,
      errorCode: null,
      retry: vi.fn(),
      activeRun: makeSingleActiveRun(generation),
      selectWinner: vi.fn(),
      lastEvaluation: null,
      setLastEvaluation: vi.fn(),
      isGenerating: false,
      elapsedSeconds: 0,
      retryVideoQueueItem: vi.fn(),
      cancelRunItem: vi.fn(),
      cancelAllRunItems: vi.fn(),
    })

    render(<StudioCanvas />)

    const feedback = screen.getByTestId('studio-result-feedback')
    expect(feedback).toHaveAttribute('data-generation-id', generation.id)
  })

  it('compare 模式下继续不渲染 StudioResultFeedback（图墙分支本就互斥，守卫不能反过来把它露出来）', () => {
    const generation = makeGeneration()
    const compareRun = {
      id: 'run-2',
      mode: 'compare',
      outputType: 'IMAGE',
      items: [
        {
          id: 'item-1',
          status: 'completed',
          generation,
          startedAt: Date.now(),
        },
      ],
      selectedItemId: null,
    } as unknown as ActiveRun

    mockUseStudioGen.mockReturnValue({
      lastGeneration: generation,
      error: null,
      errorCode: null,
      retry: vi.fn(),
      activeRun: compareRun,
      selectWinner: vi.fn(),
      lastEvaluation: null,
      setLastEvaluation: vi.fn(),
      isGenerating: false,
      elapsedSeconds: 0,
      retryVideoQueueItem: vi.fn(),
      cancelRunItem: vi.fn(),
      cancelAllRunItems: vi.fn(),
    })

    render(<StudioCanvas />)

    expect(screen.queryByTestId('studio-result-feedback')).toBeNull()
  })

  it('audio single 模式下 lastGeneration 到位后渲染 StudioAudioFeedback（同一处守卫，音频分支同款）', () => {
    mockUseStudioForm.mockReturnValue({
      state: {
        outputType: 'audio',
        videoMode: 'text-to-video',
      },
      dispatch: vi.fn(),
    })

    const generation = makeAudioGeneration()
    mockUseStudioGen.mockReturnValue({
      lastGeneration: generation,
      error: null,
      errorCode: null,
      retry: vi.fn(),
      activeRun: makeSingleAudioActiveRun(generation),
      selectWinner: vi.fn(),
      lastEvaluation: null,
      setLastEvaluation: vi.fn(),
      isGenerating: false,
      elapsedSeconds: 0,
      retryVideoQueueItem: vi.fn(),
      cancelRunItem: vi.fn(),
      cancelAllRunItems: vi.fn(),
    })

    render(<StudioCanvas />)

    expect(screen.getByTestId('studio-audio-feedback')).toBeInTheDocument()
  })
})
