import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { StudioCommandPalette } from '@/components/business/studio-shared/chrome/StudioCommandPalette'

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

const harness = vi.hoisted(() => ({
  dispatch: vi.fn(),
  openKeySettings: vi.fn(),
  /** key 名单回没回来 —— 默认回来了。 */
  keysLoaded: true,
}))

const modelFixtures = vi.hoisted(() => {
  const makeModelOption = (optionId: string, keyId?: string) => {
    const modelId = optionId.replace('workspace:', '')
    return {
      optionId,
      modelId,
      adapterType: 'fal',
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.ai' },
      requestCount: 1,
      isBuiltIn: false,
      sourceType: 'workspace',
      ...(keyId ? { keyId, sourceType: 'saved' } : {}),
    }
  }

  return {
    image: makeModelOption('workspace:image-only-model'),
    video: makeModelOption('workspace:video-only-model'),
    videoReady: makeModelOption('workspace:video-ready-model', 'key-1'),
    audio: makeModelOption('workspace:audio-only-model'),
  }
})

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: vi.fn(() => ({
    state: {
      outputType: 'video',
      selectedOptionId: null,
      workflowMode: 'quick',
    },
    dispatch: harness.dispatch,
  })),
}))

vi.mock('@/hooks/use-open-key-settings', () => ({
  useOpenKeySettings: () => harness.openKeySettings,
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: () => ({ hasLoaded: harness.keysLoaded }),
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: vi.fn(() => ({
    modelOptions: [modelFixtures.image],
  })),
}))

vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: vi.fn(() => ({
    modelOptions: [modelFixtures.video, modelFixtures.videoReady],
  })),
}))

vi.mock('@/hooks/use-audio-model-options', () => ({
  useAudioModelOptions: vi.fn(() => ({
    modelOptions: [modelFixtures.audio],
  })),
}))

vi.mock('@/components/business/LoraTrainingDialog', () => ({
  LoraTrainingDialog: () => null,
}))

describe('StudioCommandPalette', () => {
  it('lists models for the current output type', () => {
    render(<StudioCommandPalette />)

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })

    expect(screen.getByText('video-only-model')).toBeInTheDocument()
    expect(screen.queryByText('image-only-model')).not.toBeInTheDocument()
    expect(screen.queryByText('audio-only-model')).not.toBeInTheDocument()
  })

  it('没配 key 的模型选不上：不改当前模型，直接去配它那一家的 key', () => {
    harness.dispatch.mockClear()
    harness.openKeySettings.mockClear()
    render(<StudioCommandPalette />)
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })

    fireEvent.click(screen.getByText('video-only-model'))

    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(harness.openKeySettings).toHaveBeenCalledWith('fal')
  })

  it('配好 key 的模型照常选中', () => {
    harness.dispatch.mockClear()
    harness.openKeySettings.mockClear()
    render(<StudioCommandPalette />)
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })

    fireEvent.click(screen.getByText('video-ready-model'))

    expect(harness.dispatch).toHaveBeenCalledWith({
      type: 'SET_OPTION_ID',
      payload: 'workspace:video-ready-model',
    })
    expect(harness.openKeySettings).not.toHaveBeenCalled()
  })

  it('key 名单还没回来：不知道缺不缺，照常选中、⛔ 不跳配置页', () => {
    harness.dispatch.mockClear()
    harness.openKeySettings.mockClear()
    harness.keysLoaded = false
    try {
      render(<StudioCommandPalette />)
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true })

      fireEvent.click(screen.getByText('video-only-model'))

      expect(harness.dispatch).toHaveBeenCalledWith({
        type: 'SET_OPTION_ID',
        payload: 'workspace:video-only-model',
      })
      expect(harness.openKeySettings).not.toHaveBeenCalled()
    } finally {
      harness.keysLoaded = true
    }
  })
})
