'use client'

/**
 * 助手正文的**流式渲染件**（`pages/assistant-shell.md` §4.1 第一行 / §11.5 「按词淡入」）。
 *
 * ⭐ 由来（owner 2026-09-06「助手回复应该一个字一个字连续出」「缺少加载中的状态」）：
 * 正文此前是一坨砸出来的 —— 服务端等整份 turn JSON 收完才发一帧 `message`。现在
 * 服务端边收边吐 `message_delta`，这一颗负责让长出来的那几个字**看得出是在长**。
 *
 * ── 两件事，一颗组件 ──────────────────────────────────────────────
 *  · `text` 为空且还在流 → **占位脉冲**（三点）。它的高度**就是一行正文的高度**
 *    （`h-6` = `text-md`/`leading-relaxed` 的行高），所以第一个字到达时那一行不跳。
 *  · `text` 有字 → 按词（中日韩按字）切片，新出现的那一片淡入 `--duration-fast`。
 *
 * ── ⚠ 为什么 key 用下标 ─────────────────────────────────────────────
 * 淡入靠的是**挂载动画**（`animate-in fade-in-0`）：老片段的 key 不变就不会重挂，
 * 也就不会重新淡一次；只有追加在末尾的新片段是新 key，于是只有它淡。
 * ⛔ 别改成按内容做 key —— 同一个词在一段话里出现两次就会撞 key，而表现是整段
 * 文字每来一个字就整体闪一下。
 * ⚠ 末尾那一片会随着字的到来**原地变长**（`夜` → `夜景`）：同一个 key、同一个
 * 节点、只换文本，所以它不重新淡 —— 这正是「连续长出来」而不是「一格一格跳」。
 *
 * ⚠ `motion-reduce` 直接显示：淡入是装饰，⛔ 不允许它成为看不看得见字的条件。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_STREAMING } from '@/constants/studio-assistant-operator'
import { cn } from '@/lib/utils'

/**
 * 切片规则。
 *
 * ⭐ 中日韩**逐字**、拉丁**逐词**：中文一句话里没有空格，按空白切等于整段一片，
 * 而整段一片就没有「一个字一个字」可言了 —— 而这正是 owner 要的那件事。
 * ⚠ 空白单独成片并**保留原样**（不 trim）：正文里的换行与缩进是内容的一部分，
 * `whitespace-pre-wrap` 要靠它们排版。
 */
const CJK =
  '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af'
const SLICE_PATTERN = new RegExp(`\\s+|[${CJK}]|[^\\s${CJK}]+`, 'g')

export function sliceStreamingText(text: string): string[] {
  return text.match(SLICE_PATTERN) ?? []
}

interface StudioOperatorStreamingTextProps {
  text: string
  /** 这一条还在长 —— 空正文时画占位脉冲，⛔ 不画一行空白。 */
  streaming?: boolean
  /**
   * 揭示还没走完（`revealed < text.length`）—— 报给上一层。
   *
   * ⭐ 为什么要报：折叠（长回话折首句）与「done」这类收尾动作**必须等揭示完**，
   * 否则一条正在一个字一个字写出来的回复会在写到一半时自己折起来 —— 那比不做
   * 打字机还糟。⛔ 别让上一层去猜（比较 text 长度猜不出揭示进度，那是这颗组件
   * 内部的状态）。
   */
  onRevealingChange?(revealing: boolean): void
  className?: string
}

