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

  it('sends prosody, quality, and multi-speaker fields in Fish request body', async () => {
    const generateAudio = fishAudioAdapter.generateAudio
    if (!generateAudio) throw new Error('Fish Audio generateAudio missing')

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from(Buffer.from('fake-mp3-bytes')), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await generateAudio({
      ...BASE_AUDIO_INPUT,
      prompt: '<|speaker:0|>Hello<|speaker:1|>Hi',
      speakerVoiceIds: ['alice-id', 'bob-id'],
      speed: 1.35,
      volume: 3,
      normalizeLoudness: true,
      normalizeText: true,
      format: 'opus',
      sampleRate: 48000,
      opusBitrate: 32000,
      latency: 'balanced',
      temperature: 0.8,
      topP: 0.75,
      chunkLength: 120,
      repetitionPenalty: 1.25,
    })

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      text: '<|speaker:0|>Hello<|speaker:1|>Hi',
      reference_id: ['alice-id', 'bob-id'],
      prosody: {
        speed: 1.35,
        volume: 3,
        normalize_loudness: true,
      },
      normalize: true,
      format: 'opus',
      sample_rate: 48000,
      opus_bitrate: 32000,
      latency: 'balanced',
      temperature: 0.8,
      top_p: 0.75,
      chunk_length: 120,
      repetition_penalty: 1.25,
    })
  })

  it('sends inline reference text when using zero-shot reference audio', async () => {
    const generateAudio = fishAudioAdapter.generateAudio
    if (!generateAudio) throw new Error('Fish Audio generateAudio missing')

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from(Buffer.from('fake-mp3-bytes')), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await generateAudio({
      ...BASE_AUDIO_INPUT,
      referenceAudioUrl: 'https://cdn.example.com/reference.wav',
      referenceText: '  Reference voice transcript  ',
    })

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body))

    expect(body.reference_id).toBeUndefined()
    expect(body.references).toEqual([
      {
        audio: 'https://cdn.example.com/reference.wav',
        text: 'Reference voice transcript',
      },
    ])
  })

  it('maps expressiveness to a default temperature when none is set', async () => {
    const generateAudio = fishAudioAdapter.generateAudio
    if (!generateAudio) throw new Error('Fish Audio generateAudio missing')

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from(Buffer.from('fake-mp3-bytes')), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await generateAudio({ ...BASE_AUDIO_INPUT, expressiveness: 'dramatic' })

    const body = JSON.parse(
      String((mockFetch.mock.calls[0]?.[1] as RequestInit).body),
    )
    expect(body.temperature).toBe(0.9)
  })

  it('lets an explicit temperature win over expressiveness', async () => {
    const generateAudio = fishAudioAdapter.generateAudio
    if (!generateAudio) throw new Error('Fish Audio generateAudio missing')

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from(Buffer.from('fake-mp3-bytes')), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await generateAudio({
      ...BASE_AUDIO_INPUT,
      expressiveness: 'dramatic',
      temperature: 0.6,
    })

    const body = JSON.parse(
      String((mockFetch.mock.calls[0]?.[1] as RequestInit).body),
    )
    expect(body.temperature).toBe(0.6)
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
