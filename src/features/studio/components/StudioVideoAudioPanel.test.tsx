import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { VIDEO_REFERENCE_LIMITS } from '@/constants/video-reference-limits'
import { text } from '@/test/i18n-text'
import { fakeStudioServer, renderWithStudio } from '@/test/studio-harness'

import { StudioVideoAudioPanel } from './StudioVideoAudioPanel'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/video',
  useRouter: () => ({ push: vi.fn() }),
}))

beforeEach(() => {
  fakeStudioServer()
})
afterEach(() => vi.unstubAllGlobals())

describe('StudioVideoAudioPanel', () => {
  it('disables both add paths and explains why at the audio limit', () => {
    const { studio } = renderWithStudio(<StudioVideoAudioPanel />)
    // 真工作台：选 Seedance 2.5（全仓音频槽最多的型号），把音频槽挂满。
    const slots = VIDEO_REFERENCE_LIMITS.AUDIO
    act(() => {
      studio.current.dispatch({
        type: 'SET_OPTION_ID',
        payload: `workspace:${AI_MODELS.SEEDANCE_25}`,
      })
      studio.current.dispatch({
        type: 'SET_VIDEO_AUDIO_REFS',
        payload: Array.from({ length: slots }, (_, index) => ({
          id: `audio-${index}`,
          url: `https://cdn.example.com/audio-${index}.mp3`,
          fileName: `audio-${index}.mp3`,
        })),
      })
    })

    expect(
      screen.getByRole('button', { name: text('StudioVideoAudio.upload') }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: text('StudioVideoAudio.fromAssets') }),
    ).toBeDisabled()
    expect(
      screen.getByText(text('StudioVideoAudio.limitReached', { max: slots })),
    ).toBeVisible()
  })
})
