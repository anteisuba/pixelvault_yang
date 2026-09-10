'use client'

/**
 * 「给这句加语气」浮层（画板 `AudioSelected.dc.html` 右下那张 340 宽的 pop）。
 *
 * 四段：**情绪**组 · **语气**组 · **强度**三档 · **自定义描述**。选完插进台词
 * 句首，成为一颗行内标记 chip —— 也就是 `insertVoiceMarkup` 那一次调用。
 *
 * ⚠ 这一层**不认识节点**：它只把「选了哪些标签」交出去，插到哪、插进谁的台词由
 * 调用方决定（视频卡的 @语音 与剪辑台的「加一句台词」复用同一份，spec §4 末句）。
 *
 * ⚠ 情绪与语气**各自最多一个**（官方 Common Combinations 全是「情绪 + 语气」两个
 * 一组），加上句内 ≤3 的硬顶由 `insertVoiceMarkup` 兜底。⛔ 不做多选堆叠。
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  VOICE_MARKUP_EMOTIONS,
  VOICE_MARKUP_INTENSITIES,
  VOICE_MARKUP_INTENSITY_IDS,
  VOICE_MARKUP_TONES,
  type VoiceMarkupInsert,
  type VoiceMarkupIntensity,
} from '@/lib/voice-markup'
import { cn } from '@/lib/utils'

/** 画板宽。 */
export const TONE_POPOVER_WIDTH = 340

export interface AudioTonePopoverProps {
  onInsert(inserts: readonly VoiceMarkupInsert[]): void
}

function TagRow({
  label,
  tags,
  value,
  onChange,
  testAttr,
}: {
  readonly label: string
  readonly tags: readonly { readonly label: string }[]
  readonly value: string | null
  onChange(next: string | null): void
  readonly testAttr: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-3xs tracking-node-sec text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => {
          const active = value === tag.label
          return (
            <button
              key={tag.label}
              type="button"
              aria-pressed={active}
              data-tone-tag={`${testAttr}:${tag.label}`}
              onClick={() => onChange(active ? null : tag.label)}
              className={cn(
                'nodrag nopan rounded-full px-2.5 py-1 text-2xs transition-colors duration-fast ease-standard',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                active
                  ? // 选中 = 反色（画板 `.grp span.on`）。对比度 `contrast-check`
                    // 2026-09-10：`primary-foreground` 对 `primary` = 18.68。
                    'bg-primary text-primary-foreground'
                  : 'bg-surface-fill text-foreground hover:bg-surface-fill-hover',
              )}
            >
              {tag.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function AudioTonePopover({ onInsert }: AudioTonePopoverProps) {
  const t = useTranslations('StudioNode.v4.audio.tone')
  const [emotion, setEmotion] = useState<string | null>(null)
  const [tone, setTone] = useState<string | null>(null)
  const [intensity, setIntensity] = useState<VoiceMarkupIntensity>(
    VOICE_MARKUP_INTENSITY_IDS.medium,
  )
  const [custom, setCustom] = useState('')

  const submit = (inserts: readonly VoiceMarkupInsert[]) => {
    if (inserts.length === 0) return
    onInsert(inserts)
    setEmotion(null)
    setTone(null)
    setCustom('')
  }

  const apply = () => {
    const inserts: VoiceMarkupInsert[] = []
    // 强度只跟着**情绪**走（官方的修饰词写法 `[very angry]`），语气标记本身就是
    // 一种表演方式，加 `very` 只会让描述变含糊。
    if (emotion) inserts.push({ label: emotion, intensity })
    if (tone) inserts.push({ label: tone })
    submit(inserts)
  }

  return (
    <div className="flex flex-col gap-2.5" data-audio-tone-popover>
      <div className="flex items-center justify-between gap-2">
        <span className="text-2sm font-medium tracking-node-body">
          {t('title')}
        </span>
        <span className="text-3xs text-muted-foreground">{t('hint')}</span>
      </div>

      <TagRow
        label={t('emotionLabel')}
        tags={VOICE_MARKUP_EMOTIONS}
        value={emotion}
        onChange={setEmotion}
        testAttr="emotion"
      />
      <TagRow
        label={t('toneLabel')}
        tags={VOICE_MARKUP_TONES}
        value={tone}
        onChange={setTone}
        testAttr="tone"
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-3xs tracking-node-sec text-muted-foreground">
          {t('intensityLabel')}
        </span>
        <ToggleGroup
          type="single"
          variant="segmented"
          value={intensity}
          aria-label={t('intensityLabel')}
          onValueChange={(next) => {
            if (next) setIntensity(next as VoiceMarkupIntensity)
          }}
        >
          {VOICE_MARKUP_INTENSITIES.map((item) => (
            <ToggleGroupItem
              key={item.id}
              value={item.id}
              data-tone-intensity={item.id}
            >
              {t(`intensities.${item.id}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* 自定义描述：S2 的标记**不限于固定集**，锁死下拉会把最强的能力关掉
          （调研 §7.2）。回车 = 直接插，原样进方括号。 */}
      <Input
        value={custom}
        data-tone-custom
        aria-label={t('customLabel')}
        placeholder={t('customPlaceholder')}
        onChange={(event) => setCustom(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
          event.preventDefault()
          const label = custom.trim()
          if (label) submit([{ label }])
        }}
        className="h-8.5 text-2sm"
      />

      <button
        type="button"
        data-tone-apply
        disabled={!emotion && !tone}
        onClick={apply}
        className={cn(
          'nodrag nopan h-8.5 rounded-lg bg-primary text-2sm text-primary-foreground',
          'transition-[background-color,transform] duration-spring-press ease-spring-press active:scale-95',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        {t('apply')}
      </button>
    </div>
  )
}
