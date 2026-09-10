/**
 * **音频裁剪**（spec §4「音频裁剪在客户端做」，画板 `AudioTrim.dc.html`）。
 *
 * 一条链：`fetch` 这一版的地址 → `AudioContext.decodeAudioData` 解成采样 → 按入 /
 * 出点切 → 编成 16-bit PCM 的 WAV `Blob`。落版本那一步不在这里 —— 调用方把 Blob
 * 包成 `File` 交给 `use-node-upload-v4`（与手动上传同一条上传管线）。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────────────
 * ① **不扣积分、不生成**：裁剪只是把已有的采样切一段重新编码，⛔ 不经过任何
 *    provider。
 * ② **非破坏**：产出的是**新一版**，原音留作上一版（spec §4）。所以这里只吐
 *    Blob，⛔ 不碰节点、不改 `outputs`。
 * ③ **纯函数与副作用分家**：`encodeWav16BitPcm` / `resolveTrimSampleRange` /
 *    `sliceChannels` 都是纯的（测得动），只有 `trimAudioToWav` 碰网络与
 *    `AudioContext`。
 *
 * ⚠ 画板右侧那段说明写的是「服务端 ffmpeg `atrim`」，spec §4 之后改成了客户端
 * WebAudio（owner 定：视频裁剪才走 S9 渲染 worker，音频不值得为它排一次队）。
 * 以 spec 为准。
 */

/** WAV 头是定长 44 字节（RIFF 12 + fmt 24 + data 8）。 */
const WAV_HEADER_BYTES = 44
/** 每个采样 2 字节 = 16-bit PCM。 */
const BYTES_PER_SAMPLE = 2
/** `WAVE_FORMAT_PCM`。 */
const WAV_FORMAT_PCM = 1
const WAV_BITS_PER_SAMPLE = 16
/** 16-bit 有符号整数的两端 —— 超出这个范围的浮点采样必须夹住，⛔ 不让它绕回。 */
const PCM_MAX = 32767
const PCM_MIN = -32768

export interface AudioTrimRange {
  readonly startSec: number
  readonly endSec: number
}

/** 采样下标区间（半开：`[start, end)`）。 */
export interface AudioTrimSampleRange {
  readonly start: number
  readonly end: number
}

/**
 * 把秒换算成采样下标，并夹进 `[0, length]`。
 *
 * ⚠ 出点必须**严格大于**入点：出 ≤ 入时返回 `null`（0 采样的 WAV 不是一段声音，
 * 落成一版只会得到一张按不动的卡）。
 */
export function resolveTrimSampleRange(
  range: AudioTrimRange,
  sampleRate: number,
  length: number,
): AudioTrimSampleRange | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null
  if (!Number.isFinite(range.startSec) || !Number.isFinite(range.endSec)) {
    return null
  }
  const start = Math.max(
    0,
    Math.min(length, Math.floor(range.startSec * sampleRate)),
  )
  const end = Math.max(
    0,
    Math.min(length, Math.ceil(range.endSec * sampleRate)),
  )
  if (end <= start) return null
  return { start, end }
}

/** 每条声道各切同一段。⛔ 不做重采样、不混声道 —— 裁剪就只是裁剪。 */
export function sliceChannels(
  channels: readonly Float32Array[],
  range: AudioTrimSampleRange,
): readonly Float32Array[] {
  return channels.map((channel) => channel.slice(range.start, range.end))
}

/**
 * 编成 16-bit PCM 的 WAV。
 *
 * 多声道按 WAV 的规矩**交错**存（L R L R …），⛔ 不按平面存 —— 平面的那份任何
 * 播放器都会放成两段噪音。
 */
