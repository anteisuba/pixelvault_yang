/**
 * 时间线 → **ffmpeg 滤镜图**（S9 · spec §6「渲染层」）。
 *
 * 这里是渲染层唯一「懂 ffmpeg 语法」的地方，而且是**纯字符串函数** —— 不碰文件、
 * 不 spawn 进程、不读环境。于是「导出的东西和时间线上看到的不一样」永远能在一条
 * 逐字断言的单测里复现，而不必真的渲一条片子。
 *
 * ── 前置条件：所有输入已经规格化 ────────────────────────────────────────
 * `xfade` 硬要求两路输入**同分辨率 / 同帧率 / 同像素格式 / 同 timebase**（调研
 * `video-edit-models.md` §1.4）。所以本图假设每个视频输入都已经过 `normalize`
 * 那一步（scale+pad / fps / format / settb / 变速都在那里做完）。⛔ 不在这张图里
 * 再 scale 一次：那会让「规格化」变成两处真理，而且第二次 scale 是纯浪费。
 *
 * ── 已知边界：声音层的素材必须真的有音轨 ────────────────────────────────
 * `[N:a]` 在输入没有音频流时会让 ffmpeg 拒绝整张图（"matches no streams"）。视频段
 * 不受影响（规格化那一步恒定补了一条静音），但 A / M 轨的素材是直接喂进来的。
 * 现实里 A / M 轨上只会是音频节点的产物，一定有音轨；⚠ 真要放宽（比如允许把一段
 * 视频拖进 M 轨当配乐），得先给声音层也过一道规格化 —— ⛔ 别在图里靠 `?` 之类的
 * 可选说明符糊过去，那只会把「没有声音」变成「静默地少一层」。
 *
 * ── 为什么画面与它自己的原声一起折叠 ────────────────────────────────────
 * 视频轨的音频跟着视频用**同一套折叠规则**（叠化 → `acrossfade`，硬切 → `concat`），
 * 所以音画天然同步。⛔ 不把段的原声当成又一条 `amix` 层：那样每加一次叠化就要手算
 * 一次偏移，算错的表现是「转场处声音早半秒」。
 */

/** 与 `src/constants/render-video.ts` 同源 —— worker 是另一套构建，值在这里再写一份。 */
export const FG_CROSSFADE_SEC = 0.5
export const FG_BLACK_FADE_SEC = 0.35
export const FG_MIX_WEIGHTS = { clip: 1, voice: 1.4, music: 0.35 } as const

/** `atempo` 单次范围。>2 或 <0.5 必须串联（ffmpeg 官方建议）。 */
export const ATEMPO_MIN = 0.5
export const ATEMPO_MAX = 2

export type FgTransition = 'none' | 'crossfade' | 'black'

/**
 * 字幕字体（S8d）。**容器里的系统字体**，`container/Dockerfile` 装 `fonts-noto-cjk`
 * 并给 ffmpeg 开 `--enable-libfreetype`（没有它 `drawtext` 这个滤镜根本不存在）。
 * ⛔ 不下载字体：渲染时去网上取一份字体等于给每条片子加一个能失败的外部依赖。
 */
export const FG_FONT_FILE =
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'

/** 描边宽 —— 白字黑边 / 黑字白边，画面亮暗都读得清。 */
export const FG_TEXT_BORDER_PX = 2

export type FgTextTone = 'light' | 'dark'

/** 九宫（`tl`…`br`）→ drawtext 的 `x` / `y` 表达式。⚠ 与 `EDIT_TEXT_ANCHORS_TUPLE` 同源。 */
export const FG_TEXT_ANCHOR_EXPR: Readonly<
  Record<string, { readonly x: string; readonly y: string }>
