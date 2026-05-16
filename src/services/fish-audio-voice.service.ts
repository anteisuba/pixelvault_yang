import 'server-only'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import type { VoiceLibrarySortBy } from '@/constants/voice-cards'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'

const FISH_AUDIO_API = AI_PROVIDER_ENDPOINTS.FISH_AUDIO
const FISH_AUDIO_ASSET_BASE_URL = `${AI_PROVIDER_ENDPOINTS.FISH_AUDIO_ASSETS}/`

// ─── Types ───────────────────────────────────────────────────────

export interface FishAudioVoice {
  id: string
  title: string
  description: string | null
  coverImage: string | null
  state: 'created' | 'training' | 'trained' | 'failed'
  languages: string[]
  tags: string[]
  samples: FishAudioSample[]
  likeCount: number
  taskCount: number
  visibility: 'public' | 'unlist' | 'private'
  createdAt: string
  author: {
    id: string
    nickname: string
    avatar: string | null
  } | null
}

export interface FishAudioSample {
  title: string | null
  text: string | null
  audio: string
}

export interface FishAudioVoiceListResult {
  total: number
  items: FishAudioVoice[]
}

export interface CreateVoiceParams {
  title: string
  voices: Buffer[]
  voiceFileNames: string[]
  texts?: string[]
  visibility?: 'public' | 'unlist' | 'private'
  description?: string
  enhanceAudioQuality?: boolean
}

export interface FishAudioAsrSegment {
  text: string
  start: number
  end: number
}

export interface FishAudioTranscription {
  text: string
  duration: number
  segments: FishAudioAsrSegment[]
}

export interface TranscribeAudioParams {
  audio: Buffer
  fileName: string
  language?: string
  ignoreTimestamps?: boolean
}

// ─── API Response → Domain Mapping ──────────────────────────────

function normalizeFishAudioAssetUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const absoluteUrl = new URL(trimmed)
    if (absoluteUrl.protocol === 'https:' || absoluteUrl.protocol === 'http:') {
      return absoluteUrl.toString()
    }
  } catch {
    // Relative Fish Audio asset paths are normalized below.
  }

  try {
    return new URL(trimmed, FISH_AUDIO_ASSET_BASE_URL).toString()
  } catch {
    return null
  }
}

function mapVoice(raw: Record<string, unknown>): FishAudioVoice {
  const author = raw.author as Record<string, unknown> | null
  const samples = (raw.samples as Record<string, unknown>[] | null) ?? []

  return {
    id: raw._id as string,
    title: (raw.title as string) ?? '',
    description: (raw.description as string) ?? null,
    coverImage: normalizeFishAudioAssetUrl(raw.cover_image),
    state: (raw.state as FishAudioVoice['state']) ?? 'created',
    languages: (raw.languages as string[]) ?? [],
    tags: (raw.tags as string[]) ?? [],
    samples: samples.map((s) => ({
      title: (s.title as string) ?? null,
      text: (s.text as string) ?? null,
      audio: normalizeFishAudioAssetUrl(s.audio) ?? '',
    })),
    likeCount: (raw.like_count as number) ?? 0,
    taskCount: (raw.task_count as number) ?? 0,
    visibility: (raw.visibility as FishAudioVoice['visibility']) ?? 'public',
    createdAt: (raw.created_at as string) ?? '',
    author: author
      ? {
          id: (author._id as string) ?? '',
          nickname: (author.nickname as string) ?? '',
          avatar: (author.avatar as string) ?? null,
        }
      : null,
  }
}

// ─── List Voices ─────────────────────────────────────────────────

