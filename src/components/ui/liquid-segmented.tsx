'use client'

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'

import { LIQUID_SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

export interface LiquidSegmentedItem<T extends string> {
  readonly value: T
  readonly label: string
  /** 字只是缩写（S / M / L）时的全称：给读屏当名字，也当悬停提示。 */
  readonly title?: string
  /** 字后面亮一个小点（刚往这一格里加了东西，查资料 B 动效表）。 */
  readonly indicator?: boolean
  /** 字上面的小图形（`stack` 档：比例格的形状）。 */
  readonly icon?: ReactNode
  /** 只当悬停提示（不支持这一档的原因）；⛔ 不当读屏名字，名字仍是 `label`。 */
  readonly hint?: string
}

/** 字后面的小点用正文色（⛔ 跟着灰字走就看不出）。 */
function Indicator() {
  return (
    <span
      aria-hidden
      className="ml-1.25 inline-block size-1.5 animate-target-dot rounded-full bg-foreground align-middle motion-reduce:animate-none"
    />
  )
}

interface LiquidSegmentedProps<T extends string> {
  items: readonly LiquidSegmentedItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  disabled?: boolean
  /** 单独禁用某几项（仍然画出来，灰着）。 */
  disabledValues?: readonly T[]
  /**
   * `sm` = 工具行那一档（11px）；`md` = 设置页里的一行选择（14px，触屏 44px 高）；
   * `row` = 与 32px 高的筛选键、按钮排成一行（整颗正好 32px）；
   * `xs` = 弹层里一行参数的那一档（「专属」A1，owner 2026-10-07）：左右内边距收窄，
   * 六个选项能在 260px 里排开。
   * `stack` = 图形在上、字在下的方块格（规格弹层的比例，owner 2026-10-08 选「分段条」）。
   */
  size?: 'xs' | 'sm' | 'md' | 'row' | 'stack'
  /**
   * `tabs` = 换一页（`tablist` / `tab`）；`radio` = 选一档（`radiogroup` / `radio`）。
   * ⚠ 长相一样、读屏念的不一样：选语气不是翻页。
   */
  semantics?: 'tabs' | 'radio'
  /**
   * 点已选中的那一格也回调 `onChange`。规格弹层要它：LoRA 套了配方之后再点当前比例
   * 要把显式宽高改回这一档，视频清晰度再点一次是清回默认。
   */
  reselect?: boolean
  /** 撑满父容器，每一格等分（手机抽屉里那一排页签）。 */
  fill?: boolean
  className?: string
}

function measure(items: Map<string, HTMLButtonElement>, target: string) {
  const item = items.get(target)
  return item
    ? { left: item.offsetLeft, right: item.offsetLeft + item.offsetWidth }
    : null
}

const ITEM_CLASS = {
  xs: 'shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-2xs font-medium coarse:py-3',
  sm: 'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1 text-2xs font-medium',
  md: 'shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium coarse:py-3',
  // 定高而不是靠行高撑：和同一行 32px 的按钮对齐。
  row: 'inline-flex h-6.5 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 text-2sm font-medium',
  stack:
    'flex min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-lg px-1 py-1.5 font-mono text-2xs font-medium',
} as const

/**
 * 液态分段（owner 2026-09-26：「视频里那个效果」）。
 *
 * 选中块的**两条边各一根弹簧**：往哪边走，那一边是硬的 `lead`、身后那条是软的
 * `trail`，所以途中被拉长、到站再收拢 —— 一个物体在走，⛔ 不是两颗按钮换色。
 *
 * 长相照 ui-spec.md §9「切换条」：浅灰轨道（`fill-strong`），选中的是浮起来的白格
 * （`raise` + `seg`），垫在字下面；选中的字变成正文色。
 *
 * ⚠ 位置只在「值变了」或「几何变了」时动：父组件在动画途中重渲染不能把它打回终点。
 */
export function LiquidSegmented<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  disabledValues,
  size = 'sm',
  semantics = 'tabs',
  fill = false,
  reselect = false,
  className,
}: LiquidSegmentedProps<T>) {
  const radio = semantics === 'radio'
  const stack = size === 'stack'
  const reducedMotion = useReducedMotion()
  const boxRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())
  const left = useMotionValue(0)
  const right = useMotionValue(0)
  /**
   * ⚠ 白格宽度是一颗**自己同步**的值，⛔ 不用 `useTransform(() => …)`：那条派生值的
   *   更新排在下一帧，而开发态 StrictMode 的「挂载 → 清理 → 再挂载」会把首次量完
   *   排的那一帧取消掉；再挂载时几何没变、`jump` 同值不通知 —— 白格就停在 0 宽
   *   （owner 2026-09-26「角色 / 画师」截图）。
   */
  const cellWidth = useMotionValue(0)
  /** 上一次落定的值与它的几何 —— 用来分辨「换了选中」与「只是重排了」。 */
  const placed = useRef<{ value: T; left: number; right: number } | null>(null)

  useLayoutEffect(() => {
    const box = boxRef.current
    const target = measure(itemRefs.current, value)
    if (!box || !target) return

    const previous = placed.current
    placed.current = { value, ...target }
    if (!previous || reducedMotion) {
      left.jump(target.left)
      right.jump(target.right)
      return
    }
    if (previous.value === value) {
      // 同一个选中、几何变了（加了一页 / 字变了）：原地挪过去，不演。
      if (previous.left !== target.left || previous.right !== target.right) {
        left.jump(target.left)
        right.jump(target.right)
      }
      return
    }
    const rightward =
      (target.left + target.right) / 2 > (left.get() + right.get()) / 2
    animate(
      right,
      target.right,
      rightward ? LIQUID_SPRING.lead : LIQUID_SPRING.trail,
    )
    animate(
      left,
      target.left,
      rightward ? LIQUID_SPRING.trail : LIQUID_SPRING.lead,
    )
  })

  // ⚠ 排在量尺寸那条 layout effect 之后：挂载（含 StrictMode 再挂载）时当场同步一次，
  //   此后三条边一动就跟着改。
  useLayoutEffect(() => {
    const sync = () => cellWidth.set(Math.max(0, right.get() - left.get()))
    sync()
    const unsubscribe = [left, right].map((edge) => edge.on('change', sync))
    return () => unsubscribe.forEach((stop) => stop())
  }, [cellWidth, left, right])

  // 容器自己变宽变窄（窗口缩放、字体晚到）时跟着落位。
  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const current = placed.current
      if (!current) return
      const target = measure(itemRefs.current, current.value)
      if (!target) return
      placed.current = { value: current.value, ...target }
      left.jump(target.left)
      right.jump(target.right)
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [left, right])

  return (
    <div
      role={radio ? 'radiogroup' : 'tablist'}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex shrink-0 bg-fill-strong p-0.75',
        stack ? 'rounded-xl' : 'rounded-full',
        'has-focus-visible:shadow-focus',
        fill && 'flex w-full',
        disabled && 'opacity-50',
        className,
      )}
    >
      <div ref={boxRef} className={cn('relative flex', fill && 'flex-1')}>
        <motion.div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 bg-raise shadow-seg',
            stack ? 'rounded-lg' : 'rounded-full',
          )}
          style={{ x: left, width: cellWidth }}
        />
        {items.map((item) => (
          <button
            key={item.value}
            ref={(node) => {
              if (node) itemRefs.current.set(item.value, node)
              else itemRefs.current.delete(item.value)
            }}
            type="button"
            role={radio ? 'radio' : 'tab'}
            aria-label={item.title}
            title={item.hint ?? item.title}
            {...(radio
              ? { 'aria-checked': item.value === value }
              : { 'aria-selected': item.value === value })}
            disabled={disabled}
            // ⚠ 单项禁用用 `aria-disabled`：不支持的档要能悬停看原因，`disabled` 连 title 都不弹。
            aria-disabled={disabledValues?.includes(item.value) || undefined}
            onClick={() => {
              if (disabledValues?.includes(item.value)) return
              if (reselect || item.value !== value) onChange(item.value)
            }}
            className={cn(
              ITEM_CLASS[size],
              // sm / row 的格子只有 25–26px 高，又不能像 xs / md 那样 coarse 下撑高
              // （工具行、32px 按钮行会被撑乱）—— 只补看不见的 44px 命中区。
              (size === 'sm' || size === 'row') && 'touch-target-y',
              fill && 'flex-1 text-center',
              'relative text-ink-2 transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:text-ink-2',
              item.value === value && 'text-foreground',
            )}
          >
            {item.icon}
            {item.label}
            {item.indicator ? <Indicator /> : null}
          </button>
        ))}
      </div>
    </div>
  )
}
