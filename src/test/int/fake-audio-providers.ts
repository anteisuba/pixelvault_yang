/**
 * L2a 语音链路测试共用：假执行 Worker + 假语音服务商（Fish Audio / ElevenLabs / fal 队列）。
 * 全在 fetch 边界上替：服务商 adapter、选路、真解密照用真的。
 *
 * ```ts
 * const audio = installFakeAudioProviders()     // beforeEach 里调
 * … 调真服务 …
 * expect(audio.calls[0].json).toMatchObject({ text: 'Hello' })
 * audio.reply('fish', () => new Response('nope', { status: 400 }))
 * ```
 */
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import {
  installFakeExecutionWorker,
  type FakeExecutionWorker,
} from '@/test/int/execution-worker'

export type AudioProviderName =
  | 'fish'
  | 'fish-timestamps'
  | 'eleven-tts'
  | 'eleven-sfx'
  | 'eleven-music'
  | 'fal-queue-submit'
  | 'fal-queue-status'
  | 'fal-queue-result'
  | 'download'

export interface AudioProviderCall {
  name: AudioProviderName
  url: string
  headers: Headers
  /** 请求体按 JSON 解出来的样子（不是 JSON 就是 `{}`）。 */
  json: Record<string, unknown>
}

type Handler = (call: AudioProviderCall) => Response | Promise<Response>

/** 服务商回的「音频字节」：32000 字节 ≈ mp3 估算的 2 秒。 */
export const FAKE_AUDIO_BYTES = Buffer.alloc(32_000, 7)

export const FAL_QUEUE_STATUS_URL =
  'https://queue.fal.run/requests/req-1/status'
export const FAL_QUEUE_RESULT_URL = 'https://queue.fal.run/requests/req-1'
export const FAL_AUDIO_RESULT_URL = 'https://fal.media/files/out.mp3'

const audio = () =>
  new Response(new Uint8Array(FAKE_AUDIO_BYTES), {
    headers: { 'content-type': 'audio/mpeg' },
  })

const DEFAULT_HANDLERS: Record<AudioProviderName, Handler> = {
  fish: audio,
  'fish-timestamps': () =>
    new Response(
      `data: ${JSON.stringify({
        audio_base64: FAKE_AUDIO_BYTES.toString('base64'),
        content: 'Hello',
        chunk_seq: 0,
        chunk_audio_offset_sec: 0,
        alignment: {
          audio_duration: 1.2,
          segments: [{ text: 'Hello', start: 0, end: 0.4 }],
        },
      })}\n\n`,
      { headers: { 'content-type': 'text/event-stream' } },
    ),
  'eleven-tts': audio,
  'eleven-sfx': audio,
  'eleven-music': audio,
  'fal-queue-submit': () =>
    Response.json({
      request_id: 'req-1',
      status_url: FAL_QUEUE_STATUS_URL,
      response_url: FAL_QUEUE_RESULT_URL,
    }),
  'fal-queue-status': () => Response.json({ status: 'IN_PROGRESS' }),
  'fal-queue-result': () =>
    Response.json({
      audio_url: { url: FAL_AUDIO_RESULT_URL, content_type: 'audio/mpeg' },
    }),
  download: audio,
}

function classify(url: string): AudioProviderName | null {
  const fish = AI_PROVIDER_ENDPOINTS.FISH_AUDIO
  const eleven = AI_PROVIDER_ENDPOINTS.ELEVENLABS
  if (url === `${fish}/v1/tts`) return 'fish'
  if (url === `${fish}/v1/tts/stream/with-timestamp`) return 'fish-timestamps'
  if (url.startsWith(`${eleven}/v1/text-to-speech/`)) return 'eleven-tts'
  if (url.startsWith(`${eleven}/v1/sound-generation`)) return 'eleven-sfx'
  if (url.startsWith(`${eleven}/v1/music`)) return 'eleven-music'
  if (url === FAL_QUEUE_STATUS_URL) return 'fal-queue-status'
  if (url === FAL_QUEUE_RESULT_URL) return 'fal-queue-result'
  if (url.startsWith(`${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/`))
    return 'fal-queue-submit'
  if (url === FAL_AUDIO_RESULT_URL) return 'download'
  return null
}

export interface FakeAudioProviders {
  worker: FakeExecutionWorker
  /** 打给服务商的请求（Worker 之外），按先后。 */
  readonly calls: AudioProviderCall[]
  /** 某一家之后怎么回。 */
  reply(name: AudioProviderName, handler: Handler): void
  callsTo(name: AudioProviderName): AudioProviderCall[]
}

export function installFakeAudioProviders(
  options: { workerInstanceId?: string } = {},
): FakeAudioProviders {
  const handlers = { ...DEFAULT_HANDLERS }
  const calls: AudioProviderCall[] = []
  const worker = installFakeExecutionWorker({
    instanceId: options.workerInstanceId,
    other: async (url, init) => {
      const name = classify(url)
      if (!name) return new Response('not found', { status: 404 })
      let json: Record<string, unknown> = {}
      try {
        json = JSON.parse(String(init?.body ?? '')) as Record<string, unknown>
      } catch {
        json = {}
      }
      const call = { name, url, headers: new Headers(init?.headers), json }
      calls.push(call)
      return handlers[name](call)
    },
  })
  return {
    worker,
    calls,
    reply(name, handler) {
      handlers[name] = handler
    },
    callsTo(name) {
      return calls.filter((call) => call.name === name)
    },
  }
}
