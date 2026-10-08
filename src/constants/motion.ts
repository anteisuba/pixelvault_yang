/**
 * Motion canon — 全站动效常量。本文件即 canon 的唯一来源，
 * CSS 侧的同名变量在 src/app/globals.css 的 @theme 里，两处必须同步改。
 *
 * 规则：
 * - 缓动全站统一 EASE_STANDARD 一条曲线；退出动画用更短时长，不换曲线。
 * - 时长走四档刻度，不要自创数值。
 * - motion 调用方必须配合 useReducedMotion（from 'motion/react'）：
 *   `transition={motionTransition('base', useReducedMotion())}`。
 * - CSS 侧对应 token 在 globals.css @theme：--ease-standard / --duration-*。
 */

/** 全站唯一缓动曲线（motion 数组形式） */
export const EASE_STANDARD: [number, number, number, number] = [
  0.22, 1, 0.36, 1,
]

/** 同一曲线的 CSS 字符串（行内 style 优先用 var(--ease-standard)） */
export const EASE_STANDARD_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * 「缩回来处」那一拍的曲线 —— 与工作台 chip 弹层退场（Tailwind `ease-in`）同一条：
 * 先慢后快地收进 chip / 卡边，读成「被收回去」而不是「淡掉」。只给**成对开合里的关**用
 * （画布点开方向 A：工具条、提示词栏、菜单缩回来处），其余退场仍走 EASE_STANDARD。
 */
export const EASE_IN: [number, number, number, number] = [0.42, 0, 1, 1]

/** 时长刻度（秒，motion 用） */
export const DURATION = {
  /** hover / 按压 / 图标与 chip 状态切换 */
  fast: 0.12,
  /** popover / menu / 轻量浮层出现 */
  base: 0.2,
  /** drawer / dialog / 面板展开折叠 */
  slow: 0.32,
  /** 页面级首次进场（仅陈列面） */
  reveal: 0.5,
} as const

/** 时长刻度（毫秒，CSS / 定时器用） */
export const DURATION_MS = {
  fast: 120,
  base: 200,
  slow: 320,
  reveal: 500,
} as const

export type MotionDurationPreset = keyof typeof DURATION

/**
 * 弹簧三档（ui-defaults.md §4.1，owner 2026-09-08 定）——**只给画布节点卡**的
 * 展开 / 槽卡 / 按压三类动作。CSS 侧的同名 token 是 globals.css 的
 * `--transition-duration-spring-*` / `--ease-spring-*`（`linear()` 是这三条
 * 弹簧的近似），两处必须同步改。motion 侧用 `type: 'spring'`，⛔ 不把
 * stiffness/damping 散写进组件。
 */
export const SPRING = {
  /** 卡展开 / 收起 / 邻居让位 / 分区进入 ≈ CSS `--spring-expand`（480ms） */
  expand: { type: 'spring', stiffness: 220, damping: 26 },
  /** 槽卡 / 折叠段 / 分段 thumb / 开关拨子 ≈ CSS `--spring-slot`（340ms） */
  slot: { type: 'spring', stiffness: 320, damping: 28 },
  /** 按压回弹 ≈ CSS `--spring-press`（160ms，无过冲） */
  press: { type: 'spring', stiffness: 520, damping: 34 },
} as const

export type MotionSpringPreset = keyof typeof SPRING

/**
 * 液态展开（owner 2026-09-26 定 B「先横成一条，再落下」）—— 助手头像点开与画布
 * 左侧栏点图标**同一套**。形状只动 clip-path：先横向长成一条标题条，
 * `unfoldDelayS` 后纵向展开成面板；收回反着走。指示条的两条边走 `lead` / `trail`
 * 两根弹簧，前沿硬、后沿软，途中自然拉长。
 * ⚠ 阻尼比全在 0.88–0.92：只留一丝过冲，⛔ 不做回弹缓动。
 * 原型：方向稿 artifact `GFfqsraLtaRRBBKigkmCuT`。
 */
export const LIQUID_SPRING = {
  /** 第一拍：横成一条（k460 · ζ0.9） */
  strip: { type: 'spring', stiffness: 460, damping: 39 },
  /** 第二拍：纵向展开（k320 · ζ0.9） */
  unfold: { type: 'spring', stiffness: 320, damping: 32 },
  /** 收回（k420 · ζ0.92） */
  retract: { type: 'spring', stiffness: 420, damping: 38 },
  /** 指示条前沿（k520 · ζ0.88） */
  lead: { type: 'spring', stiffness: 520, damping: 40 },
  /** 指示条后沿（k260 · ζ0.9） */
  trail: { type: 'spring', stiffness: 260, damping: 29 },
} as const

