'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  STUDIO_MOBILE_DRAWER_CLASS,
  STUDIO_MOBILE_MODEL_ROWS_CLASS,
} from '@/constants/studio-mobile'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

interface StudioMobileModelSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * 模态。`image` = 多选名单（对比生成）；`video` = **单选**（`generate()` 的
   * 视频那支恒 `mode:'single'`，给它一份多选名单会画出一个发不出去的矩阵）。
   */
  mode: 'image' | 'video'
  /** 这一轮要跑的模型名单（主模型 + 额外模型），与桌面参数栏同一份。图片档用。 */
  runModels: readonly StudioModelOption[]
  runModelIds: ReadonlySet<string>
  /** 加/减一条（`TOGGLE_EXTRA_MODEL`，首条落在主模型上）。图片档用。 */
  onToggle: (option: StudioModelOption) => void
  /** 从名单里删一条（含主模型：下一条会顶上来）。图片档用。 */
  onRemove: (optionId: string) => void
  /** 视频档：当前选中的那一条 optionId。 */
  selectedOptionId?: string | null
  /**
   * 视频档：换型号。⚠ 必须是 `handleSelectSingleModel` —— 它除了
   * `SET_OPTION_ID` 还把规格夹到新型号真支持的档位，否则「只换了个模型」就 400。
   */
  onSelectSingle?: (option: StudioModelOption) => void
  /** 视频档：按当前「用途」收窄端点（`filterVideoModelByMode`）。 */
  filterOption?: (option: StudioModelOption) => boolean
}

/**
 * StudioMobileModelSheet —— 移动端「模型 ▾」chip 打开的全屏抽屉（≈92svh）。
 *
 * ⭐ **图片档不是单选**（视频档是 —— 见 `mode` prop）。图片档本来就支持多模型 × 每模型 N 张（结果走 `CompareGrid`
 * 的图墙），桌面参数栏是一列可删的模型行 + 一个「添加」入口。这里是同一件事的
 * 移动端形态：**上面是当前名单**（每行一个 ✕，走桌面同款 reducer 动作），
 * **下面是钻取选择器**（`MainModelPicker layout="drill" inline`，多选）。
 * 折成单选就等于在手机上把对比生成整条路径删掉。
 *
 * 选中不自动关抽屉（需求卡交互表：抽屉保留在型号列表），由 footer 的
 * 「完成 · N 个模型」关闭。
 *
 * ⚠ 缺 key 的行走 `onRequestSetup` → `QuickSetupDialog`（Hard Rule 8：缺 key 不
 * 禁用 UI，走内联配置）。对话框挂在抽屉**外面**，否则关抽屉会把它一起卸载。
 */
export function StudioMobileModelSheet({
  open,
  onOpenChange,
  mode,
  runModels,
  runModelIds,
  onToggle,
  onRemove,
  selectedOptionId = null,
  onSelectSingle,
  filterOption,
}: StudioMobileModelSheetProps) {
  const isVideo = mode === 'video'
  const t = useTranslations('StudioMobile')
  const tV2 = useTranslations('StudioV2')
  const tForm = useTranslations('StudioForm')
  const tModels = useTranslations('Models')
  const [quickSetup, setQuickSetup] = useState<{
    open: boolean
    modelId: string
    modelLabel: string
    adapterType: AI_ADAPTER_TYPES
    optionId: string
  }>({
    open: false,
    modelId: '',
    modelLabel: '',
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    optionId: '',
  })

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn(STUDIO_MOBILE_DRAWER_CLASS, 'gap-0 p-0')}>
          <DrawerHeader className="px-4 pb-2 pt-3 text-left">
            <DrawerTitle className="text-sm font-medium">
              {t('modelSheetTitle')}
            </DrawerTitle>
          </DrawerHeader>

          {/* 当前名单 —— 每行可删，包括最后一条（删空了就回到空态，那本来就是
              一个合法状态）。留一条删不掉的行反而让「怎么换掉它」没有出口。 */}
          {!isVideo && runModels.length > 0 ? (
            <div
              data-testid="studio-mobile-model-selection"
              className="flex shrink-0 flex-col gap-1.5 border-b border-border/60 px-4 pb-3"
            >
              {runModels.map((option) => (
                <div
                  key={option.optionId}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-border/60 bg-background pl-3 pr-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {option.displayLabel ??
                      getTranslatedModelLabel(tModels, option.modelId)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(option.optionId)}
                    aria-label={tV2('modelRemove')}
                    className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard active:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div
            className={cn(
              STUDIO_MOBILE_MODEL_ROWS_CLASS,
              'min-h-0 flex-1 overflow-y-auto px-1',
            )}
          >
            <MainModelPicker
              modality={isVideo ? 'video' : 'image'}
              layout="drill"
              inline
              // 图片档恒为 null：这里是纯粹的「添加」入口，选中状态由上面的名单
              // 承担（面板里的勾选走 `selectedOptionIds`）。传选中值会让同一条
              // 信息在一屏上出现两遍。
              // 视频档相反：没有名单那一块，选中态**只能**长在面板里。
              value={isVideo ? selectedOptionId : null}
              onChange={
                isVideo
                  ? (option) => {
                      onSelectSingle?.(option)
                      // 单选选完就该关 —— 抽屉留着等一个不会再发生的第二次选择，
                      // 只会让人以为还能多选。
                      onOpenChange(false)
                    }
                  : onToggle
              }
              filterOption={filterOption}
              selectedOptionIds={isVideo ? undefined : runModelIds}
              onToggleOption={isVideo ? undefined : onToggle}
              onRequestSetup={(option) =>
                setQuickSetup({
                  open: true,
                  modelId: option.modelId,
                  modelLabel: getTranslatedModelLabel(tModels, option.modelId),
                  adapterType: option.adapterType,
                  optionId: option.optionId,
                })
              }
              searchPlaceholder={tForm('modelSelector.searchPlaceholder')}
              emptySearchText={tForm('modelSelector.emptySearch')}
            />
          </div>

          <DrawerFooter className="border-t border-border/60 p-3">
            <button
              type="button"
              data-testid="studio-mobile-model-done"
              onClick={() => onOpenChange(false)}
              disabled={!isVideo && runModels.length === 0}
              className={cn(
                'flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground',
                'transition-[background-color,transform] duration-fast ease-standard active:scale-[0.98]',
                'disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground',
              )}
            >
              {isVideo
                ? t('sheetDone')
                : runModels.length === 0
                  ? t('modelChipEmpty')
                  : t('modelSheetDone', { count: runModels.length })}
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <QuickSetupDialog
        open={quickSetup.open}
        onOpenChange={(v) => setQuickSetup((prev) => ({ ...prev, open: v }))}
        modelId={quickSetup.modelId}
        modelLabel={quickSetup.modelLabel}
        adapterType={quickSetup.adapterType}
        optionId={quickSetup.optionId}
      />
    </>
  )
}
