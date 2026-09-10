/**
 * ffmpeg **命令行生成器**（纯函数；真的 spawn 在容器里，见 `container/server.mjs`）。
 *
 * 三条命令对应三步：`normalize`（每段一次）→ `encode`（整片一次）→ `poster`（抽封面）。
 * ⛔ 参数一律以数组给出，不拼字符串 —— 拼字符串的表现是文件名里一个空格就让整条
 * 命令跑到别的文件上去。
 */

import { atempoChain, buildFilterGraph, type FgPlan } from './filtergraph'

/** 与 `src/constants/render-video.ts` 同源。worker 是另一套构建。 */
export const FF_VIDEO_CODEC = 'libopenh264'
export const FF_AUDIO_CODEC = 'aac'
export const FF_AUDIO_BITRATE = '192k'
export const FF_AUDIO_RATE = 48_000
/**
 * 统一 timebase。
 *
 * ⚠ `xfade` 要求两路 timebase 相同；90000 是 MPEG 系的传统值，25 / 30 / 24 fps
 * 都能整除，⛔ 不用 `1/fps`（那让「同一份规格化产物换个帧率就对不上」）。
 */
export const FF_TIMEBASE = '1/90000'
export const FF_PIX_FMT = 'yuv420p'

export interface NormalizeInput {
  readonly src: string
  readonly dest: string
  /** 素材本地秒。 */
  readonly in: number
  readonly out: number
  readonly speed: number
  readonly width: number
  readonly height: number
  readonly fps: number
}

/**
 * 规格化一段：**裁 → 缩放补边 → 帧率 → 像素格式 → timebase → 变速**。
 *
 * ⚠ `-ss` / `-to` 放在 `-i` **前面**（输入侧裁剪，解码器直接跳过去）；放后面是
 * 输出侧裁剪，要把前面整段解一遍，一条 10 分钟素材取最后 5 秒会白等好几十秒。
 * ⚠ `-to` 是**绝对时刻**而不是时长，所以它跟 `-ss` 一起用时要给的是 `out` 本身。
 */
export function buildNormalizeCommand(
  input: NormalizeInput,
): readonly string[] {
  const speed = input.speed > 0 ? input.speed : 1
  const filters = [
    `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease`,
    `pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
    `fps=${input.fps}`,
    `format=${FF_PIX_FMT}`,
    `settb=${FF_TIMEBASE}`,
  ]
  if (speed !== 1) filters.push(`setpts=PTS/${speed}`)
  // 变速之后还要重排一次 PTS，否则 xfade 读到的起始时间不是 0。
  filters.push('setpts=PTS-STARTPTS')

  const audioFilters = [
    `aresample=${FF_AUDIO_RATE}`,
    ...atempoChain(speed),
    'asetpts=PTS-STARTPTS',
  ]

  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    // 输入 0：素材本身，`-ss` / `-to` 在 `-i` 前 = 输入侧裁剪。
    '-ss',
    String(input.in),
    '-to',
    String(input.out),
    '-i',
    input.src,
    // 输入 1：一条等长静音。
    //
    // ⚠ 很多生成模型的视频产物**没有音轨**，而下游的 `concat` / `acrossfade` 要求
    // 每一路都有音频流 —— 少一路整张图就拼不起来。所以这里恒定补一条：源有音轨时
    // 它排在第 0 条（`[N:a]` 选的就是它），源没有音轨时静音自动顶上第 0 条。
    // ⚠ `-t` 给的是**变速前**的长度：`-af` 里的 atempo 会把它一起缩放到 out/speed。
    '-f',
    'lavfi',
    '-t',
    String(Math.max(0, input.out - input.in)),
    '-i',
    `anullsrc=channel_layout=stereo:sample_rate=${FF_AUDIO_RATE}`,
    // ⚠ 输出选项必须排在**所有** `-i` 之后 —— 夹在两个输入之间的 `-vf` 会被当成
    // 后一个输入的输入选项，ffmpeg 直接拒绝整条命令（本地烟测就栽在这上面）。
    '-vf',
    filters.join(','),
    '-af',
    audioFilters.join(','),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-map',
    '1:a:0',
    '-map_metadata',
    '-1',
    '-shortest',
    '-c:v',
    FF_VIDEO_CODEC,
    '-c:a',
    FF_AUDIO_CODEC,
    '-ar',
    String(FF_AUDIO_RATE),
    '-ac',
    '2',
    '-video_track_timescale',
    '90000',
    input.dest,
  ]
}

export interface EncodeInput {
  /** 规格化产物 + 声音层素材，**顺序即 `buildFilterGraph` 定义的输入顺序**。 */
  readonly inputs: readonly string[]
  readonly plan: FgPlan
  readonly dest: string
  readonly fps: number
  /** ffmpeg 把进度写到这个 fifo / 文件，进度解析器读它。 */
  readonly progressPath?: string
}

/** 整片一次：滤镜图 → 编码。 */
export function buildEncodeCommand(input: EncodeInput): readonly string[] {
  const graph = buildFilterGraph(input.plan)
  const args: string[] = ['-hide_banner', '-nostdin', '-y']
  for (const file of input.inputs) {
    args.push('-i', file)
  }
  args.push(
    '-filter_complex',
    graph.filter,
    '-map',
    graph.videoLabel,
    '-map',
    graph.audioLabel,
    '-r',
    String(input.fps),
    '-pix_fmt',
    FF_PIX_FMT,
    '-c:v',
    FF_VIDEO_CODEC,
    '-c:a',
    FF_AUDIO_CODEC,
    '-b:a',
    FF_AUDIO_BITRATE,
    '-ar',
    String(FF_AUDIO_RATE),
    // faststart：成片是拿去在浏览器里播的，moov 在尾巴上等于必须整条下完才起播。
    '-movflags',
    '+faststart',
  )
  if (input.progressPath) {
    args.push('-progress', input.progressPath, '-nostats')
  }
  args.push(input.dest)
  return args
}

/** 抽封面：成片的第一帧之后一点点（⛔ 不取第 0 帧，黑场开头会抽到全黑）。 */
export function buildPosterCommand(
  source: string,
  dest: string,
  atSec: number,
): readonly string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-ss',
    String(Math.max(0, atSec)),
    '-i',
    source,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    dest,
  ]
}

/**
 * ffmpeg `-progress` 的输出 → 0..1。
 *
 * 它是一串 `key=value` 行，每块以 `progress=continue|end` 收尾。我们只要
 * `out_time_us`（已经编码到成片的第几微秒）。⚠ 拿不到就返回 `null` 而不是 0 ——
 * 「不知道」和「刚开始」在进度条上是两回事。
 */
export function parseFfmpegProgress(
  chunk: string,
  totalDurationSec: number,
): number | null {
  if (totalDurationSec <= 0) return null
  let latest: number | null = null
  for (const line of chunk.split('\n')) {
    const [key, value] = line.split('=')
    if (key?.trim() === 'out_time_us' && value) {
      const micros = Number.parseInt(value.trim(), 10)
      if (Number.isFinite(micros)) latest = micros / 1_000_000
    }
    if (key?.trim() === 'progress' && value?.trim() === 'end') {
      return 1
    }
  }
  if (latest === null) return null
  return Math.max(0, Math.min(1, latest / totalDurationSec))
}
