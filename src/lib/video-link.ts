/**
 * 视频链接分类器 —— **单一闸**（AI 导演内核切片 2 §4.2）。
 *
 * ⚠ **所有入口都必须走这里**：聊天框粘贴（`prompt-assistant.service`）、查询规划
 * 产出、B站元数据卡、将来画布那条 `node-assistant`。判别逻辑写第二遍的下场项目里
 * 已经吃过一次 —— @ 入口绕过容量红线，两处各判各的，其中一处永远漏。
 *
 * 纯函数、无 IO、无副作用：**能不能拿到这个视频**不在这里决定（那是
 * `toGeminiVideoPart` 那次 fetch + content-type 校验的活），这里只回答
 * 「这条链接该走哪条路」。
 */

import {
  VIDEO_FILE_EXTENSIONS,
  VIDEO_LINK_HOSTS,
  VIDEO_LINK_KINDS,
  VIDEO_LINK_OWNER_LINE,
  VIDEO_LINK_PLATFORMS,
  YOUTUBE_ID_PATH_PREFIXES,
  YOUTUBE_VIDEO_ID_PATTERN,
  YOUTUBE_WATCH_URL_PREFIX,
  type AssistantPipelineLine,
  type VideoLinkPlatform,
} from '@/constants/video-link'

export type VideoLinkClassification =
  | { kind: typeof VIDEO_LINK_KINDS.youtube; videoId: string }
  | { kind: typeof VIDEO_LINK_KINDS.videoFile }
  | {
      kind: typeof VIDEO_LINK_KINDS.platformPage
      platform: VideoLinkPlatform
      /** 平台内的稿件号（B站 BV 号 / X status id / 抖音 video id）。短链拿不到。 */
      id?: string
    }
  | { kind: typeof VIDEO_LINK_KINDS.web }

/**
 * 剥掉尾随标点后的链接。
 *
 * ⚠ **不是洁癖**：共享的 `extractUrlsFromText` 只剥 ASCII 的 `.,;`，中文句号
 * 逗号一律留在 URL 里（它的字符类只排除 `\s<>"')`）。于是「看看这个 https://…v=abc。」
 * 提取出来的 `v` 参数是 `abc。`，11 位校验不过 → 一条正常的 YouTube 链接被判成普通网页。
 * 中文是本项目对话的默认语言，这条不防等于对多数真实输入失效。
 */
export function normalizeVideoLinkUrl(raw: string): string {
  return raw
    .trim()
    .replace(/[。，、；：！？）】」』…,.;:!?)\]]+$/u, '')
    .trim()
}

function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(normalizeVideoLinkUrl(raw))
    // `mailto:` / `data:` / `javascript:` 一律不是视频链接，也绝不能往下传。
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

/** 按注册域匹配，子域自动覆盖（`music.youtube.com` / `v.douyin.com`）。 */
function hostMatches(host: string, bases: readonly string[]): boolean {
  return bases.some((base) => host === base || host.endsWith(`.${base}`))
}

function pathSegments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean)
}

/**
 * YouTube 视频 id。拿不到 = 这条不是视频页（频道 / 播放列表 / 首页），
 * **必须回 null 而不是硬猜**：把频道页当视频直传，Gemini 只会回一个失败。
 */
export function extractYoutubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  const segments = pathSegments(url)

  const candidate = (() => {
    // 短链 `youtu.be/<id>`：整条路径就是 id。
    if (hostMatches(host, ['youtu.be'])) return segments[0]
    if (segments[0] === 'watch') return url.searchParams.get('v') ?? undefined
    if (
      segments[0] &&
      (YOUTUBE_ID_PATH_PREFIXES as readonly string[]).includes(segments[0])
    ) {
      return segments[1]
    }
    return undefined
  })()

  if (!candidate) return null
  return YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : null
}

/** 规范化到实测过的 `watch?v=` 形状（理由见 `YOUTUBE_WATCH_URL_PREFIX`）。 */
export function buildYoutubeWatchUrl(videoId: string): string {
  return `${YOUTUBE_WATCH_URL_PREFIX}${videoId}`
}

