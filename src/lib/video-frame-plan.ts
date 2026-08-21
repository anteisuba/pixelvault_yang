import {
  VIDEO_FRAME_LIMITS,
  VIDEO_FRAME_PLAN,
} from '@/constants/video-analysis'

/**
 * 抽帧计划 —— **纯函数，客户端和服务端共用同一份**（AI 导演内核 · 切片 2 · §4.3）。
 *
 * ⭐ 共用是这条线的关键，不是省代码：客户端按计划抽，服务端**复算同一个计划**再
 * 逐帧核对时间戳（`assertMatchesFramePlan`）。少了服务端那一次复算，「确定性」就
 * 只是客户端的一句承诺 —— 而落进 `ResearchRun` 的帧集是 owner 将来翻案时要看的
 * 东西，承诺不够。
 *
 * ⛔ **不许随机、不许按内容自适应**（「跳过黑帧再取一张」也算）：同一个视频 +
 * 同一份参数必须永远给出同一组时间戳，否则复跑一次结论变了，谁也说不清是模型抖
 * 还是帧换了。
 */

export interface VideoFramePlanEntry {
  /** 0-based，就是帧在这一组里的序号。 */
  index: number
  /** 秒，保留到毫秒（`VIDEO_FRAME_PLAN.timestampDecimals`）。 */
  timestampSeconds: number
}

export interface VideoFramePlan {
  /** 计划所依据的片长（秒）。 */
  durationSeconds: number
  frameCount: number
  /** 策略版本 —— 落进 `ResearchRun`，老行不会被新策略重新解释。 */
  planVersion: number
  strategy: string
  entries: VideoFramePlanEntry[]
}

function roundToPlanPrecision(value: number): number {
  const factor = 10 ** VIDEO_FRAME_PLAN.timestampDecimals
  return Math.round(value * factor) / factor
}

/**
 * `t_k = (k + 0.5) × duration / frameCount` —— 把片长切成 N 段各取段中点。
 *
 * 中点而非端点的理由写在 `VIDEO_FRAME_PLAN.strategy` 上（t=0 常是黑场/台标，
 * t=duration 的 seek 行为跨浏览器不一致）。
 *
 * ⚠ 片长非法（NaN / ≤0 / Infinity）时返回**空计划**而不是抛：抽帧是分析的输入，
 * 这里抛等于让一个坏容器把整条链路炸掉；调用方看到 `entries` 为空就知道抽不出来，
 * 并且能如实说「这个视频读不出时长」。
 */
export function planVideoFrames(
  durationSeconds: number,
  frameCount: number = VIDEO_FRAME_PLAN.frameCount,
): VideoFramePlan {
  const usable =
    Number.isFinite(durationSeconds) &&
    durationSeconds >= VIDEO_FRAME_LIMITS.minDurationSeconds &&
    Number.isInteger(frameCount) &&
    frameCount > 0

  const entries: VideoFramePlanEntry[] = usable
    ? Array.from({ length: frameCount }, (_entry, index) => ({
        index,
        timestampSeconds: roundToPlanPrecision(
          ((index + 0.5) * durationSeconds) / frameCount,
        ),
      }))
    : []

  return {
    durationSeconds: usable ? roundToPlanPrecision(durationSeconds) : 0,
    frameCount: entries.length,
    planVersion: VIDEO_FRAME_PLAN.planVersion,
    strategy: VIDEO_FRAME_PLAN.strategy,
    entries,
  }
}

/** `12.4` → `0:12`；`3725` → `1:02:05`。给证据标题用，不参与判定。 */
export function formatFrameTimestamp(totalSeconds: number): string {
  const safe =
    Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = Math.floor(safe % 60)
  const mmss = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(
    seconds,
  ).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${mmss}` : mmss
}

export interface FramePlanMismatch {
  index: number
  expected: number
  received: number
}

/**
 * 逐帧核对：客户端交上来的时间戳是不是按计划走的。
 *
 * 容差存在是因为浏览器 seek 落到的是**最近的可解码帧**而不是数学上的那一刻；
 * 但容差不是「随便传」的许可 —— 超出就是「这组帧不是按计划抽的」，帧集也就不再
 * 可复跑，必须大声失败（`VIDEO_FRAMES_INVALID_ERROR`）。
 *
 * 返回不匹配的那几条（空数组 = 全对），而不是一个布尔：报错要能说出**第几帧差多少**，
 * 否则线上只会看到一句「不确定性」然后无从查起。
 */
export function findFramePlanMismatches(
  plan: VideoFramePlan,
  received: readonly { index: number; timestampSeconds: number }[],
): FramePlanMismatch[] {
  const byIndex = new Map(received.map((frame) => [frame.index, frame]))
  const mismatches: FramePlanMismatch[] = []
  for (const entry of plan.entries) {
    const frame = byIndex.get(entry.index)
    if (!frame) {
      mismatches.push({
        index: entry.index,
        expected: entry.timestampSeconds,
        received: Number.NaN,
      })
      continue
    }
    if (
      Math.abs(frame.timestampSeconds - entry.timestampSeconds) >
      VIDEO_FRAME_LIMITS.timestampToleranceSeconds
    ) {
      mismatches.push({
        index: entry.index,
        expected: entry.timestampSeconds,
        received: frame.timestampSeconds,
      })
    }
  }
  return mismatches
}
