import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  ProviderError,
  type ProviderAdapter,
  type ProviderAudioInput,
  type ProviderAudioResult,
  type ProviderGenerationInput,
  type ProviderGenerationResult,
} from '@/services/providers/types'

/**
 * Fish Audio provider adapter — TTS (Text-to-Speech) only.
 *
 * Synchronous API: POST /v1/tts → audio bytes.
 * Image generation is not supported (throws ProviderError).
 */
export const fishAudioAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,

  async generateImage(
    _input: ProviderGenerationInput,
  ): Promise<ProviderGenerationResult> {
    throw new ProviderError(
      'Fish Audio',
      400,
      'Image generation is not supported by Fish Audio',
    )
  },

  async generateAudio(input: ProviderAudioInput): Promise<ProviderAudioResult> {
    const {
      prompt,
      modelId,
      providerConfig,
      apiKey,
      voiceId,
      speed,
      format,
      sampleRate,
    } = input

    const body: Record<string, unknown> = {
      text: prompt,
      format: format ?? 'mp3',
      sample_rate: sampleRate ?? 44100,
    }

    if (voiceId) body.reference_id = voiceId
    if (speed !== undefined) body.speed = speed

    const response = await fetch(`${providerConfig.baseUrl}/v1/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        model: modelId,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => 'Unknown error')
      throw new ProviderError('Fish Audio', response.status, detail)
    }

    const audioBuffer = await response.arrayBuffer()
    const outputFormat = format ?? 'mp3'
    const outputSampleRate = sampleRate ?? 44100

    // Estimate duration from buffer size (rough: bitrate-based)
    // MP3 ~128kbps = 16000 bytes/sec, WAV ~176400 bytes/sec (44100 * 2 * 2)
    const bytesPerSec = outputFormat === 'wav' ? 176400 : 16000
    const estimatedDuration = Math.round(audioBuffer.byteLength / bytesPerSec)

    return {
      audioUrl: `data:audio/${outputFormat === 'mp3' ? 'mpeg' : outputFormat};base64,${Buffer.from(audioBuffer).toString('base64')}`,
      duration: estimatedDuration,
      format: outputFormat,
      sampleRate: outputSampleRate,
      requestCount: 1,
    }
  },
}