function classifyBilibili(url: URL): VideoLinkClassification {
  const host = url.hostname.toLowerCase()
  // b23.tv 是短链：目标未知，标 kind 就够了 —— 解析交给连接器（它自己会跟跳转）。
  if (hostMatches(host, ['b23.tv'])) {
    return {
      kind: VIDEO_LINK_KINDS.platformPage,
      platform: VIDEO_LINK_PLATFORMS.bilibili,
    }
  }

  const segments = pathSegments(url)
  if (segments[0] !== 'video') {
    // space / live / 专栏都不是稿件页 —— 给「下片段传上来」的引导只会答非所问。
    return { kind: VIDEO_LINK_KINDS.web }
  }

  const bvid = segments[1]?.match(/BV[0-9A-Za-z]{10}/)?.[0]
  return {
    kind: VIDEO_LINK_KINDS.platformPage,
    platform: VIDEO_LINK_PLATFORMS.bilibili,
    ...(bvid ? { id: bvid } : {}),
  }
}

function classifyX(url: URL): VideoLinkClassification {
  const segments = pathSegments(url)
  const statusIndex = segments.indexOf('status')
  const id = statusIndex >= 0 ? segments[statusIndex + 1] : undefined
  // 只认帖子页。个人主页 / 探索页当普通网页，交给检索线。
  if (!id || !/^\d+$/.test(id)) return { kind: VIDEO_LINK_KINDS.web }
  return {
    kind: VIDEO_LINK_KINDS.platformPage,
    platform: VIDEO_LINK_PLATFORMS.x,
    id,
  }
}

function classifyDouyin(url: URL): VideoLinkClassification {
  const host = url.hostname.toLowerCase()
  if (host === 'v.douyin.com' || host.endsWith('.v.douyin.com')) {
    return {
      kind: VIDEO_LINK_KINDS.platformPage,
      platform: VIDEO_LINK_PLATFORMS.douyin,
    }
  }

  const segments = pathSegments(url)
  const videoIndex = segments.indexOf('video')
  const id = videoIndex >= 0 ? segments[videoIndex + 1] : undefined
  if (!id || !/^\d+$/.test(id)) return { kind: VIDEO_LINK_KINDS.web }
  return {
    kind: VIDEO_LINK_KINDS.platformPage,
    platform: VIDEO_LINK_PLATFORMS.douyin,
    id,
  }
}

function isVideoFilePath(url: URL): boolean {
  const pathname = url.pathname.toLowerCase()
  return VIDEO_FILE_EXTENSIONS.some((extension) => pathname.endsWith(extension))
}

/**
 * 一条链接 → 一个去处。**永远返回一个合法值**，调用方不需要判空。
 */
export function classifyVideoLink(raw: string): VideoLinkClassification {
  const url = parseHttpUrl(raw)
  if (!url) return { kind: VIDEO_LINK_KINDS.web }

  const host = url.hostname.toLowerCase()

  if (hostMatches(host, VIDEO_LINK_HOSTS.youtube)) {
    const videoId = extractYoutubeVideoId(url)
    return videoId
      ? { kind: VIDEO_LINK_KINDS.youtube, videoId }
      : { kind: VIDEO_LINK_KINDS.web }
  }

  if (hostMatches(host, VIDEO_LINK_HOSTS.bilibili)) return classifyBilibili(url)
  if (hostMatches(host, VIDEO_LINK_HOSTS.x)) return classifyX(url)
  if (hostMatches(host, VIDEO_LINK_HOSTS.douyin)) return classifyDouyin(url)

  // 平台判完再看扩展名：平台页上的 `.mp4` 路径不该被当成可直取的直链。
  if (isVideoFilePath(url)) return { kind: VIDEO_LINK_KINDS.videoFile }

  return { kind: VIDEO_LINK_KINDS.web }
}

/**
 * 这条链接归哪条线（表在 `VIDEO_LINK_OWNER_LINE`，实测来历也写在那里）。
 *
 * ⚠ **检索线在决定「读不读一条 URL」之前必须先问这一句**：判别只写一处的规矩
 * 对「归谁」同样成立 —— 两处各判各的，就会有一处把视频链接当网页读回来一句
 * 401，然后模型信那句 401 而不信眼前的视频。
 */
export function resolveVideoLinkLine(raw: string): AssistantPipelineLine {
  return VIDEO_LINK_OWNER_LINE[classifyVideoLink(raw).kind]
}
