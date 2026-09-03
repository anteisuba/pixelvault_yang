'use client'

import { useMemo, type RefObject } from 'react'

import { cn } from '@/lib/utils'

export interface TriggerHighlightSegment {
  text: string
  /** 命中的触发词所属挂载名（用于 title），未命中为 null。 */
  matchedBy: string | null
}

export interface TriggerHighlightPhrase {
  /** 要在正文里找的触发词原文。 */
  phrase: string
  /** 该触发词来自哪个挂载（hover title 用）。 */
  ownerName: string
}

/** 词边界判定只挡拉丁字母/数字/下划线：CJK 触发词被 CJK 正文包着也算命中。 */
function isWordChar(ch: string | undefined) {
  return ch != null && /[A-Za-z0-9_]/.test(ch)
}

/**
 * 把正文切成「命中触发词 / 普通文字」的片段序列。
 *
 * 不走正则：触发词是用户数据，里面可能带 `\(` `)` `+` 这类正则元字符（本项目
 * 真实存在 `denia \(wuthering waves\)` 这种名字），逐个转义容易漏。改成
 * 小写化后 indexOf 扫描 + 前后字符的词边界校验，行为确定、无转义风险。
 *
 * 长词优先：先扫长的，短词不会把长词切碎（`black ribbon` 不被 `black` 抢先）。
 * 命中区间互不重叠——已被占用的位置直接跳过。
 */
export function buildTriggerHighlightSegments(
  text: string,
  phrases: readonly TriggerHighlightPhrase[],
): TriggerHighlightSegment[] {
  if (!text) return []
  const cleaned = phrases
    .map((p) => ({ ...p, phrase: p.phrase.trim() }))
    .filter((p) => p.phrase.length > 0)
    .sort((a, b) => b.phrase.length - a.phrase.length)
  if (cleaned.length === 0) return [{ text, matchedBy: null }]

  const lower = text.toLowerCase()
  // 每个字符位置记它属于哪个命中（null = 普通文字）。
  const owners: (string | null)[] = new Array(text.length).fill(null)
  const taken = new Array(text.length).fill(false)

  for (const { phrase, ownerName } of cleaned) {
    const needle = phrase.toLowerCase()
    let from = 0
    for (;;) {
      const at = lower.indexOf(needle, from)
      if (at < 0) break
      const end = at + needle.length
      const boundedLeft = !(isWordChar(text[at - 1]) && isWordChar(text[at]))
      const boundedRight = !(isWordChar(text[end - 1]) && isWordChar(text[end]))
      let free = true
      for (let i = at; i < end; i += 1) {
        if (taken[i]) {
          free = false
          break
        }
      }
      if (boundedLeft && boundedRight && free) {
        for (let i = at; i < end; i += 1) {
          taken[i] = true
          owners[i] = ownerName
        }
      }
      from = at + 1
    }
  }

  const segments: TriggerHighlightSegment[] = []
  let start = 0
  for (let i = 1; i <= text.length; i += 1) {
    if (i === text.length || owners[i] !== owners[start]) {
      segments.push({
        text: text.slice(start, i),
        matchedBy: owners[start] ?? null,
      })
      start = i
    }
  }
  return segments
}

export interface PromptTriggerHighlightProps {
  text: string
  phrases: readonly TriggerHighlightPhrase[]
  /** 背板 DOM，父层用它跟随 textarea 的 scrollTop。 */
  backdropRef: RefObject<HTMLDivElement | null>
  className?: string
}

/**
 * CD④ Prompt 内联触发词高亮的背板层。
 *
 * textarea 不能给单个词上样式，所以走业界通行的「背板 + 透明文字」：本层把
 * 同一段正文用完全相同的字体度量再排一遍，文字设成透明，只让命中片段带上
 * 底色 + 下划线；真正可见的文字来自压在上面的 textarea。因此这一层的字号 /
 * 行高 / 内边距 / 换行规则必须与 textarea 逐项对齐，改 textarea 的排版类时
 * 要同步改这里。
 *
 * ⚠ 与 CD 稿的出入：CD 把命中词画成 mono 字体 + 前置圆点的 inline chip。背板
 * 方案下任何改变字宽的装饰（换字体、加圆点、加内边距）都会让背板与 textarea
 * 错位，所以这里只保留不占宽的装饰——底色 + 下边线。要做到 CD 那种 chip，得
 * 把 textarea 换成 contenteditable，代价是 IME / 粘贴 / 撤销 / 无障碍全要重做，
 * 不值得为一层装饰付。
 */
export function PromptTriggerHighlight({
  text,
  phrases,
  backdropRef,
  className,
}: PromptTriggerHighlightProps) {
  const segments = useMemo(
    () => buildTriggerHighlightSegments(text, phrases),
    [text, phrases],
  )

  return (
    <div
      ref={backdropRef}
      aria-hidden
      className={cn(
        // ⚠ 字号必须与压在上面的 textarea 逐字一致（含 <768 的 iOS 防缩放档
        // `text-base md:text-sm`），否则高亮块和真实文字错位。
        'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-base leading-relaxed text-transparent md:text-sm',
        className,
      )}
    >
      {segments.map((segment, index) =>
        segment.matchedBy ? (
          <span key={index} className="lora-trigger-hl">
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
      {/* 末尾补一个换行：textarea 在正文以 \n 结尾时会多留一行可视空间，
          背板不补的话滚动到底时两边差一行。 */}
      {'\n'}
    </div>
  )
}
