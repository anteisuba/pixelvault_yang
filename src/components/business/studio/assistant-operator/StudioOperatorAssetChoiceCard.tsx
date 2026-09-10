'use client'

/**
 * **歧义反问单选卡**（`pages/assistant-shell.md` §3.3 第 5 行 / §11.4「反问单选卡」）。
 *
 * 用户说「把那张改一下」而候选不止一张时，助手列出缩略图让他点一张 —— 点中即
 * 成 @chip（§7「四条走同一条 chip 管线」）。
 *
 * ⚠ **本片只到组件为止**：由服务端 `ask` 帧驱动的接线是第 3 轮
 * 的事。⛔ 但组件不能因此写成半成品 —— 它此刻就能独立渲染与测试，接线那一片
 * 只要把事件映射成 `options` 与 `onChoose` 即可，形状一行都不用改。
 *
 * ⚠ 网格是 `grid-cols-4` + `aspect-3/4`（§11.4），与结果行卡的 2/4 列**不共用**
 * 一套：那张是「这一批的产出」，这张是「你指的是哪一个」，列数固定才不会在拖窄
 * 面板时把四个候选排成两屏。
 */

import { useTranslations } from 'next-intl'
import Image from 'next/image'

import { AttachKindGlyph } from '@/components/business/studio/assistant-operator/StudioOperatorAttachMenu'
import { cn } from '@/lib/utils'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'

interface StudioOperatorAssetChoiceCardProps {
  /** 助手问的那句（「你说的是哪一张？」之类，模型写的原话）。 */
  question: string
  options: readonly StudioOperatorAttachment[]
  /** 已经选过的那一个 —— 选完这张卡就 `.resolved`（§11.4 卡型通则）。 */
  chosenId?: string | null
  /** 点一张 —— 调用方把它变成 @chip 并带上下文重发。 */
  onChoose(option: StudioOperatorAttachment): void
}

export function StudioOperatorAssetChoiceCard({
  question,
  options,
  chosenId = null,
  onChoose,
}: StudioOperatorAssetChoiceCardProps) {
  const t = useTranslations('StudioOperator')
  const resolved = Boolean(chosenId)

  return (
    <div
      data-testid="operator-asset-choice"
      data-resolved={resolved}
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card',
        resolved && 'opacity-90',
      )}
    >
      <p
        className={cn(
          'border-b border-border px-3 py-2 text-md font-semibold',
          resolved ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {resolved ? t('choice.resolved') : t('choice.title')}
      </p>
      <div className="flex flex-col gap-3 p-3">
        <p className="text-2sm leading-relaxed text-muted-foreground">
          {question}
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {options.map((option) => {
            const isChosen = option.id === chosenId
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isChosen}
                data-testid="operator-asset-choice-option"
                data-chosen={isChosen}
                title={option.label}
                onClick={() => onChoose(option)}
                className={cn(
                  'relative grid aspect-3/4 place-items-center overflow-hidden rounded-md border bg-muted transition-colors duration-(--duration-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isChosen
                    ? 'border-primary ring-2 ring-primary'
                    : 'border-border hover:ring-2 hover:ring-primary',
                )}
              >
                {/* ⚠ 预览走 `thumbnailUrl`，⛔ 不回落到 `url`（视频的 url 是媒体
                    本身，喂给 `next/image` 得到一个碎图标）。 */}
                {option.thumbnailUrl ? (
                  <Image
                    src={option.thumbnailUrl}
                    alt={option.label}
                    width={120}
                    height={160}
                    unoptimized
                    className="size-full object-cover"
                  />
                ) : (
                  <AttachKindGlyph kind={option.kind} />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