export function encodeWav16BitPcm(
  channels: readonly Float32Array[],
  sampleRate: number,
): ArrayBuffer {
  const channelCount = Math.max(1, channels.length)
  const frameCount = channels[0]?.length ?? 0
  const blockAlign = channelCount * BYTES_PER_SAMPLE
  const dataBytes = frameCount * blockAlign
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  // RIFF 块长 = 整个文件减掉 `RIFF` 与它自己这 8 字节。
  view.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, WAV_FORMAT_PCM, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, WAV_BITS_PER_SAMPLE, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = WAV_HEADER_BYTES
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = channels[channel]?.[frame] ?? 0
      const scaled = Math.round(sample * PCM_MAX)
      view.setInt16(offset, Math.max(PCM_MIN, Math.min(PCM_MAX, scaled)), true)
      offset += BYTES_PER_SAMPLE
    }
  }

  return buffer
}

/** 解码出来的那一份事实 —— 只取编码要用的三样，⛔ 不把整个 `AudioBuffer` 传下去。 */
export interface DecodedAudio {
  readonly channels: readonly Float32Array[]
  readonly sampleRate: number
  readonly durationSec: number
}

export interface AudioTrimResult {
  readonly blob: Blob
  readonly durationSec: number
}

/** MIME 与扩展名——上传那一头按它认类型。 */
export const AUDIO_TRIM_WAV_MIME = 'audio/wav'
export const AUDIO_TRIM_WAV_EXTENSION = '.wav'

/**
 * 解码一段远端音频。
 *
 * ⚠ `decodeAudioData` 会**吃掉**传进去的 `ArrayBuffer`（detach），所以这一份不能
 * 再复用；调用方也别指望还能从它读原始字节。
 */
export async function decodeAudioFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<DecodedAudio> {
  // ⚠ `cache: 'reload'` 不是保守，是**必须**：卡上那只 `<audio>` 已经用无 CORS 的
  // 请求把这段声音放进了 HTTP 缓存，默认的 fetch 会命中那条不透明记录，于是即使
  // CDN 明明允许本站跨域，这一次也照样 `Failed to fetch`（真机 2026-09-10 实测：
  // 只有绕开缓存的那一次成功）。⛔ 不给 `<audio>` 加 `crossOrigin`——那会让不带
  // CORS 头的第三方试听地址直接放不出声。
  const response = await fetch(url, {
    cache: 'reload',
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) throw new Error(`audio fetch failed: ${response.status}`)
  const bytes = await response.arrayBuffer()
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!AudioContextCtor) throw new Error('AudioContext unavailable')
  const context = new AudioContextCtor()
  try {
    const decoded = await context.decodeAudioData(bytes)
    const channels: Float32Array[] = []
    for (let index = 0; index < decoded.numberOfChannels; index += 1) {
      channels.push(decoded.getChannelData(index).slice())
    }
    return {
      channels,
      sampleRate: decoded.sampleRate,
      durationSec: decoded.duration,
    }
  } finally {
    // ⚠ 必须关：每次裁剪开一个 `AudioContext` 而不关，Chrome 到第七个就拒绝再开
    // （硬上限），之后整页都放不出声。
    void context.close()
  }
}

/**
 * 端到端：地址 + 入出点 → 一段 WAV。
 *
 * 入出点越界会被夹住；夹完是空区间就抛 —— ⛔ 不静默产出 0 秒的一版。
 */
export async function trimAudioToWav(
  url: string,
  range: AudioTrimRange,
  options: { readonly signal?: AbortSignal } = {},
): Promise<AudioTrimResult> {
  const decoded = await decodeAudioFromUrl(url, options.signal)
  const length = decoded.channels[0]?.length ?? 0
  const sampleRange = resolveTrimSampleRange(range, decoded.sampleRate, length)
  if (!sampleRange) throw new Error('empty trim range')
  const sliced = sliceChannels(decoded.channels, sampleRange)
  const wav = encodeWav16BitPcm(sliced, decoded.sampleRate)
  return {
    blob: new Blob([wav], { type: AUDIO_TRIM_WAV_MIME }),
    durationSec: (sampleRange.end - sampleRange.start) / decoded.sampleRate,
  }
}

/** 裁出来那一段的文件名：`原名.wav`（同名会被上传那一头自己去重）。 */
export function trimmedFileName(name: string): string {
  const base = name.trim().replace(/\.[a-z0-9]+$/i, '') || 'audio'
  return `${base}${AUDIO_TRIM_WAV_EXTENSION}`
}
