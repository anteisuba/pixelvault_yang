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
  // ⚠ 带 `rich`：视频台首帧封面下面那行说明是富文本。
  useTranslations: () =>
    Object.assign((key: string) => key, { rich: (key: string) => key }),
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

vi.mock('@/hooks/use-studio-run-models', () => ({
  useStudioRunModels: () => ({
    runModels: [],
    runModelIds: new Set<string>(),
    filterModelByDialect: () => true,
  }),
}))
vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({ modelOptions: [] }),
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
}))

/** 这一枪不发的那几张图（素材排、发送口与舞台封面同一份）。 */
const videoSend = vi.hoisted(() => ({ unsentImages: [] as string[] }))
vi.mock('@/hooks/use-studio-video-assets', () => ({
  useStudioVideoAssets: () => ({
    send: { unsent: { images: videoSend.unsentImages } },
  }),
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
  GenerationPreview: ({
    generation,
  }: {
    generation: GenerationRecord | null
  }) => (
    <div
      data-testid="generation-preview"
      data-generation-id={generation?.id ?? ''}
    />
  ),
}))

vi.mock('@/components/business/studio/StudioAudioFeedback', () => ({
  StudioAudioFeedback: () => <div data-testid="studio-audio-feedback" />,
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
const referenceState = vi.hoisted(() => ({
  entries: [] as { url: string; disabledReason: null }[],
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: mockUseStudioForm,
  useStudioData: () => ({
    imageUpload: {
      referenceEntries: referenceState.entries,
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
        modelId: generation.model,
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
        modelId: generation.model,
        generation,
        startedAt: Date.now(),
      },
    ],
    selectedItemId: null,
  } as unknown as ActiveRun
}

describe('StudioCanvas — 单张生成完成后的反馈条', () => {
  it.each([false, true])(
    '有参考图时根据生成状态选择舞台（生成中=%s）',
    (isGenerating) => {
      referenceState.entries = [
        { url: 'https://cdn.example.com/reference.png', disabledReason: null },
      ]
      mockUseStudioGen.mockReturnValue({
        lastGeneration: null,
        activeRun: null,
        error: null,
        isGenerating,
        elapsedSeconds: 12,
        setLastEvaluation: vi.fn(),
      })
      render(<StudioCanvas />)
      expect(screen.getByTestId('reference-rail')).toBeInTheDocument()
      if (isGenerating) {
        expect(screen.getByTestId('generation-preview')).toBeInTheDocument()
        expect(screen.queryByAltText('sourceAlt')).not.toBeInTheDocument()
      } else {
        expect(screen.getByAltText('sourceAlt')).toBeInTheDocument()
        expect(
          screen.queryByTestId('generation-preview'),
        ).not.toBeInTheDocument()
      }
    },
  )
  beforeEach(() => {
    referenceState.entries = []
    mockUseStudioForm.mockReturnValue({
      state: {
        outputType: 'image',
        promptDialect: 'natural',
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

  it('其他方言的结果与生成状态不会出现在当前台，切回后仍在', () => {
    const generation = { ...makeGeneration(), model: 'nai-diffusion-5-full' }
    const activeRun = makeSingleActiveRun(generation)
    const generationState = {
      lastGeneration: generation,
      activeRun,
      isGenerating: true,
      error: null,
      setLastEvaluation: vi.fn(),
      elapsedSeconds: 12,
    }
    mockUseStudioGen.mockReturnValue(generationState)
    const view = render(<StudioCanvas />)
    expect(screen.getByTestId('generation-preview')).toHaveAttribute(
      'data-generation-id',
      '',
    )
    expect(
      screen.queryByTestId('studio-result-feedback'),
    ).not.toBeInTheDocument()
    mockUseStudioForm.mockReturnValue({
      state: { outputType: 'image', promptDialect: 'tags' },
      dispatch: vi.fn(),
    })
    view.rerender(<StudioCanvas className="tags-workspace" />)
    expect(screen.getByTestId('generation-preview')).toHaveAttribute(
      'data-generation-id',
      generation.id,
    )
    expect(generationState.activeRun).toBe(activeRun)
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
          modelId: generation.model,
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

/**
 * 视频台桌面（底部输入框，owner 2026-09-27 视频台 A）：素材在输入框里，舞台没有参考轨。
 * 还没出过结果时，挂了首帧就把首帧当封面；⛔ 不铺参考图，也没有「编辑这张」（那是图片的）。
 */
describe('StudioCanvas — 视频台桌面（没有参考轨）', () => {
  beforeEach(() => {
    videoSend.unsentImages = []
    referenceState.entries = [
      { url: 'https://cdn.example.com/ref.png', disabledReason: null },
    ]
    mockUseStudioGen.mockReturnValue({
      lastGeneration: null,
      activeRun: null,
      error: null,
      isGenerating: false,
      elapsedSeconds: 0,
      setLastEvaluation: vi.fn(),
      retryVideoQueueItem: vi.fn(),
      cancelRunItem: vi.fn(),
      cancelAllRunItems: vi.fn(),
    })
  })

  it('还没出结果、挂了首尾帧：首帧当封面、尾帧缩在右下，说一句视频从这一帧开始', () => {
    mockUseStudioForm.mockReturnValue({
      state: {
        outputType: 'video',
        videoFrameSlots: {
          first: 'https://cdn.example.com/f.png',
          last: 'https://cdn.example.com/l.png',
        },
      },
      dispatch: vi.fn(),
    })
    render(<StudioCanvas referenceRail={false} />)
    expect(screen.getByAltText('firstFrame')).toHaveAttribute(
      'src',
      'https://cdn.example.com/f.png',
    )
    expect(screen.getByAltText('lastFrame')).toHaveAttribute(
      'src',
      'https://cdn.example.com/l.png',
    )
    expect(screen.getByText('poster.withLast')).toBeInTheDocument()
    expect(screen.queryByAltText('sourceAlt')).not.toBeInTheDocument()
    expect(screen.queryByText('stageEditThis')).not.toBeInTheDocument()
  })

  it('换到只收一张图的型号：尾帧这次不发，⛔ 还缩在右下角、说明也不提尾帧', () => {
    videoSend.unsentImages = ['https://cdn.example.com/l.png']
    mockUseStudioForm.mockReturnValue({
      state: {
        outputType: 'video',
        videoFrameSlots: {
          first: 'https://cdn.example.com/f.png',
          last: 'https://cdn.example.com/l.png',
        },
      },
      dispatch: vi.fn(),
    })
    render(<StudioCanvas referenceRail={false} />)
    expect(screen.getByAltText('firstFrame')).toBeInTheDocument()
    expect(screen.queryByAltText('lastFrame')).not.toBeInTheDocument()
    expect(screen.getByText('poster.firstOnly')).toBeInTheDocument()
  })

  it('型号连首帧都不收：不当封面，走正常的结果区', () => {
    videoSend.unsentImages = ['https://cdn.example.com/f.png']
    mockUseStudioForm.mockReturnValue({
      state: {
        outputType: 'video',
        videoFrameSlots: { first: 'https://cdn.example.com/f.png', last: null },
      },
      dispatch: vi.fn(),
    })
    render(<StudioCanvas referenceRail={false} />)
    expect(screen.queryByAltText('firstFrame')).not.toBeInTheDocument()
    expect(screen.getByTestId('generation-preview')).toBeInTheDocument()
  })

  it('没挂首帧：走正常的结果区，⛔ 不把参考图铺上来', () => {
    mockUseStudioForm.mockReturnValue({
      state: {
        outputType: 'video',
        videoFrameSlots: { first: null, last: null },
      },
      dispatch: vi.fn(),
    })
    render(<StudioCanvas referenceRail={false} />)
    expect(screen.getByTestId('generation-preview')).toBeInTheDocument()
    expect(screen.queryByAltText('sourceAlt')).not.toBeInTheDocument()
    expect(screen.queryByAltText('firstFrame')).not.toBeInTheDocument()
  })
})
