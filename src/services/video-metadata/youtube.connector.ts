import 'server-only'

import { z } from 'zod'

import { RESEARCH_USER_AGENT } from '@/constants/research'
import { VIDEO_METADATA_REQUEST } from '@/constants/video-link'
import { buildYoutubeWatchUrl } from '@/lib/video-link'
import { withRetry } from '@/lib/with-retry'

/**
 * YouTube 的**平台元数据**取数（切片 2 §4.3 收尾批）——⛔ 与视频本体无关。
 *
 * 视频本体走的是 `fileData.fileUri` 直传（`llm-text.service`），这里只回答
 * 「平台自己说这条视频多长、叫什么、谁发的、什么时候发的」。两件事分开是因为
 * **依据不同**：帧是看出来的，时长是平台报的，模型必须能说清哪句话是哪来的。
 *
 * 🔬 实测结论（2026-08-21，真调，免 key）与两个探针的分工写在
 * `VIDEO_METADATA_REQUEST` 上。一句话版：**oEmbed 没有 duration，时长在 watch 页**。
 *
 * **本文件永不上抛**：拿不到就少一个字段，绝不能让一轮对话失败（要求 3）。
 */

export interface YoutubeVideoMetadata {
  title?: string
  author?: string
  durationSeconds?: number
  /** `YYYY-MM-DD`。平台给的是带时区的完整时间戳，日期以外的精度对答题没用。 */
  publishedAt?: string
  thumbnailUrl?: string
  /** 哪几个探针成功了 —— 进块里的 `source:` 行，让「谁说的」可追。 */
  sources: string[]
  /** 失败原因，只记不抛。取不到时块里写 `unknown`，理由记在这里给日志。 */
  errors: string[]
}

/**
 * oEmbed 回包。**只声明我们用的四个键**（zod 默认剥掉其余的）——
 * 🔬 实测里那十几个键有一半是 iframe 尺寸，进不了提示词。
 */
const YoutubeOembedSchema = z.object({
  title: z.string().min(1).optional(),
  author_name: z.string().min(1).optional(),
  thumbnail_url: z.string().min(1).optional(),
})

