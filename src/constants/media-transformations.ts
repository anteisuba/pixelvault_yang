/**
 * Cloudflare Media Transformations —— CDN 边缘现场抽帧，把 R2 上的视频转成
 * 一张静态封面图。**没有任何本地/worker 管线**：URL 就是 API。
 *
 * 契约（https://developers.cloudflare.com/stream/transform-videos/，2026-09 核）：
 *   `https://<我们的 zone>/cdn-cgi/media/<OPTIONS>/<源视频完整 URL>`
 * - 转换在**自己的 zone** 上提供服务，需先在 Dashboard 的 Transformations
 *   页给该 zone 打开（Image Transformations 已开的 zone 同一个开关）。
 * - 源视频默认只接受**同 zone**（allowed origins 默认值），而我们的视频正是
 *   `cdn.anteisuba.com`（R2 custom domain，同属该 zone）→ 零额外配置。
 * - 源限制：≤100MB、≤10 分钟、MP4/H.264（其余容器官方标注 untested）。
 * - 计价：抽一帧 = 1 次 transformation，$0.50/1000 次，每月免费 5000 次，
 *   **同一组 (源 URL, 参数) 每个自然月只计费一次** → 列表反复滚不叠钱。
 */

/** `/cdn-cgi/media/` 前缀由 Cloudflare 边缘拦截，不会打到 R2。 */
export const MEDIA_TRANSFORMATIONS_PATH_PREFIX = '/cdn-cgi/media'

/**
 * 抽帧时间点。⚠ 不用 0 —— 很多视频第一帧是纯黑的开场，抽出来的封面等于
 * 没有封面。`time` 的可用区间是 0–10m，格式是时间字符串（`5s` / `2m`）。
 */
export const VIDEO_POSTER_FRAME_TIME = '1s'

/** 封面长边（px）。列表瓦片最大 260 左右，640 够 2x 屏且能被详情页复用。 */
export const VIDEO_POSTER_WIDTH = 640

/** `mode=frame` 只支持 jpg / png；封面是照片型内容，jpg 更小。 */
export const VIDEO_POSTER_FORMAT = 'jpg'

/** 只缩不放，保持原始比例（瓦片自己 `object-cover`，不需要 CDN 裁）。 */
export const VIDEO_POSTER_FIT = 'scale-down'

/**
 * 允许送进抽帧的源扩展名。官方只保证 MP4/H.264；webm 一并放行是因为抽帧
 * 失败只表现为「这一格回落到占位」，不会更坏 —— 但别再往下加没验过的容器。
 */
export const VIDEO_POSTER_SOURCE_EXTENSIONS = ['.mp4', '.webm'] as const
