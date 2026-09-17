import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: vi.fn(() => ({
    modelOptions: [],
    selectedModel: undefined,
  })),
}))
vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: vi.fn(() => ({
    modelOptions: [],
    selectedModel: undefined,
  })),
}))
vi.mock('@/hooks/use-audio-model-options', () => ({
  useAudioModelOptions: vi.fn(() => ({
    modelOptions: [],
    selectedModel: undefined,
  })),
}))
vi.mock('@/hooks/use-3d-model-options', () => ({
  use3DModelOptions: vi.fn(() => ({ modelOptions: [] })),
}))
vi.mock('@/hooks/use-llm-route-picker', () => ({
  useLLMRoutePicker: vi.fn(() => ({
    savedRoutes: [],
    lockedRoutes: [],
    allRoutes: [],
    healthMap: {},
  })),
}))
vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: vi.fn(() => ({
    keys: [],
    healthMap: {},
    isLoading: false,
  })),
}))

import { AI_MODELS } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  MainModelPicker,
  routeToStudioOption,
} from '@/components/business/studio-shared/pickers/MainModelPicker'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import { use3DModelOptions } from '@/hooks/use-3d-model-options'
import { useLLMRoutePicker } from '@/hooks/use-llm-route-picker'
import type { LLMRouteOption } from '@/hooks/use-llm-route-picker'

describe('MainModelPicker dispatcher', () => {
  it('renders without crashing for each modality', () => {
    const cases: Array<React.ReactElement> = [
      <MainModelPicker
        key="image"
        modality="image"
        value={null}
        onChange={vi.fn()}
      />,
      <MainModelPicker
        key="video"
        modality="video"
        value={null}
        onChange={vi.fn()}
      />,
      <MainModelPicker
        key="audio"
        modality="audio"
        value={null}
        onChange={vi.fn()}
      />,
      <MainModelPicker
        key="3d"
        modality="model_3d"
        value={null}
        onChange={vi.fn()}
      />,
      <MainModelPicker
        key="llm"
        modality="llm_assist"
        llmCapability="enhance"
        value={null}
        onChange={vi.fn()}
      />,
    ]
    for (const node of cases) {
      const { unmount } = render(node)
      expect(screen.getByRole('button')).toBeInTheDocument()
      unmount()
    }
  })

  it('dispatches modality=image to useImageModelOptions only', () => {
    vi.mocked(useImageModelOptions).mockClear()
    vi.mocked(useVideoModelOptions).mockClear()
    render(<MainModelPicker modality="image" value={null} onChange={vi.fn()} />)
    expect(useImageModelOptions).toHaveBeenCalledTimes(1)
    expect(useVideoModelOptions).not.toHaveBeenCalled()
  })

  it('每个模态都渲染同一颗统一触发器（D2 ④「五处宿主同一形状」）', () => {
    // 2026-09-17 收口：五个模态**全部**走 `ModelPickerPopover`，触发器是
    // 「名 + 型号 + 价 / 状态 + caret」那一颗 chip。三栏对话框已整删。
    vi.mocked(useImageModelOptions).mockReturnValue({
      modelOptions: [
        {
          optionId: 'key:fal-1',
          modelId: AI_MODELS.SEEDREAM_50_PRO,
          displayLabel: 'Seedream 5.0 Pro',
          adapterType: AI_ADAPTER_TYPES.FAL,
          providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
          requestCount: 1,
          isBuiltIn: true,
          sourceType: 'saved',
          keyId: 'fal-1',
        },
      ],
      selectedModel: undefined,
    } as unknown as ReturnType<typeof useImageModelOptions>)

    const { unmount } = render(
      <MainModelPicker modality="image" value="key:fal-1" onChange={vi.fn()} />,
    )
    const chip = screen.getByRole('button')
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog')
    // 名与型号在 chip 上是两格。
    expect(chip.textContent).toContain('Seedream')
    expect(chip.textContent).toContain('5.0 Pro')
    unmount()

    vi.mocked(useImageModelOptions).mockReturnValue({
      modelOptions: [],
      selectedModel: undefined,
    } as unknown as ReturnType<typeof useImageModelOptions>)
  })

  it('dispatches modality=video to useVideoModelOptions only', () => {
    vi.mocked(useVideoModelOptions).mockClear()
    vi.mocked(useImageModelOptions).mockClear()
    render(<MainModelPicker modality="video" value={null} onChange={vi.fn()} />)
    expect(useVideoModelOptions).toHaveBeenCalledTimes(1)
    expect(useImageModelOptions).not.toHaveBeenCalled()
  })

  it('dispatches modality=audio to useAudioModelOptions only', () => {
    vi.mocked(useAudioModelOptions).mockClear()
    vi.mocked(useImageModelOptions).mockClear()
    render(<MainModelPicker modality="audio" value={null} onChange={vi.fn()} />)
    expect(useAudioModelOptions).toHaveBeenCalledTimes(1)
    expect(useImageModelOptions).not.toHaveBeenCalled()
  })

  it('dispatches modality=model_3d to use3DModelOptions only', () => {
    vi.mocked(use3DModelOptions).mockClear()
    vi.mocked(useImageModelOptions).mockClear()
    render(
      <MainModelPicker modality="model_3d" value={null} onChange={vi.fn()} />,
    )
    expect(use3DModelOptions).toHaveBeenCalledTimes(1)
    expect(useImageModelOptions).not.toHaveBeenCalled()
  })

  it('dispatches modality=llm_assist to useLLMRoutePicker with passed scope', () => {
    vi.mocked(useLLMRoutePicker).mockClear()
    render(
      <MainModelPicker
        modality="llm_assist"
        llmCapability="planner"
        value={null}
        onChange={vi.fn()}
      />,
    )
    expect(useLLMRoutePicker).toHaveBeenCalledWith('planner')
  })

  it('does NOT subscribe to Studio Form hooks when modality=model_3d (3D regression guard)', () => {
    // Critical: if MainModelPicker3D ever calls useImage/Video/AudioModelOptions
    // it would crash inside Studio3DWorkspace which is not wrapped in
    // StudioFormProvider. Component-level dispatch must isolate sub-component hooks.
    vi.mocked(useImageModelOptions).mockClear()
    vi.mocked(useVideoModelOptions).mockClear()
    vi.mocked(useAudioModelOptions).mockClear()
    render(
      <MainModelPicker modality="model_3d" value={null} onChange={vi.fn()} />,
    )
    expect(useImageModelOptions).not.toHaveBeenCalled()
    expect(useVideoModelOptions).not.toHaveBeenCalled()
    expect(useAudioModelOptions).not.toHaveBeenCalled()
  })
})