/**
 * 数字滚动（动效样片 K，owner 2026-10-08 剪辑台换皮定）：读数变了，**只有变了的那几位**
 * 往上 / 往下滚到新数字，没变的不动；k260 · ζ0.75，一点点过冲。
 */
export const ROLLING_DIGIT_SPRING = {
  type: 'spring',
  stiffness: 260,
  damping: 24,
} as const

/** 液态展开的节拍（秒）与内容换场的模糊量。 */
export const LIQUID_TIMING = {
  /** 第二拍在第一拍之后多久起。 */
  unfoldDelayS: 0.16,
  /** 标题随第一拍进场。 */
  headInDelayS: 0.07,
  headInS: 0.18,
  /** 正文随第二拍进场。 */
  bodyInDelayS: 0.26,
  bodyInS: 0.2,
  /** 收起：内容先退，退完才收形状。 */
  contentOutS: 0.09,
  retractDelayS: 0.06,
  /** 收起第二拍（横向缩回）在第一拍之后多久起。 */
  retractSecondBeatDelayS: 0.14,
  /** 开着时切内容：旧的退、新的晚一点进。 */
  swapOutS: 0.09,
  swapInDelayS: 0.05,
  swapInS: 0.16,
  /** 内容换场的模糊半径（px）。 */
  blurPx: 6,
} as const

/**
 * 结果图到达（owner 2026-10-07 PC 动效方向「图由糊变清」）：占位格换成结果图时，
 * 图从这份模糊 + 微放大落到清晰原尺寸。时长走 `DURATION.slow`。
 */
export const RESULT_REVEAL = {
  blurPx: 10,
  fromScale: 1.04,
} as const

/**
 * 「用它当参考」那一下（owner 2026-10-07）：缩略图的一个影子从结果格飞进助手输入框，
 * 落点缩到 `toSizePx` 见方。纯装饰：挂载照常立即发生，⛔ 不等它飞完。
 */
export const REFERENCE_FLY = {
  toSizePx: 28,
  /** 中途抬起的高度（px），飞出一条弧而不是直线。 */
  liftPx: 40,
} as const

/**
 * 查资料加进标签之后（owner 2026-09-27 查资料 B 动效表）：按钮上「已加进 ✓」停多久、
 * 输入框里「角色 N」那一页的小点亮多久。与 `--animate-tag-land` 的浅底褪色同一拍。
 */
export const TAG_ADD_ACK_MS = 1200

/**
 * 复制成功后那颗键写「已复制」多久（LoRA 库 B 与提示词页 A 的动效表都是 1.2 秒），
 * ⛔ 弹 toast。
 */
export const COPIED_ACK_MS = 1200

/**
 * 全站「提示与弹窗」（owner 2026-10-08 定稿，原型 `NzjiqK3k2DuKDji7wQdeBL`）的三段停留。
 * ⚠ 这三个数是**停留**，不是过渡时长 —— ⛔ 不走四档刻度。
 *
 * · `buttonAckMs`：点按钮得到的结果（「✓ 已开始下载」「✓ 已上传 3 张」）在键上停多久再缩回。
 *   页面文档里单独定过 1.2 秒的复制键（LoRA 库 / 提示词页 / 素材查看器）仍走 `COPIED_ACK_MS`。
 * · `deleteArmMs`：能撤销的小删除拉长成红色「确认删除」后，不点就自己缩回的时间。
 * · `undoWindowMs`：删掉之后底部黑条上「撤销」留多久 —— 这段时间里删除还没真的落库。
 */
export const FEEDBACK_TIMING = {
  buttonAckMs: 1600,
  deleteArmMs: 3000,
  undoWindowMs: 5000,
} as const

/**
 * 底部黑条（sonner）与它要让开的那条底部输入框之间留多少（px）。
 * 没有输入框时黑条离视口底边 `--toast-offset-bottom`（globals.css）。
 */
export const TOAST_LIFT_GAP_PX = 12