export function StudioOperatorStreamingText({
  text,
  streaming = false,
  onRevealingChange,
  className,
}: StudioOperatorStreamingTextProps) {
  const t = useTranslations('StudioOperator')
  const reducedMotion = useReducedMotion()

  /**
   * ⭐ **已显示到第几个字**（owner 2026-09-07「助手回复应该一个字一个字连续出」）。
   *
   * 🔬 由来：落地闸（`flushFloorMs`）保证的是「块到了就写进去」，而 provider 那
   * 一侧的分块粗到 4 块 / 130ms —— 写进去的仍然是一整块，屏幕上就是四次「啪」。
   * 所以最后这一段由渲染侧自己按 `revealCharsPerSec` 追着目标长度走。
   * ⚠ 初值是**当前长度**不是 0：载回来的历史 / 已经定稿的条目挂载时就是全文，
   * 从 0 揭示一遍等于每次开面板都重放一次几十条旧回复。
   * ⚠ 状态与 ref **两份**：ref 给定时器读（不然每一跳都要重建定时器，速率就成了
   * 「每帧重新算的剩余时间」，永远收不了尾），state 只负责触发重渲。
   */
  const [revealed, setRevealed] = useState(text.length)
  const revealedRef = useRef(text.length)

  const finishReveal = useCallback(() => {
    revealedRef.current = text.length
    setRevealed(text.length)
  }, [text])

  useEffect(() => {
    const target = text.length
    // 条目换了内容（id 复用 / 定稿覆盖成更短的一版）—— 别让进度停在越界处。
    if (revealedRef.current > target) revealedRef.current = target
    if (reducedMotion || revealedRef.current >= target) return

    const remaining = target - revealedRef.current
    const tickMs = 1000 / STUDIO_OPERATOR_STREAMING.revealCharsPerSec
    /**
     * ⚠ **封顶只提速率，⛔ 不跳到末尾**：一段 500 字的回复按 60 字/秒要揭示 8 秒，
     * 而那时用户早读完前三行在等剩下的。超过 `revealMaxMs` 就把这一段整体加速
     * 一次收完 —— 仍然是连续长出来的，只是快。
     */
    const durationMs = Math.min(
      (remaining / STUDIO_OPERATOR_STREAMING.revealCharsPerSec) * 1000,
      STUDIO_OPERATOR_STREAMING.revealMaxMs,
    )
    /**
     * ⭐ **按墙上时钟走，⛔ 不按跳数走**（🔬 2026-09-07 真机）。
     *
     * 由来与 `flushFloorMs` 那条兜底闸同源：窗口被遮挡 / 标签页切走时浏览器把
     * 定时器夹到 1 秒一跳 —— 「每跳一个字」于是变成「每秒一个字」，一段 88 字的
     * 回复要写 40 秒（真机上量到的就是这个数）。改读 `Date.now()` 之后，跳得多慢
     * 都只影响**平滑度**，这一段恒在 `durationMs` 内写完。
     */
    const from = revealedRef.current
    const startedAt = Date.now()
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs)
      const next = Math.min(target, from + Math.ceil(remaining * progress))
      revealedRef.current = next
      setRevealed(next)
      if (next >= target) clearInterval(timer)
    }, tickMs)

    /**
     * ⭐ **没人在看就别演**（🔬 2026-09-07 真机）：标签页在后台时 Chrome 会把
     * 连续的定时器夹到一分钟一跳（intensive throttling）—— 表现是切回来那一眼
     * 正文停在半句上。⛔ 别指望调 `tickMs` 躲开它：那是浏览器的省电策略，唯一
     * 正确的答案是隐藏时直接把字给全。
     * ⚠ 走 `setTimeout(…, 0)` 而不是在 effect 里直接 `setState`：后者是级联渲染
     * （`react-hooks/set-state-in-effect`），而这一跳没有任何人在看着屏幕。
     */
    const finishNow = () => {
      clearInterval(timer)
      revealedRef.current = target
      setRevealed(target)
    }
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null
    const onVisibility = () => {
      if (document.hidden) hiddenTimer = setTimeout(finishNow, 0)
    }
    if (document.hidden) hiddenTimer = setTimeout(finishNow, 0)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      if (hiddenTimer !== null) clearTimeout(hiddenTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [text, reducedMotion])

  /**
   * ⚠ `motion-reduce` 直接落地：打字机是装饰，⛔ 不允许它成为「多久才读得到这
   * 句话」的条件。
   */
  const shown = reducedMotion
    ? text
    : text.slice(0, Math.min(revealed, text.length))
  const revealing = !reducedMotion && revealed < text.length

  useEffect(() => {
    onRevealingChange?.(revealing)
  }, [onRevealingChange, revealing])

  const slices = useMemo(() => sliceStreamingText(shown), [shown])

  if (slices.length === 0 && streaming) {
    return (
      <p
        data-testid="operator-message-pending"
        // ⚠ 高度写死成一行正文高（`text-md`(15px) + `leading-relaxed` ≈ 24px
        //   = `h-6`）：§4.1「骨架尺寸 = 内容尺寸」，第一个字到达时这一行不许跳。
        //   ⚠ 字号抬到 15 那一轮（2026-09-06）这里跟着从 `h-4` 改过来 —— 忘了改
        //   的表现是占位行比正文矮一截，第一个字到达时整条跳一格。
        className={cn(
          'flex h-6 items-center gap-1 text-md leading-relaxed',
          className,
        )}
        aria-label={t('streaming.pending')}
      >
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            aria-hidden
            style={{ animationDelay: `${dot * 140}ms` }}
            className="size-1 rounded-full bg-muted-foreground/70 animate-pulse motion-reduce:animate-none"
          />
        ))}
      </p>
    )
  }

  return (
    <p
      data-testid="operator-message-text"
      /* ⚠ 揭示没完就还算「在流」：`done` 早于文字写完的话，折叠与自动收起会在
         字还在长的时候动手（见 `onRevealingChange` 头注）。 */
      data-streaming={streaming || revealing ? 'true' : 'false'}
      /* 点一下就把剩下的字**立刻**给他 —— 等打字机是本仓最讨厌的那种等待。
         ⚠ 它是加速器不是唯一出路（`revealMaxMs` 自己会收尾），所以⛔ 不把这段
         正文变成一颗按钮：读屏那边多一颗「按钮：已经改成夜景了」毫无意义。 */
      onClick={finishReveal}
      className={cn(
        'whitespace-pre-wrap text-md leading-relaxed text-foreground',
        className,
      )}
    >
      {slices.map((slice, index) => (
        <span
          // ⚠ 下标就是「第几片」——换成内容 key 会撞，见头注。
          key={index}
          data-testid="operator-message-slice"
          className="animate-in fade-in-0 duration-(--duration-fast) ease-standard motion-reduce:animate-none"
        >
          {slice}
        </span>
      ))}
    </p>
  )
}
