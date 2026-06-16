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

const modelFixtures = vi.hoisted(() => {
  const makeModelOption = (optionId: string) => {
    const modelId = optionId.replace('workspace:', '')
    return {
      optionId,
      modelId,
      adapterType: 'fal',
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.ai' },
      requestCount: 1,
      isBuiltIn: false,
      sourceType: 'workspace',
    }
  }

  return {
    image: makeModelOption('workspace:image-only-model'),
    video: makeModelOption('workspace:video-only-model'),
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
    dispatch: vi.fn(),
  })),
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: vi.fn(() => ({
    modelOptions: [modelFixtures.image],
  })),
}))

vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: vi.fn(() => ({
    modelOptions: [modelFixtures.video],
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
})
