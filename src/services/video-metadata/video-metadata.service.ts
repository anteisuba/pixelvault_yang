import 'server-only'

import { RESEARCH_INJECTION_PLACEHOLDER } from '@/constants/research'
import {
  VIDEO_LINK_KINDS,
  VIDEO_METADATA_MARKERS,
  VIDEO_METADATA_REQUEST,
  VIDEO_METADATA_UNKNOWN,
} from '@/constants/video-link'
import { logger } from '@/lib/logger'
import { safeFetch } from '@/lib/url-guard'
import { classifyVideoLink } from '@/lib/video-link'
import { withRetry } from '@/lib/with-retry'
import { detectInjectionPattern } from '@/services/kernel/prompt-guard'
import { fetchYoutubeVideoMetadata } from '@/services/video-metadata/youtube.connector'

/**
 * 挂视频引用时**一并取回的平台元数据**（切片 2 §4.3 收尾批）。
 *
 * 🔬 **为什么要有这一层**：08-21 路由抢夺修完之后，视频真的挂上去了（追问
 * 「能看到画面吗」逐秒描述准确、帧级细节编不出来），**时长仍答 19:13**（真值
 * 18:40），同一套设置的另一次探针答 18:41。判读是**时长是元数据问题不是画面
 * 问题** —— 视觉模型按帧采样，看得见画面却数不准总长度，而且不稳定。所以时长/
 * 标题/发布日这类字段要在挂视频那一刻从平台一并取回来，给模型一个可引的来源。
 *
 * 三条边界，别越：
 *  1. **这不是检索证据**。视觉线的 `grounded` 恒 false 的语义不能破，所以这里
 *     产出的是**本轮的结构化事实块**，走自己的围栏（`VIDEO_METADATA_MARKERS`）、
 *     自己的规矩（`VIDEO_METADATA_DIRECTIVE`），⛔ 不进 `[n]` 引用池。
 *  2. **失败绝不阻断**（要求 3）。取不到 = 字段写 `unknown`，日志 warn 一声，
 *     视频分析照走。整个模块没有一条对外抛的路径。
 *  3. **只管视觉线接走的那些链接**（youtube / video-file）。B站/X/抖音是平台页，
 *     归检索线，它们的元数据早就由 `fetchBilibiliVideoMetadata` 出在
 *     `<<<VIDEO LINK n>>>` 块里（四要素含时长）—— **复用那条，不在这里重写第二遍**。
 */

export interface VideoLinkMetadataRequest {
  /** 附件清单里的那个 handle（`#1`），与 `buildReferenceHandles` 同源。 */
  handle: string
  url: string
}

export interface VideoLinkMetadata {
  handle: string
  url: string
  title?: string
  author?: string
  durationSeconds?: number
  publishedAt?: string
  thumbnailUrl?: string
  byteSize?: number
  contentType?: string
  /** 哪些探针成功了。空数组 = 一个字段都没拿到。 */
  sources: string[]
  /** 命中注入模式 —— 自由文本字段已降级成占位符。 */
  flagged?: boolean
}

// ─── 取数 ────────────────────────────────────────────────────────

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 视频直链：只发 HEAD。**时长拿不到就是拿不到** —— 容器时长要解封装才知道，
 * 那是 ffmpeg 的活（§4.3 抽帧管线那一批），不在这条免 key 的路上。
 */
async function probeVideoFile(
  url: string,
): Promise<Partial<VideoLinkMetadata>> {
  const response = await withRetry(
    async () => {
      // 用户贴进来的任意 URL —— 复用既有 SSRF guard（含跳转逐跳复验），
      // ⛔ 别在这儿开第二个口子。
      const head = await safeFetch(url, {
        method: 'HEAD',
        allowedProtocols: ['http:', 'https:'],
        signal: AbortSignal.timeout(VIDEO_METADATA_REQUEST.headTimeoutMs),
      })
      if (!head.ok) {
        throw Object.assign(
          new Error(`video file HEAD responded ${head.status}`),
          { status: head.status },
        )
      }
      return head
    },
    {
      label: 'videoMetadata.head',
      maxAttempts: VIDEO_METADATA_REQUEST.maxAttempts,
      baseDelayMs: VIDEO_METADATA_REQUEST.retryBaseDelayMs,
    },
  )

  const declaredBytes = Number.parseInt(
    response.headers.get('content-length') ?? '',
    10,
  )
  return {
    contentType: response.headers.get('content-type') ?? undefined,
    byteSize: Number.isFinite(declaredBytes) ? declaredBytes : undefined,
    sources: ['http headers'],
  }
}

function truncateField(value: string): string {
  return (
    value
      // 围栏词绝不能出现在数据里 —— 一个带 `<<<END>>>` 的标题能把围栏拆掉。
      .replace(/<{2,}|>{2,}/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, VIDEO_METADATA_REQUEST.maxTextFieldChars)
  )
}

/**
 * 标题和作者是**任何人可编辑的自由文本** —— 与证据走同一道注入扫描
 * （`sanitizeEvidenceItems` 对证据做的事，这里对元数据做一遍）。
 * 数字字段不扫：秒数和字节数载不动指令。
 */