export async function listVoices(
  apiKey: string,
  options: {
    self?: boolean
    pageSize?: number
    pageNumber?: number
    title?: string
    language?: string
    sortBy?: VoiceLibrarySortBy
  } = {},
): Promise<FishAudioVoiceListResult> {
  const params = new URLSearchParams()
  params.set('page_size', String(options.pageSize ?? 20))
  params.set('page_number', String(options.pageNumber ?? 1))
  if (options.self) params.set('self', 'true')
  if (options.title) params.set('title', options.title)
  if (options.language) params.set('language', options.language)
  if (options.sortBy) params.set('sort_by', options.sortBy)

  const response = await withRetry(
    () =>
      fetch(`${FISH_AUDIO_API}/model?${params.toString()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    { maxAttempts: 2, label: 'fish-audio/list-voices' },
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => 'Unknown error')
    logger.error('Fish Audio list voices failed', {
      status: response.status,
      detail: detail.slice(0, 500),
    })
    throw new Error(`Fish Audio API error (${response.status}): ${detail}`)
  }

  const data = (await response.json()) as {
    total: number
    items: Record<string, unknown>[]
  }

  return {
    total: data.total,
    items: data.items.map(mapVoice),
  }
}

// ─── Get Voice ───────────────────────────────────────────────────

export async function getVoice(
  apiKey: string,
  voiceId: string,
): Promise<FishAudioVoice> {
  const response = await fetch(`${FISH_AUDIO_API}/model/${voiceId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => 'Unknown error')
    throw new Error(`Fish Audio API error (${response.status}): ${detail}`)
  }

  return mapVoice((await response.json()) as Record<string, unknown>)
}

// ─── Create Voice (Clone) ────────────────────────────────────────

export async function createVoice(
  apiKey: string,
  params: CreateVoiceParams,
): Promise<FishAudioVoice> {
  const formData = new FormData()
  formData.append('type', 'tts')
  formData.append('title', params.title)
  formData.append('train_mode', 'fast')
  formData.append('visibility', params.visibility ?? 'private')

  if (params.description) {
    formData.append('description', params.description)
  }
  if (params.enhanceAudioQuality) {
    formData.append('enhance_audio_quality', 'true')
  }

  // Append voice files
  for (let i = 0; i < params.voices.length; i++) {
    const uint8 = new Uint8Array(params.voices[i])
    const blob = new Blob([uint8], { type: 'audio/mpeg' })
    formData.append(
      'voices',
      blob,
      params.voiceFileNames[i] ?? `voice-${i}.mp3`,
    )
  }

  // Append corresponding texts
  if (params.texts) {
    for (const text of params.texts) {
      formData.append('texts', text)
    }
  }

  const response = await withRetry(
    () =>
      fetch(`${FISH_AUDIO_API}/model`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      }),
    { maxAttempts: 2, label: 'fish-audio/create-voice' },
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => 'Unknown error')
    logger.error('Fish Audio create voice failed', {
      status: response.status,
      detail: detail.slice(0, 500),
    })
    throw new Error(`Fish Audio API error (${response.status}): ${detail}`)
  }

  return mapVoice((await response.json()) as Record<string, unknown>)
}

// ─── Delete Voice ────────────────────────────────────────────────

export async function deleteVoice(
  apiKey: string,
  voiceId: string,
): Promise<void> {
  const response = await fetch(`${FISH_AUDIO_API}/model/${voiceId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => 'Unknown error')
    throw new Error(`Fish Audio API error (${response.status}): ${detail}`)
  }
}

export async function transcribeAudio(
  apiKey: string,
  params: TranscribeAudioParams,
): Promise<FishAudioTranscription> {
  const formData = new FormData()
  const uint8 = new Uint8Array(params.audio)
  formData.append(
    'audio',
    new Blob([uint8], { type: 'audio/mpeg' }),
    params.fileName,
  )
  if (params.language) {
    formData.append('language', params.language)
  }
  formData.append(
    'ignore_timestamps',
    params.ignoreTimestamps === false ? 'false' : 'true',
  )

  const response = await withRetry(
    () =>
      fetch(`${FISH_AUDIO_API}/v1/asr`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      }),
    { maxAttempts: 2, label: 'fish-audio/asr' },
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => 'Unknown error')
    logger.error('Fish Audio ASR failed', {
      status: response.status,
      detail: detail.slice(0, 500),
    })
    throw new Error(`Fish Audio API error (${response.status}): ${detail}`)
  }

  const data = (await response.json()) as FishAudioTranscription
  return {
    text: data.text,
    duration: data.duration,
    segments: data.segments ?? [],
  }
}