> = {
  tl: { x: 'M', y: 'M' },
  tc: { x: '(w-text_w)/2', y: 'M' },
  tr: { x: 'w-text_w-M', y: 'M' },
  ml: { x: 'M', y: '(h-text_h)/2' },
  mc: { x: '(w-text_w)/2', y: '(h-text_h)/2' },
  mr: { x: 'w-text_w-M', y: '(h-text_h)/2' },
  bl: { x: 'M', y: 'h-text_h-M' },
  bc: { x: '(w-text_w)/2', y: 'h-text_h-M' },
  br: { x: 'w-text_w-M', y: 'h-text_h-M' },
}

export interface FgTextSegment {
  readonly id: string
  readonly text: string
  readonly startSec: number
  readonly durationSec: number
  /** 九宫 id。⚠ 认不出来的一律当 `bc`（字幕的位置），⛔ 不整段丢掉。 */
  readonly anchor: string
  readonly fontSizePx: number
  readonly marginPx: number
  readonly tone: FgTextTone
  readonly fadeSec: number
}

export interface FgVideoSegment {
  readonly id: string
  /** 规格化产物在成片时间轴上占多久（**已含变速**）。 */
  readonly durationSec: number
  readonly muted: boolean
  readonly transitionOut: FgTransition
}

export interface FgAudioSegment {
  readonly id: string
  readonly startSec: number
  readonly durationSec: number
  readonly gain: number
  /** 声音层的变速在图里做（视频层的已经在规格化里做完）。 */
  readonly speed: number
}

export interface FgPlan {
  readonly video: readonly FgVideoSegment[]
  readonly audio: readonly FgAudioSegment[]
  readonly music: readonly FgAudioSegment[]
  /** 字幕（S8d）。缺席 = 这条片子没有字幕。 */
  readonly texts?: readonly FgTextSegment[]
}

export interface FgResult {
  /** `-filter_complex` 的值。 */
  readonly filter: string
  /** 成片画面的标签（喂给 `-map`）。 */
  readonly videoLabel: string
  readonly audioLabel: string
  /** 折叠算出来的成片时长 —— 与 `RenderPlan.totalDurationSec` 必须一致。 */
  readonly totalDurationSec: number
}

/** 3 位小数就够：25fps 一帧 = 40ms，⛔ 别把浮点噪声写进命令行。 */
function sec(value: number): string {
  return (Math.round(value * 1000) / 1000).toString()
}

/**
 * 变速 → `atempo` 串联。
 *
 * ⚠ 一次 `atempo` 只覆盖 [0.5, 2]。3× 要写成 `atempo=1.732,atempo=1.732`；
 * 直接写 `atempo=3` 的表现是 ffmpeg 拒绝整张图（而不是把声音放慢）。
 */
export function atempoChain(speed: number): readonly string[] {
  if (!Number.isFinite(speed) || speed <= 0 || speed === 1) return []
  const factors: number[] = []
  let remaining = speed
  while (remaining > ATEMPO_MAX) {
    factors.push(ATEMPO_MAX)
    remaining /= ATEMPO_MAX
  }
  while (remaining < ATEMPO_MIN) {
    factors.push(ATEMPO_MIN)
    remaining /= ATEMPO_MIN
  }
  factors.push(remaining)
  return factors.map((factor) => `atempo=${sec(factor)}`)
}

/** 一条链的写法：`a,b,c`（空链返回 `null`，调用方用 `anull` 之类占位）。 */
function chain(parts: readonly string[]): string | null {
  return parts.length > 0 ? parts.join(',') : null
}

