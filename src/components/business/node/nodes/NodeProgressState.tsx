'use client'

import { cn } from '@/lib/utils'

/**
 * 进行态共用件（台账 #14，owner 2026-08-03 拍板）。
 *
 * 在这之前「生成中」在画布上有**四份互不相同的实现**：
 *   A `ImageCardGeneratingOverlay` —— 白 82% 遮罩 + 115° 扫光，只有文案
 *   B `NodeMediaPreview` 图片 kind 无媒体 —— 没有遮罩，Spinner + 文案
 *   C `NodeMediaPreview` 视频/音频/文本 kind —— 白 70% 遮罩，Spinner **和** 扫光条
 *   D `SeedanceNode` —— 白 70% 遮罩，脉冲 Film 图标 + 扫光条
 * 同一个状态四种说法，C 还用两个器件说同一件事，D 把「是视频」和「在跑」混进
 * 了一个器件。四份并存的根因是**没有共享件**，所以这次先造一个。
 *
 * ⚠ 台账把它记成「图片族白遮罩 vs 视频族**暗底**」，那半句是错的：视频族用的
 * `bg-node-canvas/70` 里 `--node-canvas` 是 `#ffffff`（canvas.css:40），也是白
 * 遮罩，只是 70% 而不是 82%。两族遮罩本来就同族，分家的只有中间那个动的东西。
 *
 * 统一后的规矩：
 *   · **器件恒定** —— 一条扫光条 + 一句文案，四个落点全用它
 *   · **遮罩看情况** —— 底下有内容要遮（已有媒体 / 深窗）才上，空态不上
 *   · 有真实百分比走确定式（宽度随进度），拿不到走不定式（固定宽来回扫）
 */

export interface NodeProgressBarProps {
  /**
   * 0–100 的真实百分比。**给了就是确定式**（宽度随进度），
   * **不给就是不定式**（38% 固定宽块来回扫）。
   *
   * ⚠ 别为了「看起来在动」而喂一个前端估算的假值 —— 生成期间前端拿不到真实
   * 进度，规格 §5 原话「生成中 ↻（无百分比）」明确禁止假造一个。不定式那一档
   * 存在的意义就是诚实地说「在跑，但不知道还要多久」。
   */
  progress?: number
  /** 无障碍名。确定式会连同百分比一起播报。 */
  label: string
  className?: string
}

/**
 * 扫光条 —— 上传与生成共用的同一个器件，两种行为。这条轴让用户一眼分得清
 * 「能预估完成时间」和「不能」：上传走 XHR 真实字节数所以有确定式条，生成
 * 只能给不定式条。
 */
export function NodeProgressBar({
  progress,
  label,
  className,
}: NodeProgressBarProps) {
  const isDeterminate = typeof progress === 'number'
  const clamped = isDeterminate
    ? Math.min(100, Math.max(0, Math.round(progress)))
    : undefined

  return (
    <span
      role="progressbar"
      aria-label={label}
      // 不定式：省略 valuenow，读屏会播报成「忙，进度未知」——这正是实情。
      aria-valuenow={clamped}
      aria-valuemin={isDeterminate ? 0 : undefined}
      aria-valuemax={isDeterminate ? 100 : undefined}
      className={cn(
        'canvas-progress-bar',
        isDeterminate && 'canvas-progress-bar--determinate',
        className,
      )}
    >
      <span
        className="canvas-progress-bar-fill"
        style={isDeterminate ? { width: `${clamped}%` } : undefined}
      />
    </span>
  )
}

/**
 * 器件形态。**默认 `'bar'`** —— 四个既有卡层落点一行不用改。
 *
 * `'breath'` 是详情面板（方向 E「静默」）用的那一档：契约 §7 写死了
 * 「生成中 ↻ —— 无百分比、无取消、**无进度条**」。面板是一屏里最大的一块，
 * 一根 96px 的扫光条在那么大的静面上会变成整屏最吵的东西，而它承诺的信息量
 * 和一个呼吸点完全一样（都只说「在跑」）。
 *
 * ⚠ 不是给面板再造第五份实现 —— 那正是本文件头注要终结的局面。遮罩、文案、
 * 无障碍播报三件事仍然共用，只有中间那个动的东西按落点换形。
 */
export type NodeProgressIndicator = 'bar' | 'breath'

interface NodeProgressStateBaseProps {
  /** 「生成中」/「上传中 42%」这类文案，调用方自己拼好。 */
  label: string
  /**
   * 底下有没有东西要遮。有已落的媒体、或者深色媒体窗 → true，上白遮罩；
   * 纯空态没东西可遮 → false，只在原地放器件，不平白盖一层。
   */
  veiled?: boolean
  /**
   * 这张卡上**别处已经写了同一句话**（图片族窗内左上角的 `ImageCardStatusBadge`
   * 就写着「生成中」）。置 true 时文案降为 `sr-only` —— 读屏仍拿得到、进度条的
   * 可访问名也还在，但画面上不重复一遍。
   *
   * ⚠ 别改成「干脆不渲染」：那样进度条就成了一根没有名字的光条。
   */
  labelShownElsewhere?: boolean
  /** 取消按钮等额外元素（今天只有上传态用）。 */
  action?: React.ReactNode
}

/**
 * ⚠ 判别联合而不是两个可选字段：`'breath'` 那一档**物理上没地方放百分比**，
 * 允许两者同传就是允许调用方喂一个永远不会显示的真实进度 —— 上传态某天误用
 * `'breath'` 会静默丢掉「还剩多少」这个用户真正需要的信息。写成编译错误。
 */
export type NodeProgressStateProps = NodeProgressStateBaseProps &
  (
    | {
        indicator?: 'bar'
        /** 有真实百分比就传（上传）；生成拿不到，不传。 */
        progress?: number
      }
    | { indicator: 'breath'; progress?: never }
  )

/**
 * 进行态的完整表现 —— 遮罩（可选）+ 文案 + 器件。四个落点都渲染它，别再各写一份。
 */
export function NodeProgressState({
  label,
  progress,
  veiled = false,
  labelShownElsewhere = false,
  indicator = 'bar',
  action,
}: NodeProgressStateProps) {
  const isBreath = indicator === 'breath'

  return (
    <div
      className={cn(
        'canvas-progress-state',
        veiled && 'canvas-progress-state--veiled',
      )}
      // ⚠ 呼吸档必须自己承担播报：条那一档的「在跑」是 `role=progressbar`
      // 播出去的，去掉条就等于对读屏用户完全静音。文案那个 <p> 不会自动播报，
      // 它只在**首次**渲染时随页面读出来，之后由 idle 切到生成中就没声音了。
      role={isBreath ? 'status' : undefined}
      aria-live={isBreath ? 'polite' : undefined}
    >
      <p className={labelShownElsewhere ? 'sr-only' : 'canvas-progress-label'}>
        {label}
      </p>
      {isBreath ? (
        // aria-hidden：这颗点说的和上面那句文案是同一件事，读屏读一遍就够。
        <span className="canvas-progress-breath" aria-hidden="true" />
      ) : (
        <NodeProgressBar progress={progress} label={label} />
      )}
      {action}
    </div>
  )
}
