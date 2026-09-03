'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { STUDIO_MOBILE_DRAWER_CLASS } from '@/constants/studio-mobile'
import { useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import { StudioSpecFields } from '@/components/business/studio/StudioSpecFields'
import { StudioVideoSpecFields } from '@/components/business/studio/StudioVideoSpecFields'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Textarea } from '@/components/ui/textarea'

interface StudioMobileSpecSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * 模态决定装哪一组档位：`image` = 比例 · 清晰度 · 每模型几张；
   * `video` = 时长 · 分辨率 · 比例 · 原生出声。
   *
   * ⚠ 两组**不合成一组**：数据源完全不同（图片读能力表的 `resolutionOptions`
   * ＋ `IMAGE_BATCH_COUNTS`，视频读 `getVideoModelParameterOptions` 实算的档位）。
   * 共用的是这个 sheet 外壳与药丸样式，不是字段本身 —— 与桌面那两颗浮层同一条
   * 分界线。
   */
  mode: 'image' | 'video'
}

/**
 * StudioMobileSpecSheet —— 移动端「规格」chip 打开的底部 sheet。
 *
 * 内容 = `StudioSpecFields`（与桌面参数栏那颗浮层**同一份**取值域）+ 收纳进来的
 * 负面提示词字段。桌面把负面提示词放在高级参数面板里，移动端没有那颗入口，
 * 所以按需求卡表 5 收进规格 sheet。
 *
 * ⚠ 折叠只是**显示**折叠：值活在 `state.advancedParams.negativePrompt`，
 * 折起来不影响它是否随请求发出（判据只有「有没有内容」）。
 */
export function StudioMobileSpecSheet({
  open,
  onOpenChange,
  mode,
}: StudioMobileSpecSheetProps) {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioMobile')
  const negativePrompt = state.advancedParams.negativePrompt ?? ''
  const [expanded, setExpanded] = useState(negativePrompt.length > 0)

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn(STUDIO_MOBILE_DRAWER_CLASS, 'gap-0 p-0')}>
        <DrawerHeader className="px-4 pb-2 pt-3 text-left">
          <DrawerTitle className="text-sm font-medium">
            {t('specSheetTitle')}
          </DrawerTitle>
        </DrawerHeader>
        <div className="keyboard-aware-bottom-padding min-h-0 flex-1 overflow-y-auto px-4 pt-1">
          {mode === 'video' ? (
            <StudioVideoSpecFields touch />
          ) : (
            <StudioSpecFields touch />
          )}

          <div className="mt-4 flex flex-col gap-1.5">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((prev) => !prev)}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg text-left text-xs font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground"
            >
              {t('negativePromptLabel')}
              <ChevronDown
                className={cn(
                  'ml-auto size-4 shrink-0 transition-transform duration-base ease-standard',
                  expanded && 'rotate-180',
                )}
              />
            </button>
            {expanded ? (
              <Textarea
                value={negativePrompt}
                onChange={(event) =>
                  dispatch({
                    type: 'SET_ADVANCED_PARAMS',
                    payload: {
                      ...state.advancedParams,
                      negativePrompt: event.target.value,
                    },
                  })
                }
                placeholder={t('negativePromptPlaceholder')}
                aria-label={t('negativePromptLabel')}
                // ⚠ `Textarea` 原语本来就是 `text-base md:text-sm`；这里以前用
                //    `text-sm` 覆盖掉了它，于是移动端聚焦即放大整页（iOS <16px
                //    自动缩放）。改成与原语同一条曲线。
                className="min-h-20 text-base md:text-sm"
              />
            ) : null}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
