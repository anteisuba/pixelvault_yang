/**
 * 视频链接路由的常量（AI 导演内核切片 2 §4.2）。
 *
 * **一个链接只有四种去处**，判别逻辑在 `src/lib/video-link.ts` 一处实现：
 *  - `youtube` → Gemini `fileData.fileUri` 直传（免下载零存储，🔬 已实测）；
 *  - `video-file` → 走现有 `toGeminiVideoPart` 抓取管线（content-type 在那儿嗅）；
 *  - `platform-page` → **不解流**（已拍板边界 16）：只出元数据 + 上传片段引导；
 *  - `web` → 不是视频，交给检索线的 url_reader。
 */

export const VIDEO_LINK_KINDS = {
  youtube: 'youtube',
  videoFile: 'video-file',
  platformPage: 'platform-page',
  web: 'web',
} as const

export type VideoLinkKind =
  (typeof VIDEO_LINK_KINDS)[keyof typeof VIDEO_LINK_KINDS]

/**
 * 两条线（已拍板边界 18「检索线与视觉线硬分界」）。写成常量是为了让下面那张
 * 归属表有类型，不是为了造抽象层 —— 全项目只有这一张表用它。
 */
export const ASSISTANT_PIPELINE_LINES = {
  /** 视觉线：把视频本体送进模型（YouTube `fileData.fileUri` / 附件管线）。 */
  vision: 'vision',
  /** 检索线：把页面读成文字证据（url_reader / 平台元数据连接器）。 */
  research: 'research',
} as const

export type AssistantPipelineLine =
  (typeof ASSISTANT_PIPELINE_LINES)[keyof typeof ASSISTANT_PIPELINE_LINES]

/**
 * **一条 URL 只能被一条线认领**。穷举、无兜底 —— 加一种 kind 就必须当场声明它归谁。
 *
 * 🔬 **2026-08-21 真机 + 受控复现**：这张表缺席时两条线会同时认领同一条 YouTube
 * 链接，而检索线赢了 —— `url_reader` 把 YouTube 页读回来的正文只有一句
 * `Warning: Target URL returned error 401: Unauthorized`（Jina 对 youtube.com 的
 * 固定结果，HTTP 200 所以回执还是 `ok`）。模型据此断定「后台拿不到这个视频」，
 * 报出记忆里的 19:13（真值 18:40）并给它挂了 `[1]`；而**同一轮 Gemini 其实已经
 * 吃进了 101,923 个视频 token**。单独问同一条链接时它答的是 18分41秒 —— 差别只在
 * 那条 401 文字证据在不在。所以这不是「让视觉线优先」，是**根本不许检索线认领它**。
 */
export const VIDEO_LINK_OWNER_LINE: Record<
  VideoLinkKind,
  AssistantPipelineLine
> = {
  [VIDEO_LINK_KINDS.youtube]: ASSISTANT_PIPELINE_LINES.vision,
  [VIDEO_LINK_KINDS.videoFile]: ASSISTANT_PIPELINE_LINES.vision,
  // ⚠ 平台页**留在检索线**：我们不解流（边界 16），它这条线上的产物是元数据卡 +
  //   「下片段自己传」引导，不是视频本体。一刀切踢出检索等于把元数据也踢没。
  [VIDEO_LINK_KINDS.platformPage]: ASSISTANT_PIPELINE_LINES.research,
  [VIDEO_LINK_KINDS.web]: ASSISTANT_PIPELINE_LINES.research,
}

/** 不解流的平台。**加一个平台就是加一条「只给元数据」的路，不是加一条解流路。** */
export const VIDEO_LINK_PLATFORMS = {
  bilibili: 'bilibili',
  x: 'x',
  douyin: 'douyin',
} as const

export type VideoLinkPlatform =
  (typeof VIDEO_LINK_PLATFORMS)[keyof typeof VIDEO_LINK_PLATFORMS]

/**
 * 按**注册域**匹配（`host === base || host.endsWith('.' + base)`），所以
 * `www.` / `m.` / `music.` / `v.` 这些子域不用逐个列。
 */
export const VIDEO_LINK_HOSTS = {
  youtube: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
  bilibili: ['bilibili.com', 'b23.tv'],
  x: ['x.com', 'twitter.com'],
  douyin: ['douyin.com', 'iesdouyin.com'],
} as const

/** YouTube 视频 id 的形状 —— 11 位 base64url。频道页/播放列表因此拿不到 id。 */
export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

/** `/shorts/<id>`、`/live/<id>`、`/embed/<id>`、`/v/<id>` 都是「下一段就是 id」。 */
export const YOUTUBE_ID_PATH_PREFIXES = [
  'shorts',
  'live',
  'embed',
  'v',
] as const

/**
 * 送进 `fileData.fileUri` 的规范形。
 *
 * ⚠ **不要原样转发用户贴的那个 URL**：🔬 切片 0 实测过的只有 `watch?v=` 这一种，
 * shorts / youtu.be / 带 `si=` 追踪参数的分享链是不是同样被接受**没测过**。
 * 归一成实测过的形状，四种入口就共用同一条已验证的路径。
 */
export const YOUTUBE_WATCH_URL_PREFIX = 'https://www.youtube.com/watch?v='

/**
 * 直链判定用的扩展名。**这只是第一道筛**——真正说了算的是
 * `toGeminiVideoPart` 里那次 fetch 的 content-type（现有校验，不重复写）。
 */
export const VIDEO_FILE_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.mkv',
  '.avi',
  '.mpeg',
  '.mpg',
  '.wmv',
  '.3gp',
] as const

/** 引导用户自己下片段时给的长度建议（§4.2「建议 ≤5 分钟」）。 */
export const VIDEO_LINK_CLIP_MINUTES = 5
