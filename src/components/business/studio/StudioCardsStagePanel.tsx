'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'

import { StudioCardPicker } from '@/components/business/studio/StudioCardPicker'
import { Button } from '@/components/ui/button'

/**
 * 舞台上的「角色」面板（10-25 用户定，桌面图片台）：舞台出图那块换成角色挑选，头部只有
 * 标题与「返回结果」—— 与模板面板同一副头。挑图 / 造型 / 张数上限都在 `StudioCardPicker` 里，
 * 挑了当场生效，所以这里没有「完成」。手机仍在「＋」抽屉里挑。
 */
export function StudioCardsStagePanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('StudioV2')
  const tTemplates = useTranslations('StudioTemplates')
  // 换场是「结果先淡出一拍，面板再上来」—— 标题挂上那一刻才落焦点。
  const focusHeading = useCallback((node: HTMLHeadingElement | null) => {
    node?.focus({ preventScroll: true })
  }, [])
  return (
    <section
      data-testid="studio-cards-stage-panel"
      className="flex min-h-0 flex-1 flex-col gap-4"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        if (!event.currentTarget.contains(event.target as Node)) return
        event.stopPropagation()
        onClose()
      }}
    >
      <div className="flex h-9 shrink-0 items-center gap-2.5">
        {/* ⚠ `outline-none`：打开时焦点被程序挪到这里（给读屏一个落点）。 */}
        <h2
          ref={focusHeading}
          tabIndex={-1}
          className="mr-auto truncate text-md font-semibold outline-none"
        >
          {t('characters')}
        </h2>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          {tTemplates('back')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StudioCardPicker />
      </div>
    </section>
  )
}
