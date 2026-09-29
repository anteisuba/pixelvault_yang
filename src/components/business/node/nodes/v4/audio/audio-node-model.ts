/**
 * 音频节点的**纯读函数**（v3 spec §4，画板 `AudioStates` / `AudioSelected` /
 * `AudioQuickListen`）。
 *
 * 矮卡尺寸、波形柱、时长读数、音色 chip 显示什么 —— 全在这里算完再交给
 * 组件（与 `image/image-node-model.ts` 同一条分工：⛔ 组件里不出现第二份算术）。
 */

import {
  AUDIO_KIND,
  DEFAULT_AUDIO_KIND,
  type AudioKind,
} from '@/constants/audio-options'
import { getModelById } from '@/constants/models'
import { resolveAudioKind } from '@/constants/models/audio'
import { readOutputVersions } from '@/lib/node-output-versions'
import type { NodeV4AudioData } from '@/types/node-workflow'

/** 矮卡的三个数（画板逐像素）：空态与有声态都保持 72 高。 */
export const AUDIO_CARD = {
  /** 卡高（spec §4「矮卡 72 高」）。 */
  height: 72,
  /** 未量到容器宽度前的波形柱数。卡面量到后按宽度算。 */
  barCount: 36,
  /** 波形区高。 */
  waveformHeight: 30,
  /** 柱高值域（占 `waveformHeight` 的比例）。 */
  minBarRatio: 0.25,
  maxBarRatio: 1,
  /** 快速听里的大波形柱数与高。 */
  quickListenBarCount: 72,
  quickListenHeight: 56,
} as const

/**
 * 这张卡交付过的每一版（spec §1.8）—— 版本点唯一的读侧，与图片卡同一条路径。
 */
export function audioVersions(data: NodeV4AudioData): readonly string[] {
  return readOutputVersions(data).map((version) => version.url)
}

/** `7s` —— 卡右侧那一行读数。 */
export function formatAudioSeconds(seconds: number): string {
  return `${Math.max(0, Math.round(seconds))}s`
}

/** 卡右侧固定宽度里的时长读数。 */
export function formatAudioCardDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** 柱宽 3、柱间距 2；末尾不预留不存在的间距。 */
export function audioWaveformBarCount(width: number): number {
  return Math.max(0, Math.floor((width + 2) / 5))
}

/** `0:02.6` —— 播放中的走时（画板用的是十分之一秒）。 */
export function formatAudioClock(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`
}

/** `8.1s` —— 裁剪条上那扇选区窗顶写的时长（画板 `AudioTrim`）。⚠ 留一位小数：
 *  整数秒下手柄挪半秒读数纹丝不动，用户会以为拖不动。 */
export function formatAudioTrimDuration(seconds: number): string {
  return `${Math.max(0, seconds).toFixed(1)}s`
}

/**
 * 波形柱高。
 *
 * ⚠ **确定性**：种子取这一版的地址，同一段声音每次渲染画出来的是同一条波形。
 * 随机一次就画一次的话，卡每重渲一次波形就换个样子 —— 用户会读成「音频变了」。
 * ⛔ 这不是真实频谱（要真频谱得解码整段音频），它是一条按地址稳定生成的装饰波，
 * 与 legacy 声纹同一条定位。
 */
export function buildAudioWaveformBars(
  seed: string,
  count: number = AUDIO_CARD.barCount,
): readonly number[] {
  // 32 位 FNV-1a：够散、够短，⛔ 不为一条装饰波引哈希库。
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  const bars: number[] = []
  for (let index = 0; index < count; index += 1) {
    hash ^= hash << 13
    hash >>>= 0
    hash ^= hash >> 17
    hash ^= hash << 5
    hash >>>= 0
    const unit = (hash % 1000) / 1000
    bars.push(
      AUDIO_CARD.minBarRatio +
        unit * (AUDIO_CARD.maxBarRatio - AUDIO_CARD.minBarRatio),
    )
  }
  return bars
}

/**
 * 这张卡现在是哪一类（语音 / 配乐 / 音效）—— **由选中的模型说了算**，
 * 画板原话「选了模型就定了类型，不另设类型 chip」。没选模型时按语音算
 * （TTS 是默认路径，`DEFAULT_AUDIO_KIND` 同一个值）。
 */
export function resolveAudioNodeKind(data: NodeV4AudioData): AudioKind {
  const modelId = data.model?.modelId
  if (!modelId) return DEFAULT_AUDIO_KIND
  const model = getModelById(modelId)
  return model ? resolveAudioKind(model) : DEFAULT_AUDIO_KIND
}

/** 音色 chip 只在语音那一类露出（配乐 / 音效没有音色可挑）。 */
export function showsVoiceChip(kind: AudioKind): boolean {
  return kind === AUDIO_KIND.SPEECH
}
