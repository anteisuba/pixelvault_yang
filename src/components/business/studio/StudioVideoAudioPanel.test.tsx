import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VIDEO_REFERENCE_LIMITS } from '@/constants/video-reference-limits'

import { StudioVideoAudioPanel } from './StudioVideoAudioPanel'

const audioReferences = Array.from(
  { length: VIDEO_REFERENCE_LIMITS.AUDIO },
  (_, index) => ({
    id: `audio-${index}`,
    url: `https://cdn.example.com/audio-${index}.mp3`,
    fileName: `audio-${index}.mp3`,
  }),
)

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      selectedOptionId: 'seedance-2.5',
      videoAudioRefs: audioReferences,
    },
    dispatch: vi.fn(),
  }),
  useStudioData: () => ({ characters: { activeCards: [] } }),
}))

vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: () => ({
    selectedModel: { modelId: 'seedance-2.5', adapterType: 'volcengine' },
  }),
}))

vi.mock('@/constants/video-model-send-plan', () => ({
  getVideoModelSendContract: () => ({
    slots: { audio: VIDEO_REFERENCE_LIMITS.AUDIO },
  }),
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

vi.mock(
  '@/components/business/studio-shared/primitives/AudioOwnerPicker',
  () => ({
    AudioOwnerPicker: () => null,
  }),
)

vi.mock('@/components/ui/audio-player', () => ({
  AudioPlayer: () => null,
}))

describe('StudioVideoAudioPanel', () => {
  it('disables both add paths and explains why at the audio limit', () => {
    render(<StudioVideoAudioPanel />)

    expect(screen.getByRole('button', { name: 'upload' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'fromAssets' })).toBeDisabled()
    expect(screen.getByText('limitReached')).toBeVisible()
  })
})