/**
 * 工具行 chip 弹层 ②「从 chip 放大」（owner 2026-09-26 画板 PopZoom）的起止形态；
 * 节拍走 CSS token，见 `useStudioChipPopoverMotion`。
 */
export const CHIP_POPOVER = {
  /** 收起时的缩放（以 chip 中心为原点）。 */
  fromScale: 0.72,
  /** 收起时的模糊半径（px）。 */
  blurPx: 4,
} as const

/**
 * 弹簧 transition 预设。reducedMotion 传 useReducedMotion() 的返回值——为真时
 * 退回脊柱线性档（与 CSS 侧的 `prefers-reduced-motion` 降级同一口径）。
 */
export function springTransition(
  preset: MotionSpringPreset,
  reducedMotion: boolean | null = false,
):
  | { duration: number; ease: [number, number, number, number] }
  | (typeof SPRING)[MotionSpringPreset] {
  if (reducedMotion) return motionTransition('base', true)
  return SPRING[preset]
}

/** stagger：50ms 步进，总延迟封顶 300ms */
export const STAGGER_STEP_S = 0.05
export const STAGGER_MAX_S = 0.3

/** 第 index 个元素的 stagger 延迟（秒） */
export function staggerDelay(index: number): number {
  return Math.min(index * STAGGER_STEP_S, STAGGER_MAX_S)
}

/**
 * motion transition 预设。
 * reducedMotion 传 useReducedMotion() 的返回值（true 时时长归零）。
 */
export function motionTransition(
  preset: MotionDurationPreset,
  reducedMotion: boolean | null = false,
): { duration: number; ease: [number, number, number, number] } {
  return {
    duration: reducedMotion ? 0 : DURATION[preset],
    ease: EASE_STANDARD,
  }
}

/**
 * 吞噬三拍专属曲线（node-canvas.md §8，2026-07-10 owner demo 手感定稿，数值照抄）。
 * 与 EASE_STANDARD 分开命名——这两拍的手感（快吸入 / 软回弹）明显偏离全站默认
 * 曲线，不能共用一条。CSS 侧的同名变量在 globals.css `@theme`
 * （--ease-ingest / --ease-soft-return），Web Animations API（`Element.animate`）
 * 调用方直接用这两个字符串常量做 `easing`。
 */
export const EASE_INGEST_CSS = 'cubic-bezier(0.45, 0.05, 0.6, 1)'
export const EASE_SOFT_RETURN_CSS = 'cubic-bezier(0.3, 0.7, 0.4, 1.05)'

/**
 * 吞噬三拍数值表（node-canvas.md §8「幅度加强」档，逐字照抄，不做二次设计）。
 * `node-ingest-dom.ts` / `use-cast-ingest-engine-v4.ts` 的 Web Animations API keyframes 全部从这里取值——手势里
 * 不允许出现裸数字（禁 inline 魔法值，任务包 B1-3 红线）。
 */
/**
 * 助手改过的节点**闪一次 outline**（进度表 22 · D7 Q4 的回执那一半）。
 *
 * ⭐ 它是回执的第二只眼：面板里那一行「已改 N 项」说的是**多少**，这一闪说的是
 * **哪几个** —— 用户不必读完一行字再去画布上找。
 * ⚠ 只动 `outline` 与 `opacity`（⛔ 不动 transform / 尺寸）：被改的节点常常正在
 * 用户视线里，动尺寸会让整片卡跟着重排。
 * ⚠ `prefers-reduced-motion` 那一档由 CSS 压到 1ms 并保留终态（同画布其余三档）。
 */
export const ASSISTANT_TOUCH_FLASH_MOTION = {
  durationMs: 320,
  outlineWidthPx: 2,
  outlineOffsetPx: 4,
} as const

/**
 * 助手的光标（owner 2026-10-07 动效第 2 批「改工作台」，`lib/studio-operator-cursor.ts`）。
 * 走一站 = `DURATION_MS.slow`，到站那一闪 = 上面的 `ASSISTANT_TOUCH_FLASH_MOTION`。
 * `insetPx` = 箭头尖落在那一格左沿往里多少；`enterOffsetPx` = 第一次出现时从右下
 * 挪进来多远；`idleHideMs` = 走完最后一站后停多久再淡出。
 */
export const ASSISTANT_CURSOR_MOTION = {
  insetPx: 16,
  enterOffsetPx: 10,
  idleHideMs: 900,
} as const

