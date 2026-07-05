import 'server-only'

import {
  AUDIO_EXPRESSIVENESS,
  EXPRESSIVENESS_TO_ELEVENLABS,
} from '@/constants/audio-options'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  ProviderError,
  type HealthCheckInput,
  type HealthCheckResult,
  type ProviderAdapter,
  type ProviderAudioInput,
  type ProviderAudioResult,
  type ProviderGenerationResult,
} from '@/services/providers/types'

/**
 * ElevenLabs default voice ("Rachel") — used when the caller does not bind a
 * specific voice. ElevenLabs requires a voiceId in the path, so we cannot omit
 * it the way Fish Audio can.
 */
const ELEVENLABS_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

/** Approximate MP3 bitrate for duration estimation (128 kbps ≈ 16000 B/s). */
const ELEVENLABS_MP3_BYTES_PER_SEC = 16000

function buildVoiceSettings(
  input: ProviderAudioInput,
): Record<string, unknown> {
  // Expressiveness drives v3's emotion responsiveness: lower stability = more
  // reactive to `[tag]` cues, higher style = more delivery variation. Without
  // this, a fixed stability 0.5 / style 0 flattens every emotion tag.
  const tier = input.expressiveness ?? AUDIO_EXPRESSIVENESS.NATURAL
  const { stability, style } = EXPRESSIVENESS_TO_ELEVENLABS[tier]
  const voiceSettings: Record<string, unknown> = {
    stability,
    similarity_boost: 0.75,
    style,
    use_speaker_boost: true,
  }
  if (input.speed !== undefined) {
    voiceSettings.speed = input.speed
  }
  return voiceSettings
}

/**
 * ElevenLabs provider adapter — TTS (Text-to-Speech) only, eleven_v3 model.
 *
 * Synchronous API: POST /v1/text-to-speech/{voiceId} → raw audio bytes (no
 * JSON envelope). Auth header is `xi-api-key` (NOT Bearer). Image generation is
 * not supported (throws ProviderError).
 */
export const elevenLabsAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.ELEVENLABS,

  async generateImage(): Promise<ProviderGenerationResult> {
    throw new ProviderError(
      'ElevenLabs',
      400,
      'Image generation is not supported by ElevenLabs',
    )
  },

  async generateAudio(input: ProviderAudioInput): Promise<ProviderAudioResult> {
    const { prompt, modelId, providerConfig, apiKey, voiceId, sampleRate } =
      input

    const resolvedVoiceId = voiceId ?? ELEVENLABS_DEFAULT_VOICE_ID
    const outputFormat = 'mp3'
    const outputSampleRate = sampleRate ?? 44100

    const response = await fetch(
      `${providerConfig.baseUrl}/v1/text-to-speech/${resolvedVoiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: prompt,
          model_id: modelId,
          voice_settings: buildVoiceSettings(input),
        }),
      },
    )

    if (!response.ok) {
      const detail = await response.text().catch(() => 'Unknown error')
      throw new ProviderError('ElevenLabs', response.status, detail)
    }

    const audioBuffer = await response.arrayBuffer()
    const estimatedDuration = Math.round(
      audioBuffer.byteLength / ELEVENLABS_MP3_BYTES_PER_SEC,
    )

    return {
      audioUrl: `data:audio/mpeg;base64,${Buffer.from(audioBuffer).toString('base64')}`,
      duration: estimatedDuration,
      format: outputFormat,
      sampleRate: outputSampleRate,
      requestCount: 1,
    }
  },

  async generateSoundEffect(
    input: ProviderAudioInput,
  ): Promise<ProviderAudioResult> {
    const {
      prompt,
      providerConfig,
      apiKey,
      durationSeconds,
      loop,
      promptInfluence,
      sampleRate,
    } = input

    const outputFormat = 'mp3'
    const outputSampleRate = sampleRate ?? 44100

    const body: Record<string, unknown> = { text: prompt }
    if (durationSeconds !== undefined) body.duration_seconds = durationSeconds
    if (loop !== undefined) body.loop = loop
    if (promptInfluence !== undefined) body.prompt_influence = promptInfluence

    const response = await fetch(
      `${providerConfig.baseUrl}/v1/sound-generation?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )

    if (!response.ok) {
      const detail = await response.text().catch(() => 'Unknown error')
      throw new ProviderError('ElevenLabs', response.status, detail)
    }

    const audioBuffer = await response.arrayBuffer()
    const estimatedDuration =
      durationSeconds ??
      Math.round(audioBuffer.byteLength / ELEVENLABS_MP3_BYTES_PER_SEC)

    return {
      audioUrl: `data:audio/mpeg;base64,${Buffer.from(audioBuffer).toString('base64')}`,
      duration: estimatedDuration,
      format: outputFormat,
      sampleRate: outputSampleRate,
      requestCount: 1,
    }
  },

  async healthCheck({
    apiKey,
    baseUrl,
    timeoutMs,
  }: HealthCheckInput): Promise<HealthCheckResult> {
    const start = Date.now()
    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        method: 'GET',
        headers: { 'xi-api-key': apiKey },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const latencyMs = Date.now() - start
      if (response.ok) {
        return { status: 'available' as const, latencyMs }
      }
      return {
        status: 'unavailable' as const,
        latencyMs,
        error: `HTTP ${response.status}`,
      }
    } catch (err) {
      return {
        status: 'unavailable' as const,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },
}
