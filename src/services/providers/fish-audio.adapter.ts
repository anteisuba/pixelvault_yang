import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  ProviderError,
  type HealthCheckInput,
  type HealthCheckResult,
  type ProviderAdapter,
  type ProviderAudioInput,
  type ProviderAudioResult,
  type ProviderAudioTimestampSegment,
  type ProviderGenerationResult,
} from '@/services/providers/types'

interface FishTimestampEvent {
  audio_base64: string
  content: string
  chunk_seq: number
  chunk_audio_offset_sec: number
  alignment: {
    audio_duration: number
    segments: ProviderAudioTimestampSegment[]
  } | null
}

interface FishTimestampChunkAlignment {
  content: string
  offset: number
  audioDuration: number
  segments: ProviderAudioTimestampSegment[]
}

function getAudioMimeSubtype(format: string): string {
  if (format === 'mp3') return 'mpeg'
  return format
}

function appendBodyValue(
  body: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) {
    body[key] = value
  }
}

function buildFishAudioRequestBody(
  input: ProviderAudioInput,
): Record<string, unknown> {
  const {
    prompt,
    voiceId,
    speakerVoiceIds,
    referenceAudioUrl,
    referenceText,
    speed,
    volume,
    normalizeLoudness,
    normalizeText,
    format,
    sampleRate,
    mp3Bitrate,
    opusBitrate,
    latency,
    temperature,
    topP,
    chunkLength,
    repetitionPenalty,
  } = input

  const outputFormat = format ?? 'mp3'
  const body: Record<string, unknown> = {
    text: prompt,
    format: outputFormat,
    normalize: normalizeText ?? true,
  }

  if (sampleRate !== undefined) body.sample_rate = sampleRate
  if (speakerVoiceIds && speakerVoiceIds.length > 0) {
    body.reference_id = speakerVoiceIds
  } else if (voiceId) {
    body.reference_id = voiceId
  } else if (referenceAudioUrl && referenceText?.trim()) {
    body.references = [
      {
        audio: referenceAudioUrl,
        text: referenceText.trim(),
      },
    ]
  }

  const prosody: Record<string, unknown> = {}
  appendBodyValue(prosody, 'speed', speed)
  appendBodyValue(prosody, 'volume', volume)
  appendBodyValue(prosody, 'normalize_loudness', normalizeLoudness)
  if (Object.keys(prosody).length > 0) {
    body.prosody = prosody
  }

  if (outputFormat === 'mp3') appendBodyValue(body, 'mp3_bitrate', mp3Bitrate)
  if (outputFormat === 'opus') {
    appendBodyValue(body, 'opus_bitrate', opusBitrate)
  }
  appendBodyValue(body, 'latency', latency)
  appendBodyValue(body, 'temperature', temperature)
  appendBodyValue(body, 'top_p', topP)
  appendBodyValue(body, 'chunk_length', chunkLength)
  appendBodyValue(body, 'repetition_penalty', repetitionPenalty)

  return body
}

async function parseTimestampStream(response: Response): Promise<{
  audioBuffer: Buffer
  duration: number
  timestamps: ProviderAudioTimestampSegment[]
}> {
  if (!response.body) {
    throw new ProviderError('Fish Audio', 502, 'Empty timestamp stream')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const audioChunks: Buffer[] = []
  const alignmentByChunk = new Map<number, FishTimestampChunkAlignment>()
  let buffer = ''

  const processEventText = (eventText: string) => {
    const dataLine = eventText
      .split('\n')
      .find((line) => line.startsWith('data: '))
    if (!dataLine) return

    const event = JSON.parse(dataLine.slice(6)) as FishTimestampEvent
    audioChunks.push(Buffer.from(event.audio_base64, 'base64'))
    if (event.alignment) {
      alignmentByChunk.set(event.chunk_seq, {
        content: event.content,
        offset: event.chunk_audio_offset_sec,
        audioDuration: event.alignment.audio_duration,
        segments: event.alignment.segments,
      })
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const eventText of events) processEventText(eventText)
  }

  if (buffer.trim()) {
    processEventText(buffer)
  }

  const timestamps = Array.from(alignmentByChunk.entries())
    .sort(([left], [right]) => left - right)
    .flatMap(([, chunk]) =>
      chunk.segments.map((segment) => ({
        text: segment.text,
        start: segment.start + chunk.offset,
        end: segment.end + chunk.offset,
      })),
    )
  const duration = Array.from(alignmentByChunk.values()).reduce(
    (current, chunk) => Math.max(current, chunk.offset + chunk.audioDuration),
    0,
  )

  return {
    audioBuffer: Buffer.concat(audioChunks),
    duration: Math.round(duration),
    timestamps,
  }
}

/**
 * Fish Audio provider adapter — TTS (Text-to-Speech) only.
 *
 * Synchronous API: POST /v1/tts → audio bytes.
 * Image generation is not supported (throws ProviderError).
 */
export const fishAudioAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,

  async generateImage(): Promise<ProviderGenerationResult> {
    throw new ProviderError(
      'Fish Audio',
      400,
      'Image generation is not supported by Fish Audio',
    )
  },

  async generateAudio(input: ProviderAudioInput): Promise<ProviderAudioResult> {
    const {
      modelId,
      providerConfig,
      apiKey,
      format,
      sampleRate,
      withTimestamps,
    } = input

    const body = buildFishAudioRequestBody(input)
    const outputFormat = format ?? 'mp3'
    const outputSampleRate =
      sampleRate ?? (outputFormat === 'opus' ? 48000 : 44100)
    const endpointPath = withTimestamps
      ? '/v1/tts/stream/with-timestamp'
      : '/v1/tts'

    const response = await fetch(`${providerConfig.baseUrl}${endpointPath}`, {
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

    if (withTimestamps) {
      const parsed = await parseTimestampStream(response)
      return {
        audioUrl: `data:audio/${getAudioMimeSubtype(outputFormat)};base64,${parsed.audioBuffer.toString('base64')}`,
        duration: parsed.duration,
        format: outputFormat,
        sampleRate: outputSampleRate,
        requestCount: 1,
        timestamps: parsed.timestamps,
      }
    }

    const audioBuffer = await response.arrayBuffer()

    // Estimate duration from buffer size (rough: bitrate-based)
    // MP3 ~128kbps = 16000 bytes/sec, WAV ~176400 bytes/sec (44100 * 2 * 2)
    const bytesPerSec = outputFormat === 'wav' ? 176400 : 16000
    const estimatedDuration = Math.round(audioBuffer.byteLength / bytesPerSec)

    return {
      audioUrl: `data:audio/${getAudioMimeSubtype(outputFormat)};base64,${Buffer.from(audioBuffer).toString('base64')}`,
      duration: estimatedDuration,
      format: outputFormat,
      sampleRate: outputSampleRate,
      requestCount: 1,
    }
  },

  async healthCheck({
    apiKey,
    timeoutMs,
  }: HealthCheckInput): Promise<HealthCheckResult> {
    const start = Date.now()
    try {
      const response = await fetch('https://api.fish.audio/model', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
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