/**
 * 字幕文本 → `drawtext` 的 `text=` 值。
 *
 * ⚠ **两层转义**：先是滤镜图解析器（它按 `,;[]` 断句、`=` 分选项、`\\` 转义下一个
 * 字符），再是 drawtext 自己（它认 `\n` 换行、把 `%{...}` 当表达式展开）。所以一个
 * 反斜杠要写成四个才能活到最后，而一个真的换行必须写成 `\\n`（图层看到 `\n`，
 * drawtext 看到换行）。⛔ 不用引号包起来：单引号在图层里没有「引号内的引号」的写法，
 * 一句带撇号的台词就能把整张图拆散。
 */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '\\\\n')
    .replace(/%/g, '\\\\%')
    .replace(/([':,;[\]=])/g, '\\$1')
}

/**
 * 一段字幕 → 一句 `drawtext`。
 *
 * ⚠ 显示窗口用 `enable='between(t,a,b)'`，淡入淡出用 `alpha` 表达式 —— 两者缺一
 * 不可：只有 alpha 的话字幕在窗口外仍然被画（alpha 0 的一层合成），只有 enable 的话
 * 它是硬切进硬切出。
 */
function drawtextOf(segment: FgTextSegment): string {
  const start = Math.max(0, segment.startSec)
  const end = start + Math.max(0, segment.durationSec)
  const anchor =
    FG_TEXT_ANCHOR_EXPR[segment.anchor] ?? FG_TEXT_ANCHOR_EXPR.bc!
  const margin = sec(Math.max(0, segment.marginPx))
  const light = segment.tone === 'light'
  const parts = [
    `drawtext=fontfile=${FG_FONT_FILE}`,
    `text=${escapeDrawtext(segment.text)}`,
    `fontsize=${sec(segment.fontSizePx)}`,
    `fontcolor=${light ? 'white' : 'black'}`,
    `borderw=${FG_TEXT_BORDER_PX}`,
    `bordercolor=${light ? 'black' : 'white'}`,
    `x=${anchor.x.replace(/M/g, margin)}`,
    `y=${anchor.y.replace(/M/g, margin)}`,
    `line_spacing=${Math.round(segment.fontSizePx * 0.25)}`,
    `enable='between(t,${sec(start)},${sec(end)})'`,
  ]
  const fade = Math.max(0, Math.min(segment.fadeSec, (end - start) / 2))
  if (fade > 0) {
    // ⚠ `t` 是整条成片的时刻，所以两头都要减去这一段自己的起点 / 终点。
    parts.push(
      `alpha='if(lt(t,${sec(start + fade)}),(t-${sec(start)})/${sec(fade)},if(gt(t,${sec(end - fade)}),(${sec(end)}-t)/${sec(fade)},1))'`,
    )
  }
  return parts.join(':')
}

/**
 * 建图。
 *
 * 输入顺序**由本函数定义**：先 `video.length` 个规格化视频，然后语音层，然后配乐层。
 * 调用方按同一顺序摆 `-i`（`buildRenderCommand` 就在隔壁做这件事）。
 */
export function buildFilterGraph(plan: FgPlan): FgResult {
  if (plan.video.length === 0) {
    throw new Error('filtergraph: no video segments')
  }

  const lines: string[] = []
  const videoCount = plan.video.length

  /* ── 1. 每段先各自处理黑场淡入 / 淡出与静音 ────────────────────────── */
  for (let index = 0; index < videoCount; index += 1) {
    const segment = plan.video[index]!
    const previous = index > 0 ? plan.video[index - 1] : undefined
    const fadeIn = previous?.transitionOut === 'black'
    const fadeOut = segment.transitionOut === 'black'

    const videoParts: string[] = []
    const audioParts: string[] = []
    if (fadeIn) {
      videoParts.push(`fade=t=in:st=0:d=${sec(FG_BLACK_FADE_SEC)}`)
      audioParts.push(`afade=t=in:st=0:d=${sec(FG_BLACK_FADE_SEC)}`)
    }
    if (fadeOut) {
      const start = Math.max(0, segment.durationSec - FG_BLACK_FADE_SEC)
      videoParts.push(`fade=t=out:st=${sec(start)}:d=${sec(FG_BLACK_FADE_SEC)}`)
      audioParts.push(
        `afade=t=out:st=${sec(start)}:d=${sec(FG_BLACK_FADE_SEC)}`,
      )
    }
    // ⚠ 静音写成 `volume=0` 而不是「不接这一路」：`concat` / `acrossfade` 要求
    // 每一路都有音频流，少一路整张图就拼不起来。
    audioParts.push(`volume=${segment.muted ? '0' : '1'}`)

    lines.push(
      `[${index}:v]${chain(videoParts) ?? 'null'}[v${index}]`,
      `[${index}:a]${chain(audioParts) ?? 'anull'}[a${index}]`,
    )
  }

  /* ── 2. 左折叠：叠化用 xfade / acrossfade，其余用 concat ─────────── */
  let videoLabel = '[v0]'
  let audioLabel = '[a0]'
  let accumulated = plan.video[0]!.durationSec

  for (let index = 1; index < videoCount; index += 1) {
    const segment = plan.video[index]!
    const join = plan.video[index - 1]!.transitionOut
    const nextVideo = `[vx${index}]`
    const nextAudio = `[ax${index}]`

    if (join === 'crossfade') {
      const duration = Math.min(
        FG_CROSSFADE_SEC,
        accumulated,
        segment.durationSec,
      )
      const offset = Math.max(0, accumulated - duration)
      lines.push(
        `${videoLabel}[v${index}]xfade=transition=fade:duration=${sec(duration)}:offset=${sec(offset)}${nextVideo}`,
        `${audioLabel}[a${index}]acrossfade=d=${sec(duration)}:c1=tri:c2=tri${nextAudio}`,
      )
      accumulated = accumulated + segment.durationSec - duration
    } else {
      lines.push(
        `${videoLabel}[v${index}]concat=n=2:v=1:a=0${nextVideo}`,
        `${audioLabel}[a${index}]concat=n=2:v=0:a=1${nextAudio}`,
      )
      accumulated += segment.durationSec
    }
    videoLabel = nextVideo
    audioLabel = nextAudio
  }

  /* ── 2.5 字幕（S8d）──────────────────────────────────────────────────
     ⚠ 叠在**折叠之后**的那一路画面上：叠在每段自己身上的话，一段字幕横跨两段
     画面时要拆成两句 drawtext，而叠化那 0.5s 里两路都画着它，重叠处会明显加深。 */
  const texts = plan.texts ?? []
  if (texts.length > 0) {
    const drawn = '[vtext]'
    lines.push(
      `${videoLabel}${texts.map(drawtextOf).join(',')}${drawn}`,
    )
    videoLabel = drawn
  }

  /* ── 3. 语音 / 配乐层 ──────────────────────────────────────────────── */
  const layers: string[] = [audioLabel]
  const weights: number[] = [FG_MIX_WEIGHTS.clip]
  let input = videoCount

  const pushLayer = (
    segment: FgAudioSegment,
    weight: number,
    prefix: string,
  ): void => {
    const parts = [...atempoChain(segment.speed)]
    if (segment.gain !== 1) parts.push(`volume=${sec(segment.gain)}`)
    // ⚠ `adelay` 的单位是**毫秒**，`all=1` 把同一个延迟加到所有声道上 ——
    // 少了 `all=1` 的表现是立体声只有左声道被延迟。
    parts.push(`adelay=${Math.round(segment.startSec * 1000)}:all=1`)
    const label = `[${prefix}${input}]`
    lines.push(`[${input}:a]${parts.join(',')}${label}`)
    layers.push(label)
    weights.push(weight)
    input += 1
  }

  for (const segment of plan.audio) {
    pushLayer(segment, FG_MIX_WEIGHTS.voice, 'la')
  }
  for (const segment of plan.music) {
    pushLayer(segment, FG_MIX_WEIGHTS.music, 'lm')
  }

  let finalAudio = audioLabel
  if (layers.length > 1) {
    // `duration=first` = 成片长度由画面轨决定；`normalize=0` 才让 weights 说了算
    // （默认的归一化会把「语音压过配乐」这件事抹平）。
    lines.push(
      `${layers.join('')}amix=inputs=${layers.length}:duration=first:dropout_transition=0:weights=${weights.map((weight) => sec(weight)).join(' ')}:normalize=0[amix]`,
    )
    finalAudio = '[amix]'
  }

  return {
    filter: lines.join(';'),
    videoLabel,
    audioLabel: finalAudio,
    totalDurationSec: Math.round(accumulated * 1000) / 1000,
  }
}
