import { EDIT_TIMELINE_FILMSTRIP } from '@/constants/edit-desk'
import { formatFrameTimestamp } from '@/lib/video-frame-plan'
import { getVideoFrameUrl } from '@/lib/video-poster'

/**
 * 拉片（H4a）要看的画面：拉片纸上那条胶片、表里每行的参考帧。
 *
 * ⭐ 一律用服务器按「片段 + 时刻」现截一帧（与剪辑台胶片同一套：`stepSec` 取整、同宽），
 * ⛔ 不另存图 —— 同一刻同一个缓存键，转换按 (源, 参数) 计费。自家 CDN 之外 / 不是 MP4 的
 * 片子截不了帧，返回 `null`，界面只写时间段（mock ⑨「参考帧出不来」）。
 */

const STEP = EDIT_TIMELINE_FILMSTRIP.stepSec
const WIDTH = EDIT_TIMELINE_FILMSTRIP.frameWidthPx

function snap(sec: number): number {
  return Math.round(sec / STEP) * STEP
}

/** 拉片纸上的胶片：整段均匀取 `count` 帧（取整到 `stepSec`，与剪辑台的缓存键对齐）。 */
export function pullFilmstripFrames(
  url: string,
  durationSec: number,
  count: number,
): readonly (string | null)[] {
  const total = Math.max(0, durationSec)
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const at = ((index + 0.5) / count) * total
    const sec = Math.min(Math.max(0, snap(at)), Math.max(0, total - STEP / 2))
    return getVideoFrameUrl(url, sec, WIDTH)
  })
}

/**
 * 一行的参考帧：这一段开头往里一点（避开切点上那一帧的残影），取整到 `stepSec`；段太短
 * 取整会掉出段外时就用段的起点。
 */
export function shotRefFrameUrl(
  url: string | undefined,
  startSec: number,
  endSec: number,
): string | null {
  if (!url) return null
  const inside = Math.ceil((startSec + 0.05) / STEP) * STEP
  const sec = inside < endSec ? inside : startSec
  return getVideoFrameUrl(url, sec, WIDTH)
}

/** `3.04` → `0:03`。 */
export function formatPullClock(sec: number): string {
  return formatFrameTimestamp(sec)
}

/** 切点要精确到十分之一秒：`12.63` → `0:12.6`。 */
export function formatPullClockPrecise(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0
  const tenths = Math.floor((safe % 1) * 10)
  return `${formatFrameTimestamp(safe)}.${tenths}`
}

/** 卡上「参考 4.5s」：一位小数，整数不带 `.0`。 */
export function formatPullSpan(startSec: number, endSec: number): string {
  const span = Math.max(0, endSec - startSec)
  return String(Math.round(span * 10) / 10)
}
