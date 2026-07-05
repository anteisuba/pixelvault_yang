import { afterEach, describe, it, expect, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

vi.mock('server-only', () => ({}))

import { elevenLabsAdapter } from './elevenlabs.adapter'

afterEach(() => vi.unstubAllGlobals())

const BASE_AUDIO_INPUT = {
  prompt: 'Hello from ElevenLabs.',
  modelId: 'eleven_v3',
  providerConfig: {
    label: 'ElevenLabs',
    baseUrl: AI_PROVIDER_ENDPOINTS.ELEVENLABS,
  },
  apiKey: 'eleven-test-key',
  voiceId: 'voice-1',
}

function mockAudioFetch() {
  const mockFetch = vi.fn().mockResolvedValue(
    new Response(Uint8Array.from(Buffer.from('fake-mp3-bytes')), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    }),
  )
  vi.stubGlobal('fetch', mockFetch)
  return mockFetch
}

function readVoiceSettings(mockFetch: ReturnType<typeof vi.fn>) {
  const init = mockFetch.mock.calls[0]?.[1] as RequestInit
  return JSON.parse(String(init.body)).voice_settings as {
    stability: number
    style: number
  }
}

describe('elevenLabsAdapter.generateAudio voice_settings', () => {
  it('maps the dramatic tier to low stability + higher style', async () => {
    const generateAudio = elevenLabsAdapter.generateAudio
    if (!generateAudio) throw new Error('ElevenLabs generateAudio missing')

    const mockFetch = mockAudioFetch()
    await generateAudio({ ...BASE_AUDIO_INPUT, expressiveness: 'dramatic' })

    expect(readVoiceSettings(mockFetch)).toMatchObject({
      stability: 0,
      style: 0.6,
    })
  })

  it('maps the restrained tier to high stability + zero style', async () => {
    const generateAudio = elevenLabsAdapter.generateAudio
    if (!generateAudio) throw new Error('ElevenLabs generateAudio missing')

    const mockFetch = mockAudioFetch()
    await generateAudio({ ...BASE_AUDIO_INPUT, expressiveness: 'restrained' })

    expect(readVoiceSettings(mockFetch)).toMatchObject({
      stability: 1,
      style: 0,
    })
  })

  it('falls back to the natural tier when expressiveness is absent', async () => {
    const generateAudio = elevenLabsAdapter.generateAudio
    if (!generateAudio) throw new Error('ElevenLabs generateAudio missing')

    const mockFetch = mockAudioFetch()
    await generateAudio(BASE_AUDIO_INPUT)

    expect(readVoiceSettings(mockFetch)).toMatchObject({
      stability: 0.5,
      style: 0.35,
    })
  })
})

describe('elevenLabsAdapter.generateSoundEffect', () => {
  it('posts the SFX params to the sound-generation endpoint', async () => {
    const generateSoundEffect = elevenLabsAdapter.generateSoundEffect
    if (!generateSoundEffect) {
      throw new Error('ElevenLabs generateSoundEffect missing')
    }

    const mockFetch = mockAudioFetch()
    const result = await generateSoundEffect({
      prompt: 'thunder rumbling in the distance',
      modelId: 'eleven-sfx-v2',
      providerConfig: {
        label: 'ElevenLabs',
        baseUrl: AI_PROVIDER_ENDPOINTS.ELEVENLABS,
      },
      apiKey: 'eleven-test-key',
      durationSeconds: 5,
      loop: true,
      promptInfluence: 0.6,
    })

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v1/sound-generation')
    expect(JSON.parse(String(init.body))).toEqual({
      text: 'thunder rumbling in the distance',
      duration_seconds: 5,
      loop: true,
      prompt_influence: 0.6,
    })
    expect(result.audioUrl).toMatch(/^data:audio/)
    // Explicit duration is echoed back rather than estimated from bytes.
    expect(result.duration).toBe(5)
  })

  it('omits duration/loop/influence when not provided', async () => {
    const generateSoundEffect = elevenLabsAdapter.generateSoundEffect
    if (!generateSoundEffect) {
      throw new Error('ElevenLabs generateSoundEffect missing')
    }

    const mockFetch = mockAudioFetch()
    await generateSoundEffect({
      prompt: 'glass shatter',
      modelId: 'eleven-sfx-v2',
      providerConfig: {
        label: 'ElevenLabs',
        baseUrl: AI_PROVIDER_ENDPOINTS.ELEVENLABS,
      },
      apiKey: 'eleven-test-key',
    })

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ text: 'glass shatter' })
  })
})
