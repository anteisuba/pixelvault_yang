'use client'

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import type { LoraAssetRecord } from '@/types'
import { LoraBenchHandoffOff } from '@/contexts/studio-library-pick'
import { LoraStackCollector } from '@/hooks/use-active-lora-stack'
import { LibraryQueryScope } from '@/hooks/use-library-query'
import { LibraryRailPinnedContext } from '@/hooks/use-library-rail'
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

interface LoraPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 台上现在的底模（格子上「装不上」的判断用它）。 */
  stage: LoraStageContextValue
  /**
   * 不往台上挂、收给别人（她页「添加 LoRA」，第 ⑧ 步）：`mounted` 是她已有的（格子标已挂），
   * 圈好点「加给她 N 个」→ `onConfirm` 拿到圈的那几把；返回 false 框不关。
   */
  collect?: LoraPickCollect
}

export interface LoraPickCollect {
  mounted: readonly LoraAssetRecord[]
  onConfirm: (assets: LoraAssetRecord[]) => Promise<boolean>
}

/**
 * 挑 LoRA（ui-spec ㉔，样件 E S24）：LoRA 台「＋ 添加 LoRA」弹正中的框，里面是库那副骨架
 *（左栏全部 · 收藏 · 自训 · 角色），格子圈中了浮出黑条「已选 2 · 取消 · 挂上 2 个」。
 * 筛选记在框自己手上（⛔ 写进台的网址），关框就忘。手机不走这里（还是卡里那两格）。
 * 10-25 用户定：默认看全部，⛔ 按台上底模自动筛 / 锁；底模用筛选条上那颗「底模」自己挑。
 */
export function LoraPickerDialog({
  open,
  onOpenChange,
  stage,
  collect,
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
          <LoraPickerBody
            stage={stage}
            collect={collect}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function LoraPickerBody({
  stage,
  collect,
  onClose,
}: {
  stage: LoraStageContextValue
  collect?: LoraPickCollect
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

  const selection = useMemo<LoraPickSelection>(
    () => ({
      isSelected: (id) => selected.some((entry) => entry.id === id),
      toggle: (entry) =>
        setSelected((current) =>
          current.some((item) => item.id === entry.id)
            ? current.filter((item) => item.id !== entry.id)
            : [...current, entry],
        ),
    }),
    [selected],
  )

  /** 收给别人时：格子「挂上」那一下 push 进这里。 */
  const collected = useRef<LoraAssetRecord[]>([])
  const onPush = useCallback((asset: LoraAssetRecord) => {
    collected.current.push(asset)
  }, [])

  // 一把一把挂（各自过下载闸），全挂完再关框。
  const confirm = useCallback(async () => {
    if (confirming) return
    setConfirming(true)
    collected.current = []
    let done = true
    try {
      for (const entry of selected) await entry.mount()
      if (collect) done = await collect.onConfirm(collected.current)
    } finally {
      setConfirming(false)
    }
    if (done) onClose()
  }, [collect, confirming, onClose, selected])

  const withStack = (children: ReactNode) =>
    collect ? (
      <LoraStackCollector mounted={collect.mounted} onPush={onPush}>
        {children}
      </LoraStackCollector>
    ) : (
      children
    )

  return (
    <LoraBenchHandoffOff>
      {withStack(
        <LibraryQueryScope>
          <LibraryRailPinnedContext.Provider value>
            <CharacterLorasProvider value={characterLoras}>
              <LoraStageProvider value={stage}>
                <LoraPickSelectionProvider value={selection}>
                  <LibraryPickerHeader
                    title={t('title')}
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
                      confirmLabel={t(collect ? 'confirmCollect' : 'confirm', {
                        count: selected.length,
                      })}
                      onCancel={() => setSelected([])}
                      onConfirm={() => void confirm()}
                    />
                  </div>
                </LoraPickSelectionProvider>
              </LoraStageProvider>
            </CharacterLorasProvider>
          </LibraryRailPinnedContext.Provider>
        </LibraryQueryScope>,
      )}
    </LoraBenchHandoffOff>
  )
}
