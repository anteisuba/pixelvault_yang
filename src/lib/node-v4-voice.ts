/**
 * 音色节点（`audio.voice`）在 v4 展开态里的**派生判定**（第三期 · 画布 C3c-②Q）。
 *
 * 从 legacy `nodes/VoiceNode.tsx`(511) 与 `node-detail/VoiceDetailBody.tsx`(823)
 * 里搬出来的那几条规则，落成纯函数，理由有二：
 *
 * ① **status 的降级规则不能住在组件里**。legacy 版本自己在渲染函数里重算一次
 *    status（「无可发送音频时把陈旧的 `ready` 降回 `idle`」），于是同一条判据在
 *    卡面、槽架、送出预览各有一份，改一处修不好另外两处。2026-08-10 真机上那两张
 *    「已说暂无试听样本、卡却还是绿的」的卡就是这么来的。
 * ② 四态槽（空 / 上传中 / 已绑 / 失败）是本片要测的东西，而组件测试要挂
 *    ReactFlow + next-intl 才跑得起来 —— 判定层独立出来，四态就是四个断言。
 *
 * ⛔ 这里不读 v3 字段（`voiceClipUrl` / `voiceSampleUrl` / `voiceSource`）：v4 的
 * 音频节点只有一个产物字段 `url` 和一份 `voiceProfile`，三条 v3 字段在迁移里已经
 * 合流。
 */

import type { NodeV4AudioData } from '@/types/node-workflow'

export const V4_VOICE_SLOT_STATE_IDS = {
  /** 还没挑音色、也没有音频 —— 卡上是「选择音色」那颗。 */
  empty: 'empty',
  /** 正在合成 / 正在上传。 */
  loading: 'loading',
  /** 已绑：挑了音色，或手上就有一段音频。 */
  bound: 'bound',
  failed: 'failed',
} as const

export type V4VoiceSlotState =
  (typeof V4_VOICE_SLOT_STATE_IDS)[keyof typeof V4_VOICE_SLOT_STATE_IDS]

/**
 * 「这条音色真的发得出去吗」—— 唯一判据是**有没有那段音频**。
 *
 * ⚠ 不是「有没有 voiceId」：收藏一张音色卡只写下 id，一个音频 url 都没有，那种
 * 节点当视频参考音频是发不出去的（legacy `VoiceSelector.handleToggleFavorite`
 * 那条路）。
 */
export function readV4VoiceAudioUrl(data: NodeV4AudioData): string | undefined {
  return data.url
}

/** 这张卡配置过没有 —— 只答**空态 vs 非空态**，⛔ 不答「发不发得出去」。 */
export function hasV4VoiceIdentity(data: NodeV4AudioData): boolean {
  const profile = data.voiceProfile
  return Boolean(
    data.url ||
    profile?.voiceId ||
    profile?.style ||
    profile?.emotion ||
    data.ownerName,
  )
}

export function resolveV4VoiceSlotState(
  data: NodeV4AudioData,
): V4VoiceSlotState {
  if (data.status === 'failed') return V4_VOICE_SLOT_STATE_IDS.failed
  if (data.status === 'running' || data.status === 'queued') {
    return V4_VOICE_SLOT_STATE_IDS.loading
  }
  return hasV4VoiceIdentity(data)
    ? V4_VOICE_SLOT_STATE_IDS.bound
    : V4_VOICE_SLOT_STATE_IDS.empty
}

/**
 * 卡头状态点读的 status —— **陈旧的 `ready` 一律降回 `idle`**。
 *
 * 存量节点里躺着旧代码写死的 `ready`，而那些节点一段音频都没有。发不出去就不许
 * 显示 ready（legacy VoiceNode 那段长注释的结论，原样搬过来）。
 */
export function resolveV4VoiceStatus(
  data: NodeV4AudioData,
): NodeV4AudioData['status'] {
  if (data.status === 'failed' || data.status === 'running') return data.status
  if (readV4VoiceAudioUrl(data)) return 'ready'
  return data.status === 'ready' ? 'idle' : data.status
}

/**
 * 语速 / 音量 / 情绪三档**只在合成这条路上露出**（owner 2026-08-10）。
 *
 * 取用库里的片段、或用户自己传的音频时，那段声音已经录成那样了 —— 显示这三个
 * 控件就是在暗示可以调。判据在 v4 是「挑了库里的 voiceId」：只有那条路才会真的
 * 走一次 TTS 合成。
 */
export function showsV4VoiceSynthesisParams(data: NodeV4AudioData): boolean {
  return Boolean(data.voiceProfile?.voiceId)
}

/* ═════════════════════════════════════════════════════════════════════════
 * 声纹（贝塞尔波形）
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 声纹不是真实频谱 —— 它是一条**装饰性**的等幅贝塞尔波，随播放进度双色裁切。
 * 数字与 legacy `VoiceNode` 同源（宽 128 / 高 32 / 16 个半周期 / 振幅 ±13），
 * 搬过来是为了两处画出来的是同一条线；⛔ 不在这里重新调参数。
 */
export const V4_VOICE_WAVEFORM = {
  width: 128,
  height: 32,
  halfPeriods: 16,
  amplitude: 13,
} as const

export function buildV4VoiceWaveformPath(): string {
  const centerY = V4_VOICE_WAVEFORM.height / 2
  const segment = V4_VOICE_WAVEFORM.width / V4_VOICE_WAVEFORM.halfPeriods
  let d = `M 0 ${centerY}`
  for (let index = 0; index < V4_VOICE_WAVEFORM.halfPeriods; index += 1) {
    const startX = index * segment
    const midX = startX + segment / 2
    const endX = startX + segment
    const peakY =
      centerY +
      (index % 2 === 0
        ? -V4_VOICE_WAVEFORM.amplitude
        : V4_VOICE_WAVEFORM.amplitude)
    d += ` Q ${midX} ${peakY} ${endX} ${centerY}`
  }
  return d
}

/** 已播过的那一段有多宽（像素）。进度越界时钳到 [0, width]。 */
export function v4VoiceWaveformPlayedWidth(progress: number): number {
  const clamped = Math.min(
    1,
    Math.max(0, Number.isFinite(progress) ? progress : 0),
  )
  return V4_VOICE_WAVEFORM.width * clamped
}
