'use client'

/**
 * 提示词栏上的**「模型」chip 与它的三组弹层**（画板 `AudioSelected.dc.html`：
 * 语音 / 配乐 / 音效）。
 *
 * ⚠ **组就是类型**：选了 `ElevenLabs Music` 这张卡就是配乐卡，音色 chip 随即消失
 * （spec §4「选了模型就定了类型，不另设类型 chip」）。分组键读目录里的
 * `audioKind`，⛔ 不在这里另列一张「哪个模型属于哪一类」的表。
 *
 * ⚠ 与 S1 的 `ModelPickerPopover`（方案 A：系列分组 + 搜索 + 渠道单选）的关系：
 * 那一份按**厂商系列**分组，摆在这里会把三个类型混成两家厂商，画板要的正好相反。
 * 音频这一栏因此用自己的三组列表；同一份数据、同一条写入（`onSetModel`）。
 */

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'

import { getModelUnitPriceByStringId } from '@/constants/models/unit-prices'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import type { NodeWorkflowModelOption } from '@/types/node-workflow'

import { ChipPopover } from '../chrome'
import { audioModelGroups } from './audio-node-model'

/** 画板宽（模型弹层比参数弹层宽一档）。 */
const MODEL_POPOVER_WIDTH = 300

export interface AudioModelChipProps {
  readonly options: readonly NodeWorkflowModelOption[]
  readonly value: string | undefined
  onChange(option: NodeWorkflowModelOption): void
  readonly disabled?: boolean
}

export function AudioModelChip({
  options,
  value,
  onChange,
  disabled = false,
}: AudioModelChipProps) {
  const t = useTranslations('StudioNode.v4.audio.model')
  const tModels = useTranslations('Models')
  const tCommon = useTranslations('Common')
  const groups = audioModelGroups(options)
  const selected = options.find((option) => option.optionId === value)
  const labelOf = (option: NodeWorkflowModelOption) =>
    getTranslatedModelLabel(tModels, option.modelId)

  return (
    <ChipPopover
      ariaLabel={t('title')}
      width={MODEL_POPOVER_WIDTH}
      trigger={
        <button
          type="button"
          disabled={disabled}
          data-audio-model-chip
          aria-label={t('title')}
          className={cn(
            'nodrag nopan inline-flex min-h-6 shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-2xs',
            'transition-colors duration-fast ease-standard',
            'hover:border-foreground/40 hover:text-foreground',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-60',
            selected
              ? 'border-foreground text-foreground'
              : 'border-border text-muted-foreground',
          )}
        >
          {selected ? labelOf(selected) : t('title')}
        </button>
      }
    >
      <div className="flex flex-col gap-1">
        {groups.map((group) => (
          <div key={group.kind} className="flex flex-col">
            <p
              data-audio-model-group={group.kind}
              className="px-1.5 pt-1.5 pb-1 text-3xs tracking-node-sec text-muted-foreground"
            >
              {t(`kinds.${group.kind}`)}
            </p>
            {group.options.map((option) => {
              const active = option.optionId === value
              const price = getModelUnitPriceByStringId(option.modelId)
              return (
                <button
                  key={option.optionId}
                  type="button"
                  data-audio-model-option={option.optionId}
                  data-active={active ? 'true' : 'false'}
                  onClick={() => onChange(option)}
                  className={cn(
                    'nodrag nopan flex min-h-9 items-center gap-2 rounded-lg px-1.5 text-left',
                    'transition-colors duration-fast hover:bg-surface-fill-hover',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    active && 'bg-surface-fill',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-2sm text-foreground">
                      {labelOf(option)}
                    </span>
                    {price ? (
                      <span className="block truncate text-3xs text-muted-foreground">
                        {tCommon(`unitPrice.${price.unit}`, {
                          amount: price.amount,
                        })}
                      </span>
                    ) : null}
                  </span>
                  {active ? (
                    <Check aria-hidden className="size-4 shrink-0" />
                  ) : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </ChipPopover>
  )
}