function sanitizeTextFields(entry: VideoLinkMetadata): VideoLinkMetadata {
  const scanned = [entry.title, entry.author].filter(Boolean).join('\n')
  if (!scanned || !detectInjectionPattern(scanned)) {
    return {
      ...entry,
      ...(entry.title ? { title: truncateField(entry.title) } : {}),
      ...(entry.author ? { author: truncateField(entry.author) } : {}),
    }
  }
  // **标记并降级，不整体丢弃**：时长仍然有用，且它编不出指令来。
  return {
    ...entry,
    flagged: true,
    title: RESEARCH_INJECTION_PLACEHOLDER,
    author: undefined,
  }
}

async function fetchOne(
  request: VideoLinkMetadataRequest,
): Promise<VideoLinkMetadata> {
  const base: VideoLinkMetadata = {
    handle: request.handle,
    url: request.url,
    sources: [],
  }
  // 判别只写一处（`lib/video-link.ts`）—— 这里再调一次那个纯函数，
  // ⛔ 不是在这儿把 kind 判第二遍。
  const classification = classifyVideoLink(request.url)

  try {
    if (classification.kind === VIDEO_LINK_KINDS.youtube) {
      const metadata = await fetchYoutubeVideoMetadata({
        videoId: classification.videoId,
      })
      if (metadata.errors.length > 0) {
        logger.warn('Video metadata probe partially failed', {
          url: request.url,
          errors: metadata.errors,
        })
      }
      // 逐字段显式搬 —— `errors` 是日志用的，不该顺着展开混进提示词块里。
      return sanitizeTextFields({
        ...base,
        title: metadata.title,
        author: metadata.author,
        durationSeconds: metadata.durationSeconds,
        publishedAt: metadata.publishedAt,
        thumbnailUrl: metadata.thumbnailUrl,
        sources: metadata.sources,
      })
    }

    if (classification.kind === VIDEO_LINK_KINDS.videoFile) {
      return sanitizeTextFields({
        ...base,
        ...(await probeVideoFile(request.url)),
      })
    }
  } catch (error) {
    // 要求 3：**元数据取不到绝不能让整轮对话失败**。warn 一声，块里写 unknown。
    logger.warn('Video metadata unavailable', {
      url: request.url,
      error: errorMessage(error),
    })
  }

  return base
}

/**
 * 一轮里所有已挂载视频链接的元数据。**并行**（要求 4：多链接不串行等待），
 * 且**永不抛** —— 每条自己吞掉自己的失败。
 */
export async function fetchVideoLinkMetadata(
  requests: readonly VideoLinkMetadataRequest[],
): Promise<VideoLinkMetadata[]> {
  if (requests.length === 0) return []
  return Promise.all(requests.map(fetchOne))
}

// ─── 渲染 ────────────────────────────────────────────────────────

/** `1120` → `18:40`。小时段才带小时位，别给一条 3 分钟的片子写 `00:03:21`。 */
export function formatVideoDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const mmss = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(
    seconds,
  ).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${mmss}` : mmss
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1_000_000
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`
}

/**
 * 一条链接一段块。
 *
 * ⚠ **四个字段永远都在，取不到就写 `unknown`**（§3.0b 空态原则）：省略等于把
 * 这个字段还给模型去猜，而「猜时长」正是本批要消灭的那件事。
 */
function renderEntry(entry: VideoLinkMetadata, index: number): string {
  const header = [
    `handle: [video ${entry.handle}]`,
    `url: ${entry.url}`,
    `source: ${entry.sources.length > 0 ? entry.sources.join(', ') : 'unavailable'}`,
    entry.flagged ? 'flagged: contains instruction-like text' : null,
  ]
    .filter(Boolean)
    .join(' | ')

  const lines = [
    `title: ${entry.title ?? VIDEO_METADATA_UNKNOWN}`,
    `uploader: ${entry.author ?? VIDEO_METADATA_UNKNOWN}`,
    `duration: ${
      entry.durationSeconds === undefined
        ? VIDEO_METADATA_UNKNOWN
        : `${formatVideoDuration(entry.durationSeconds)} (${entry.durationSeconds} seconds)`
    }`,
    `published: ${entry.publishedAt ?? VIDEO_METADATA_UNKNOWN}`,
    entry.contentType ? `content type: ${entry.contentType}` : null,
    entry.byteSize !== undefined
      ? `file size: ${formatBytes(entry.byteSize)}`
      : null,
    entry.thumbnailUrl ? `thumbnail: ${entry.thumbnailUrl}` : null,
  ].filter(Boolean)

  return [
    VIDEO_METADATA_MARKERS.begin(index + 1),
    header,
    ...lines,
    VIDEO_METADATA_MARKERS.end,
  ].join('\n')
}

/**
 * 整块。`null` = 这轮没有已挂载的视频链接（**不是**「取不到元数据」——
 * 取不到照样出块，只是字段写 unknown）。
 */
export function buildVideoMetadataBlock(
  entries: readonly VideoLinkMetadata[],
): string | null {
  if (entries.length === 0) return null
  return `${VIDEO_METADATA_MARKERS.blockHeader} (${entries.length} item(s) — what the platform reports about the video(s) attached to this turn; not retrieved evidence, do not cite as [n]):
${entries.map(renderEntry).join('\n\n')}`
}
