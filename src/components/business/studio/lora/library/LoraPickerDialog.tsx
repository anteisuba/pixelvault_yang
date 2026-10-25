'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  LORA_LIBRARY_FAMILY_PARAM,
  type LoraLibraryFamily,
} from '@/constants/lora'
import type { LoraBaseFamily } from '@/constants/lora-base-models'
import { LibraryQueryScope } from '@/hooks/use-library-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  LIBRARY_PICKER_DIALOG_CLASS,
  LibraryPickBar,
  LibraryPickerHeader,
} from '@/components/ui/library-picker'

import { CharacterLorasProvider } from '../character-loras-context'
import {
  LoraStageProvider,
  type LoraStageContextValue,
} from '../lora-stage-context'
import {
  LoraLibrarySectionRail,
  useLoraLibrarySections,
  type LoraLibraryView,
} from './LoraLibraryOverlayView'
import {
  LoraPickSelectionProvider,
  type LoraPickEntry,
  type LoraPickSelection,
} from './lora-pick-selection'

/** 台上的底模 → 库的底模筛选（SDXL 的 Anima Pencil 归 SDXL；DiT 的 Anima 才是库里的 Anima）。 */
const LIBRARY_FAMILY_FOR_BASE: Record<LoraBaseFamily, LoraLibraryFamily> = {
  flux: 'flux',
  sdxl: 'sdxl',
  illustrious: 'illustrious',
  pony: 'pony',
  sd15: 'sd15',
  anima: 'sdxl',
  'anima-dit': 'anima',
  'z-image': 'z-image',
  krea2: 'krea2',
}

interface LoraPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 台上现在的底模：标题旁写「和 X 装得上」，库先按它的家族筛。 */
  stage: LoraStageContextValue
}

/**
 * 挑 LoRA（ui-spec ㉔，样件 E S24）：LoRA 台「＋ 添加 LoRA」弹正中的框，里面是库那副骨架
 *（左栏全部 · 收藏 · 自训 · 角色），格子圈中了浮出黑条「已选 2 · 取消 · 挂上 2 个」。
 * 筛选记在框自己手上（⛔ 写进台的网址），关框就忘。手机不走这里（还是卡里那两格）。
 */
export function LoraPickerDialog({
  open,
  onOpenChange,
  stage,
}: LoraPickerDialogProps) {
  const t = useTranslations('LoraWorkbench.picker')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={LIBRARY_PICKER_DIALOG_CLASS}
      >
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('description')}
        </DialogDescription>
        {/* 每次打开从头来：圈的、筛的都不留。 */}
        {open ? (
          <LoraPickerBody stage={stage} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function LoraPickerBody({
  stage,
  onClose,
}: {
  stage: LoraStageContextValue
  onClose: () => void
}) {
  const t = useTranslations('LoraWorkbench.picker')
  const tCommon = useTranslations('Common')
  const [view, setView] = useState<LoraLibraryView>('library')
  const [selected, setSelected] = useState<readonly LoraPickEntry[]>([])
  const [confirming, setConfirming] = useState(false)
  const { content, characterLoras, counts } = useLoraLibrarySections(
    view,
    setView,
  )

  const family = stage.base ? LIBRARY_FAMILY_FOR_BASE[stage.base.family] : null
  const initialQuery = family
    ? `${LORA_LIBRARY_FAMILY_PARAM}=${family}`
    : undefined

  const selection = useMemo<LoraPickSelection>(
    () => ({
      isSelected: (id) => selected.some((entry) => entry.id === id),
      toggle: (entry) =>
        setSelected((current) =>
          current.some((item) => item.id === entry.id)
            ? current.filter((item) => item.id !== entry.id)
            : [...current, entry],
        ),
      familyLocked: family !== null,
    }),
    [family, selected],
  )

  // 一把一把挂（各自过下载闸），全挂完再关框。
  const confirm = useCallback(async () => {
    if (confirming) return
    setConfirming(true)
    try {
      for (const entry of selected) await entry.mount()
    } finally {
      setConfirming(false)
    }
    onClose()
  }, [confirming, onClose, selected])

  return (
    <LibraryQueryScope initial={initialQuery}>
      <CharacterLorasProvider value={characterLoras}>
        <LoraStageProvider value={stage}>
          <LoraPickSelectionProvider value={selection}>
            <LibraryPickerHeader
              title={t('title')}
              lock={
                stage.baseLabel ? t('lock', { base: stage.baseLabel }) : null
              }
              closeLabel={tCommon('close')}
              onClose={onClose}
            />
            <div className="domain-lora relative flex min-h-0 flex-1 gap-6 pt-4 pr-5 pl-3">
              <LoraLibrarySectionRail
                view={view}
                onViewChange={setView}
                counts={counts}
              />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {content}
              </div>
              <LibraryPickBar
                count={selected.length}
                countLabel={t('count', { count: selected.length })}
                cancelLabel={tCommon('cancel')}
                confirmLabel={t('confirm', { count: selected.length })}
                onCancel={() => setSelected([])}
                onConfirm={() => void confirm()}
              />
            </div>
          </LoraPickSelectionProvider>
        </LoraStageProvider>
      </CharacterLorasProvider>
    </LibraryQueryScope>
  )
}
