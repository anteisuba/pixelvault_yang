import {
  FISH_SEGMENTS,
  fishSegmentMaxTokens,
  fishSegmentRanAway,
  splitFishSegments,
} from '../../../../../src/lib/fish-segments'
import type { ExecutionEnv, WorkerAudioRunContext } from '../../index'
import { base64ToBytes } from '../../lib/bytes'
import { isRecord, readNumberField, readStringField } from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import { buildR2PublicUrl, R2_OBJECT_CACHE_CONTROL } from '../../lib/image-io'
import {
  createProviderNoOutputError,
  createProviderResponseError,
} from '../../lib/provider-error'

export interface FishAudioSubmitResult {
  artifactUrl: string
  audioR2Key: string
  mimeType: string
  duration?: number
  providerMetadata: Record<string, unknown>
}

export function getAudioMimeSubtype(format: string): string {
  if (format === 'mp3') return 'mpeg'
  return format
}

export function getAudioMimeType(format: string): string {
  return `audio/${getAudioMimeSubtype(format)}`
}

export function getEstimatedAudioDuration(
  byteLength: number,
  format: string,
  sampleRate?: number,
): number {
  if (format === 'wav') {
    const bytesPerSecond = (sampleRate ?? 44100) * 2
    return Math.max(1, Math.round(byteLength / bytesPerSecond))
  }

  const bytesPerSecond = format === 'opus' ? 4000 : 16000
  return Math.max(1, Math.round(byteLength / bytesPerSecond))
}

export function appendDefinedBodyValue(
  body: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) {
    body[key] = value
  }
}

export function buildFishAudioRequestBody(
  context: WorkerAudioRunContext,
): Record<string, unknown> {
  const { providerInput } = context
  const outputFormat = providerInput.format ?? 'mp3'
  const body: Record<string, unknown> = {
    text: providerInput.prompt,
    format: outputFormat,
    normalize: providerInput.normalizeText ?? true,
  }

  appendDefinedBodyValue(body, 'sample_rate', providerInput.sampleRate)

  if (providerInput.speakerVoiceIds?.length) {
    body.reference_id = providerInput.speakerVoiceIds
  } else if (providerInput.voiceId) {
    body.reference_id = providerInput.voiceId
  } else if (providerInput.referenceAudioUrl && providerInput.referenceText) {
    body.references = [
      {
        audio: providerInput.referenceAudioUrl,
        text: providerInput.referenceText.trim(),
      },
    ]
  } else {
    throw new Error(
      'Fish Audio requires a voice ID or a reference audio/transcript pair.',
    )
  }

  const prosody: Record<string, unknown> = {}
  appendDefinedBodyValue(prosody, 'speed', providerInput.speed)
  appendDefinedBodyValue(prosody, 'volume', providerInput.volume)
  appendDefinedBodyValue(
    prosody,
    'normalize_loudness',
    providerInput.normalizeLoudness,
  )
  if (Object.keys(prosody).length > 0) {
    body.prosody = prosody
  }

  if (outputFormat === 'mp3') {
    appendDefinedBodyValue(body, 'mp3_bitrate', providerInput.mp3Bitrate)
  }
  if (outputFormat === 'opus') {
    appendDefinedBodyValue(body, 'opus_bitrate', providerInput.opusBitrate)
  }

  appendDefinedBodyValue(body, 'latency', providerInput.latency)
  appendDefinedBodyValue(body, 'temperature', providerInput.temperature)
  appendDefinedBodyValue(body, 'top_p', providerInput.topP)
  appendDefinedBodyValue(body, 'chunk_length', providerInput.chunkLength)
  appendDefinedBodyValue(
    body,
    'repetition_penalty',
    providerInput.repetitionPenalty,
  )

  return body
}

export function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return combined
}

export function parseFishTimestampEvent(
  eventText: string,
  chunks: Uint8Array[],
): number | null {
  const dataLine = eventText
    .split('\n')
    .find((line) => line.startsWith('data: '))
  if (!dataLine) return null

  const event = JSON.parse(dataLine.slice(6)) as unknown
  if (!isRecord(event)) return null

  const audioBase64 = readStringField(event, 'audio_base64')
  if (audioBase64) {
    chunks.push(base64ToBytes(audioBase64))
  }

  const offset = readNumberField(event, 'chunk_audio_offset_sec') ?? 0
  const alignment = isRecord(event.alignment) ? event.alignment : null
  const audioDuration = alignment
    ? (readNumberField(alignment, 'audio_duration') ?? 0)
    : 0

  return audioDuration > 0 ? offset + audioDuration : null
}

export async function parseFishTimestampStream(response: Response): Promise<{
  audioBytes: Uint8Array
  duration?: number
  chunkCount: number
}> {
  if (!response.body) {
    throw new Error('Fish Audio timestamp stream returned an empty body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: Uint8Array[] = []
  let buffer = ''
  let duration = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const eventText of events) {
      duration = Math.max(
        duration,
        parseFishTimestampEvent(eventText, chunks) ?? 0,
      )
    }
  }

  if (buffer.trim()) {
    duration = Math.max(duration, parseFishTimestampEvent(buffer, chunks) ?? 0)
  }

  return {
    audioBytes: concatUint8Arrays(chunks),
    duration: duration > 0 ? Math.round(duration) : undefined,
    chunkCount: chunks.length,
  }
}