describe('routeToStudioOption', () => {
  it('converts a saved LLM route to a "saved" sourceType StudioModelOption', () => {
    const route: LLMRouteOption = {
      optionId: 'llm-route:planner:key:k1',
      apiKeyId: 'k1',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: 'gpt-4o-mini',
      label: 'OpenAI GPT-5.4 Mini',
      providerLabel: 'OpenAI',
      maskedKey: 'sk-****1234',
      keyLabel: 'My OpenAI',
      isSaved: true,
    }
    const result = routeToStudioOption(route)
    expect(result.sourceType).toBe('saved')
    expect(result.keyId).toBe('k1')
    expect(result.keyLabel).toBe('My OpenAI')
    expect(result.maskedKey).toBe('sk-****1234')
    expect(result.modelId).toBe('gpt-4o-mini')
    expect(result.displayLabel).toBe('OpenAI GPT-5.4 Mini')
  })

  it('converts a locked LLM route to a "workspace" sourceType StudioModelOption', () => {
    const route: LLMRouteOption = {
      optionId: 'llm-route:planner:setup:gpt-4o',
      apiKeyId: null,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: 'gpt-4o',
      label: 'OpenAI GPT-5.4 Mini',
      providerLabel: 'OpenAI',
      isSaved: false,
    }
    const result = routeToStudioOption(route)
    expect(result.sourceType).toBe('workspace')
    expect(result.keyId).toBeUndefined()
    expect(result.displayLabel).toBe('OpenAI GPT-5.4 Mini')
  })

  it('falls back to adapterType when modelId missing (enhance scope)', () => {
    const route: LLMRouteOption = {
      optionId: 'llm-route:enhance:setup-adapter:openai',
      apiKeyId: null,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      label: 'openai',
      providerLabel: 'openai',
      isSaved: false,
    }
    const result = routeToStudioOption(route)
    expect(result.modelId).toBe(AI_ADAPTER_TYPES.OPENAI)
  })

  it('routes locked options to locked group via useSplitModelOptions semantics', () => {
    // sourceType='workspace' with no key → useSplitModelOptions puts it in the
    // locked group. Cross-hook integration: LLM lockedRoutes must land there.
    const lockedRoute: LLMRouteOption = {
      optionId: 'opt',
      apiKeyId: null,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      label: 'Gemini',
      providerLabel: 'Gemini',
      isSaved: false,
    }
    const result = routeToStudioOption(lockedRoute)
    expect(result.sourceType).toBe('workspace')
    expect(result.providerKeyId).toBeUndefined()
  })
})
