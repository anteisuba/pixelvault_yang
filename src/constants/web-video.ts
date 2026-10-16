import { VIDEO_LINK_HOSTS } from '@/constants/video-link'

/**
 * 助手**找到的视频**（搜索期第二片，附录 I §3.1 / §四，owner 2026-10-14）。
 *
 * 一条视频结果属于哪个平台、能不能在面板里播：四家（YouTube · B站 · niconico · Vimeo）
 * 用各家**官方嵌入播放器**（iframe），别的站与认不出稿件号的链接退回新窗口打开源页。
 * ⛔ 不下载、不转存、不解码任何一帧 —— 播放全在对方的播放器里。
 * 判别只有一处：`lib/web-video.ts`（服务端定平台、面板定嵌入地址，用的是同一个函数）。
 */

export const WEB_VIDEO_PLATFORM_IDS = {
  youtube: 'youtube',
  bilibili: 'bilibili',
  niconico: 'niconico',
  vimeo: 'vimeo',
  other: 'other',
} as const

export const WEB_VIDEO_PLATFORMS = [
  WEB_VIDEO_PLATFORM_IDS.youtube,
  WEB_VIDEO_PLATFORM_IDS.bilibili,
  WEB_VIDEO_PLATFORM_IDS.niconico,
  WEB_VIDEO_PLATFORM_IDS.vimeo,
  WEB_VIDEO_PLATFORM_IDS.other,
] as const

export type WebVideoPlatform = (typeof WEB_VIDEO_PLATFORMS)[number]

/** 有官方嵌入播放器的那四家。 */
export type WebVideoEmbedPlatform = Exclude<
  WebVideoPlatform,
  typeof WEB_VIDEO_PLATFORM_IDS.other
>

/**
 * 按**注册域**认平台（`host === base || host.endsWith('.' + base)`），子域不用逐个列。
 * YouTube / B站复用视频链接路由那一张（`VIDEO_LINK_HOSTS`），⛔ 不抄第二份。
 * ⚠ `b23.tv` 是 B站短链：认得出平台，认不出稿件号（跟跳转要发请求，浏览器里做不了）——
 *   退回新窗口。`nico.ms/<id>` 的稿件号就在路径里，能嵌。
 */
export const WEB_VIDEO_PLATFORM_HOSTS: Record<
  WebVideoEmbedPlatform,
  readonly string[]
> = {
  youtube: VIDEO_LINK_HOSTS.youtube,
  bilibili: VIDEO_LINK_HOSTS.bilibili,
  niconico: ['nicovideo.jp', 'nico.ms'],
  vimeo: ['vimeo.com'],
}

/** 模型那一行里写的平台名（`#n · 标题 · 频道 · 平台 · 时长`）。别的站写域名。 */
export const WEB_VIDEO_PLATFORM_NAMES: Record<WebVideoEmbedPlatform, string> = {
  youtube: 'YouTube',
  bilibili: 'bilibili',
  niconico: 'niconico',
  vimeo: 'Vimeo',
}

/**
 * 四家的官方嵌入播放器与 iframe 的放行项。
 *
 * ⚠ `sandbox`：脚本与同源是播放器自己要的；`allow-popups`（+ 逃出沙箱）让播放器里
 *   「在 YouTube 上观看」这类链接开新标签；⛔ 没有 `allow-top-navigation` —— 嵌进来的
 *   页面不许把整个面板导走。
 * ⚠ `referrerPolicy` 写明 `strict-origin-when-cross-origin`（只带源站）：YouTube 的嵌入
 *   要看到来源站才肯放，⛔ 别学网图那样写 `no-referrer`。
 * ⚠ 本站 CSP 不限 `frame-src`（`next.config.ts` 只有 `frame-ancestors 'none'`，管的是
 *   别人能不能嵌我们），所以这四个来源不用另外放行。
 * ⚠ B站默认会自动播，`autoplay=0` 关掉；四家一律等创作者在播放器里点播放。
 */
export const WEB_VIDEO_EMBED = {
  youtubePrefix: 'https://www.youtube-nocookie.com/embed/',
  bilibiliPlayer: 'https://player.bilibili.com/player.html',
  niconicoPrefix: 'https://embed.nicovideo.jp/watch/',
  vimeoPrefix: 'https://player.vimeo.com/video/',
  sandbox:
    'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation',
  allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
  referrerPolicy: 'strict-origin-when-cross-origin',
} as const

/** 稿件号的形状。认不出就不嵌（退回新窗口），⛔ 不猜。 */
export const WEB_VIDEO_ID_PATTERNS = {
  bilibiliBvid: /^BV[0-9A-Za-z]{10}$/,
  /** ⚠ 新稿件的 av 号有 15–16 位（64 位整数，最多 19 位）。 */
  bilibiliAid: /^av(\d{1,19})$/i,
  niconico: /^(?:sm|so|nm)\d{1,12}$/,
  vimeo: /^\d{1,12}$/,
  /** Vimeo 不公开视频的私有串（`vimeo.com/<id>/<hash>`，嵌入要带 `?h=`）。 */
  vimeoHash: /^[0-9a-f]{6,32}$/i,
} as const

/**
 * YouTube 的封面直链（`i.ytimg.com` 公开、不过期）：搜索结果没给封面时按稿件号补一张，
 * ⛔ 别的平台不猜封面地址。
 */
export const WEB_VIDEO_YOUTUBE_THUMBNAIL = (videoId: string): string =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