/** 念一段（分段里的一段）：按字数给 `max_new_tokens`，回来的 mp3 按码率算时长。 */
export async function synthesizeFishSegment(
  context: WorkerAudioRunContext,
  url: string,
  apiKey: string,
  segment: string,
): Promise<{ audioBytes: Uint8Array; seconds: number }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
      model: context.providerInput.externalModelId,
    },
    body: JSON.stringify({
      ...buildFishAudioRequestBody(context),
      text: segment,
      max_new_tokens: fishSegmentMaxTokens(segment),
    }),
  })
  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'fish_audio',
      phase: 'tts',
      fallbackMessage: `Fish Audio TTS failed with status ${response.status}`,
      providerMetadata: {
        endpointPath: '/v1/tts',
        model: context.providerInput.externalModelId,
      },
    })
  }
  const audioBytes = new Uint8Array(await response.arrayBuffer())
  // 码率（kbps）× 125 = 每秒字节数；Fish 默认 128。
  const bytesPerSecond = (context.providerInput.mp3Bitrate ?? 128) * 125
  return { audioBytes, seconds: audioBytes.byteLength / bytesPerSecond }
}

/**
 * 按行分段念、再首尾拼成一条（owner 10-30「一口气说不完就分段说」）：每段按字数给上限，撞上限（没收住、
 * 后面全是语气声）的那段重念一次，取短的那版。几段一起念，顺序不变。
 */
export async function synthesizeFishSegments(
  context: WorkerAudioRunContext,
  url: string,
  apiKey: string,
): Promise<{
  audioBytes: Uint8Array
  duration: undefined
  chunkCount: number
}> {
  const segments = splitFishSegments(context.providerInput.prompt)
  const parts: Uint8Array[] = new Array(segments.length)
  let next = 0
  const worker = async () => {
    while (next < segments.length) {
      const index = next
      next += 1
      const segment = segments[index]!
      let take = await synthesizeFishSegment(context, url, apiKey, segment)
      if (fishSegmentRanAway(segment, take.seconds)) {
        const again = await synthesizeFishSegment(context, url, apiKey, segment)
        if (again.seconds < take.seconds) take = again
      }
      parts[index] = take.audioBytes
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(FISH_SEGMENTS.concurrency, segments.length) },
      worker,
    ),
  )
  return {
    audioBytes: concatUint8Arrays(parts),
    duration: undefined,
    chunkCount: segments.length,
  }
}

export async function submitFishAudio(
  env: ExecutionEnv,
  context: WorkerAudioRunContext,
  apiKey: string,
): Promise<FishAudioSubmitResult> {
  const { providerInput } = context
  const outputFormat = providerInput.format ?? 'mp3'
  const mimeType = getAudioMimeType(outputFormat)
  const endpointPath = providerInput.withTimestamps
    ? '/v1/tts/stream/with-timestamp'
    : '/v1/tts'
  const baseUrl = (
    providerInput.providerBaseUrl ?? 'https://api.fish.audio'
  ).replace(/\/$/, '')

  // 一段话按行分段生成再拼（owner 10-30）：mp3 能直接首尾相接；多人合成、带时间戳的流照旧一次念完。
  const segmented =
    !providerInput.withTimestamps &&
    outputFormat === 'mp3' &&
    !providerInput.speakerVoiceIds?.length

  const response = segmented
    ? null
    : await fetch(`${baseUrl}${endpointPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': JSON_CONTENT_TYPE,
          model: providerInput.externalModelId,
        },
        body: JSON.stringify(buildFishAudioRequestBody(context)),
      })

  if (response && !response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'fish_audio',
      phase: 'tts',
      fallbackMessage: `Fish Audio TTS failed with status ${response.status}`,
      providerMetadata: {
        endpointPath,
        model: providerInput.externalModelId,
      },
    })
  }

  const parsed = !response
    ? await synthesizeFishSegments(context, `${baseUrl}${endpointPath}`, apiKey)
    : providerInput.withTimestamps
      ? await parseFishTimestampStream(response)
      : {
          audioBytes: new Uint8Array(await response.arrayBuffer()),
          duration: undefined,
          chunkCount: undefined,
        }

  if (parsed.audioBytes.byteLength === 0) {
    throw createProviderNoOutputError({
      provider: 'fish_audio',
      phase: 'tts',
      message: 'Fish Audio returned an empty audio response.',
      providerMetadata: {
        endpointPath,
        model: providerInput.externalModelId,
      },
    })
  }

  const duration =
    parsed.duration ??
    getEstimatedAudioDuration(
      parsed.audioBytes.byteLength,
      outputFormat,
      providerInput.sampleRate,
    )
  const audioR2Key =
    providerInput.outputStorageKey ??
    `generations/worker/audio/${context.runId}/output.${outputFormat}`

  await env.GENERATION_BUCKET.put(audioR2Key, parsed.audioBytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return {
    artifactUrl: buildR2PublicUrl(env, audioR2Key),
    audioR2Key,
    mimeType,
    duration,
    providerMetadata: {
      endpointPath,
      model: providerInput.externalModelId,
      format: outputFormat,
      ...(parsed.chunkCount !== undefined && {
        timestampChunkCount: parsed.chunkCount,
      }),
    },
  }
}
