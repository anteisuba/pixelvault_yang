'use client'

/**
 * **钉住的证据常驻条**（v2 §3.2 证据卡第三态 / 画板 BCards「已钉住 · 留在面板顶部」）。
 *
 * ⭐ 钉住之后那条结论**额外**在面板顶部留一份 —— 时间线里的那张卡照旧折叠
 * （§3.2「进入 / 离开时间线的规则」最后一行）。为什么留一份：用户钉它就是为了
 * 「接下来这一整轮都别让我忘了这句」，而时间线是会滚走的。
 * ⚠ **一条都没钉住就整条不渲染**（⛔ 不画「还没有钉住的证据」那种占位）。
 * ⚠ 每条都点得回原卡（`onJump`）：常驻条只说结论，来源、候选、过程都还在卡上。
 * ⚠ 皮肤走信号位（§12.2）：近黑描边 + 加粗标签，⛔ 不引入新色相、不填色。
 */

import { Pin, X } from '@/components/icons'
import { useTranslations } from 'next-intl'

export interface StudioOperatorPinnedEvidenceItem {
  /** 与时间线那张卡同一个 `runKey` —— 点回去靠它。 */
  runKey: string
  /** 钉住时卡上那一句结论（⛔ 常驻条不自己再压一句）。 */
  conclusion: string
  sourceCount: number
  /** 几条证据有多源印证 —— 0 就不画那一截。 */
  corroborated: number
  /**
   * 它钉的那几条证据编号（§7.3）—— × 那一下要按它从结论记录里摘掉这一条。
   * ⚠ 可空：拿不到号段的那几轮只活在面板的暂存态里（见面板 `localPins`）。
   */
  refs?: readonly string[]
}

interface StudioOperatorPinnedEvidenceProps {
  items: readonly StudioOperatorPinnedEvidenceItem[]
  onJump(runKey: string): void
  onUnpin(runKey: string): void
}

export function StudioOperatorPinnedEvidence({
  items,
  onJump,
  onUnpin,
}: StudioOperatorPinnedEvidenceProps) {
  const t = useTranslations('StudioOperator')

  if (items.length === 0) return null

  return (
    <div
      data-testid="operator-pinned-evidence"
      aria-label={t('research.pinnedHeading')}
      className="flex shrink-0 flex-col gap-1.5 border-b border-border px-3 py-2"
    >
      {items.map((item) => (
        <div
          key={item.runKey}
          data-testid="operator-pinned-evidence-item"
          data-run-key={item.runKey}
          /* 信号位：近黑描边 + 白卡（§12.2）。⛔ 不用 `--primary`——那一支被
             工作台的生成键占着，同色会让用户分不出是哪一颗。 */
          className="flex items-start gap-2 rounded-xl border-2 border-foreground bg-card px-3 py-2"
        >
          <Pin
            className="mt-0.5 size-3.5 shrink-0 text-foreground"
            aria-hidden
          />
          <button
            type="button"
            data-testid="operator-pinned-evidence-jump"
            onClick={() => onJump(item.runKey)}
            className="min-w-0 flex-1 rounded-md text-left transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <span className="block text-2xs font-medium tracking-nav uppercase text-foreground">
              {t('research.pinned')}
            </span>
            <span className="mt-1 block text-2sm leading-relaxed text-foreground">
              {item.conclusion}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t('research.sourceCount', { count: item.sourceCount })}
              {item.corroborated > 0
                ? ` · ${t('research.corroborated', { count: item.corroborated })}`
                : ''}
            </span>
          </button>
          <button
            type="button"
            data-testid="operator-pinned-evidence-unpin"
            aria-label={t('research.unpin')}
            onClick={() => onUnpin(item.runKey)}
            className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
