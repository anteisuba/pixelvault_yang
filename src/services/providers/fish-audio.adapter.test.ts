import { afterEach, describe, it, expect, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

vi.mock('server-only', () => ({}))

import { fishAudioAdapter } from './fish-audio.adapter'

afterEach(() => vi.unstubAllGlobals())

const BASE_AUDIO_INPUT = {
  prompt: 'Hello, this is a test of the fish audio adapter.',
  modelId: 'fish-speech-1.5',
  providerConfig: {
    label: 'Fish Audio',
    baseUrl: AI_PROVIDER_ENDPOINTS.FISH_AUDIO,
  },
  apiKey: 'fish-test-key',
}

describe('fishAudioAdapter.generateAudio', () => {
  it('returns an audio data URL on success', async () => {
    const generateAudio = fishAudioAdapter.generateAudio
    if (!generateAudio) throw new Error('Fish Audio generateAudio missing')

    const fakeAudioBuffer = Buffer.from('fake-mp3-bytes')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(Uint8Array.from(fakeAudioBuffer), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        }),
      ),
    )

    const result = await generateAudio(BASE_AUDIO_INPUT)

    expect(result.audioUrl).toMatch(/^data:audio/)
  })

  it('throws on error response', async () => {
    const generateAudio = fishAudioAdapter.generateAudio
    if (!generateAudio) throw new Error('Fish Audio generateAudio missing')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    )

    await expect(generateAudio(BASE_AUDIO_INPUT)).rejects.toThrow()
  })
})