/** `PT18M40S` → 1120。`lengthSeconds` 缺席时的第二来源。 */
function parseIsoDuration(value: string): number | null {
  const matched = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value)
  if (!matched) return null
  const [, hours, minutes, seconds] = matched
  if (!hours && !minutes && !seconds) return null
  return (
    Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 带上限地把响应读成文本。
 *
 * watch 页 1.5MB 是常态，**没有上限就等于让一条链接决定我们吃多少内存**。
 * 边读边数、超了就断流 —— 目标标记落在 0.8MB 以内，截断不影响取数。
 */
async function readTextCapped(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const body = response.body
  if (!body) return response.text()

  const reader = body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let readBytes = 0
  try {
    while (readBytes < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      readBytes += value.byteLength
      chunks.push(decoder.decode(value, { stream: true }))
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return `${chunks.join('')}${decoder.decode()}`
}

async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(url, {
        headers: { 'User-Agent': RESEARCH_USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        // `with-retry` 按 `error.status` 判可重试：4xx 不重试（🔬 取不到的
        // 视频回的就是 400，重试三次也还是 400），5xx / 429 才退避重试。
        throw Object.assign(
          new Error(`${label} responded ${response.status}`),
          {
            status: response.status,
          },
        )
      }
      return response
    },
    {
      label,
      maxAttempts: VIDEO_METADATA_REQUEST.maxAttempts,
      baseDelayMs: VIDEO_METADATA_REQUEST.retryBaseDelayMs,
    },
  )
}

/** 探针 1：oEmbed。标题 / 作者 / 封面 —— ⛔ 这条路上没有时长。 */
async function probeOembed(
  watchUrl: string,
): Promise<Partial<YoutubeVideoMetadata>> {
  const url = `${VIDEO_METADATA_REQUEST.oembedEndpoint}?url=${encodeURIComponent(
    watchUrl,
  )}&format=json`
  const response = await fetchWithRetry(
    url,
    VIDEO_METADATA_REQUEST.oembedTimeoutMs,
    'youtube.oembed',
  )
  // ⚠ 400 的 body 是纯文本却带着 json 的 content-type —— `response.json()` 会
  //   抛解析错。上面的 `response.ok` 已经把它挡在外面了，这里只处理 2xx。
  const parsed = YoutubeOembedSchema.safeParse(await response.json())
  if (!parsed.success) {
    throw new Error('youtube oembed returned an unexpected shape')
  }
  return {
    title: parsed.data.title,
    author: parsed.data.author_name,
    thumbnailUrl: parsed.data.thumbnail_url,
  }
}

/**
 * 探针 2：watch 页。**时长的唯一免 key 来源**，顺带发布日、标题、作者。
 *
 * 标题/作者在这里再取一次不是冗余：oEmbed 挂掉时它是唯一还能报出「这是哪条
 * 视频」的地方，而「元数据块里只剩 unknown」对用户毫无帮助。
 */
async function probeWatchPage(
  watchUrl: string,
): Promise<Partial<YoutubeVideoMetadata>> {
  const response = await fetchWithRetry(
    watchUrl,
    VIDEO_METADATA_REQUEST.pageTimeoutMs,
    'youtube.watch',
  )
  const html = await readTextCapped(
    response,
    VIDEO_METADATA_REQUEST.pageMaxBytes,
  )

  // `lengthSeconds` 在 `ytInitialPlayerResponse` 里，`itemprop="duration"` 在
  // schema.org 的 meta 上。两处独立，任一在就够 —— 页面改版时不至于一起丢。
  const lengthSeconds = /"lengthSeconds"\s*:\s*"(\d+)"/.exec(html)?.[1]
  const isoDuration = /itemprop="duration"\s+content="(PT[^"]+)"/.exec(
    html,
  )?.[1]
  const durationSeconds = lengthSeconds
    ? Number(lengthSeconds)
    : isoDuration
      ? parseIsoDuration(isoDuration)
      : null

  const publishDate = /"(?:publishDate|uploadDate)"\s*:\s*"([^"]+)"/.exec(
    html,
  )?.[1]

  if (durationSeconds === null || durationSeconds === undefined) {
    // 读到了页面但没有时长 = 拿到的多半是 consent / 风控页。**说清楚是哪种失败**
    // （§3.4 第 1 闸），别让日志里只剩一句「取不到」。
    throw new Error(
      'youtube watch page carried no duration (consent or bot-check page?)',
    )
  }

  return {
    durationSeconds,
    publishedAt: publishDate?.slice(0, 10),
    title: /<meta name="title" content="([^"]*)"/.exec(html)?.[1],
    author: /<link itemprop="name" content="([^"]*)"/.exec(html)?.[1],
  }
}

/** `Object.assign` 会拿 `undefined` 把已有值盖掉 —— 探针没取到的字段不许覆盖。 */
function assignDefined(
  target: YoutubeVideoMetadata,
  source: Partial<YoutubeVideoMetadata>,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      Object.assign(target, { [key]: value })
    }
  }
}

/**
 * 一条 YouTube 视频的元数据。**两个探针并行，各自失败各自算。**
 *
 * 合并顺序：watch 页的字段优先，oEmbed 补位 —— 页面是权威来源，oEmbed 是
 * 页面被挡时仍能拿到标题的那条退路。
 */
export async function fetchYoutubeVideoMetadata(params: {
  videoId: string
}): Promise<YoutubeVideoMetadata> {
  // 归一成实测过的 `watch?v=` 形状 —— 与直传视频本体走同一个构造器，
  // 「元数据说的是哪条视频」和「模型看的是哪条视频」因此不可能对不上。
  const watchUrl = buildYoutubeWatchUrl(params.videoId)
  const [oembed, page] = await Promise.allSettled([
    probeOembed(watchUrl),
    probeWatchPage(watchUrl),
  ])

  const sources: string[] = []
  const errors: string[] = []
  const merged: YoutubeVideoMetadata = { sources, errors }

  if (oembed.status === 'fulfilled') {
    sources.push('youtube oembed')
    assignDefined(merged, oembed.value)
  } else {
    errors.push(`oembed: ${errorMessage(oembed.reason)}`)
  }

  if (page.status === 'fulfilled') {
    sources.push('youtube watch page')
    assignDefined(merged, page.value)
  } else {
    errors.push(`watch page: ${errorMessage(page.reason)}`)
  }

  return merged
}