export const INGEST_MOTION = {
  /** 张口：拖拽物进入合法目标热区。 */
  biteDurationMs: 180,
  biteScale: 1.08,
  biteTiltDeg: 1.5,
  biteOutlineWidthPx: 2,
  biteOutlineOffsetPx: 4,
  /** 消化落定：目标 gulp overshoot + 成分 chip pop。 */
  gulpDurationMs: 480,
  gulpOvershootScaleX: 0.98,
  gulpOvershootScaleY: 1.05,
  chipPopDurationMs: 340,
  chipPopScale: 1.2,
  /** 咬不动：软弹回 + 摇头。 */
  rejectDurationMs: 950,
  rejectLungeRatio: 0.58,
  rejectShakeDurationMs: 330,
  rejectShakeAmplitudePx: 5,
  rejectReasonVisibleMs: 2400,
  /** 拖拽判定阈值（§6.3：pointerdown 超过阈值才进入拖拽，否则按普通点击处理）。 */
  dragThresholdPx: 6,
} as const

/**
 * 墨线签署 / 褪去 + 本体软回弹数值表（canvas-relationship-v3 §2.7 R3-2，非折叠源
 * 落卡的动效分流——目标本体不消失，动画从"播吞掉动画但卡还在"改成"目标轻咽 +
 * 墨线画入 + 拖拽物软回弹回起点"）。时长全部snap到既有四档刻度
 * （fast120/base200/slow320），不自创数值：
 * - targetSettleMs = fast×2 = 240（spec"约240ms"的最近可组合档）
 * - inkDrawMs = slow = 320（spec 原文件直接给了 320，且明确"--ease-ingest 沿用"）
 * - inkHoldFadeMs = base = 200（spec"若不会常显，再 ~200ms 淡出隐藏"）
 * - unsignFadeMs = fast×2 = 240（spec"解绑反放 ~240ms"）
 * - bounceBackMs = slow = 320（spec"~300ms 软回弹"，snap 到最近档，非精确值——
 *   偏差在实现报告中点名）
 */
export const NODE_EDGE_SIGNING_MOTION = {
  /** 目标轻咽：scale 1→0.98→1.02→1。 */
  targetSettleMs: DURATION_MS.fast * 2,
  targetSettleScaleDown: 0.98,
  targetSettleScaleUp: 1.02,
  /** 墨线画入：来源锚点→目标锚点 stroke-dashoffset 满长→0。 */
  inkDrawMs: DURATION_MS.slow,
  /** 画入完成后，若判定不会常显（非选中的成分边），再淡出这么久后才真正隐藏。 */
  inkHoldFadeMs: DURATION_MS.base,
  /** 解绑：dashoffset 反放（0→满长）。 */
  unsignFadeMs: DURATION_MS.fast * 2,
  /** 被拖节点本体从落点软回弹回拖拽起点。 */
  bounceBackMs: DURATION_MS.slow,
} as const

/**
 * 落物「逐张淡入」（摆放与连线 · 动效表：上传多张 = 一张接一张排成一行，逐张淡入，
 * 错开 40）。`node-ingest-dom.fadeInNodeCards` 的 WAAPI 从这里取值。
 * ⚠ reduced motion：直接落位 + fast 档淡入，⛔ 不错开。
 */
export const NODE_DROP_FADE_MOTION = {
  durationMs: DURATION_MS.base,
  staggerMs: 40,
  reducedDurationMs: DURATION_MS.fast,
} as const

/**
 * 助手结果「弹进来」那一类的过冲曲线（拍板 17 的灯箱与参考图缩略图）。
 *
 * ⚠ 与 `EASE_STANDARD` 分开命名，理由和吞噬三拍一样：这两拍的手感是**带过冲的
 * 弹出**，全站默认那条曲线是收敛的，共用一条会把「蹦出来」读成「淡进来」。
 * ⛔ 数值不再散写进组件 —— 组件里出现裸数组就是下一个人复制粘贴的源头。
 *
 * 时长这一侧照旧走四档刻度（`DURATION`），⛔ 不自创数值。
 */
export const EASE_POP: [number, number, number, number] = [0.2, 0.9, 0.3, 1.1]

/** 同一族、过冲更大的一档：参考图缩略图挂上去那一下。 */
export const EASE_POP_STRONG: [number, number, number, number] = [
  0.2, 0.9, 0.3, 1.25,
]
