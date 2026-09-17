'use client'

import { useEffect } from 'react'
import { Sparkles } from '@/components/icons'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import * as Toolbar from '@radix-ui/react-toolbar'

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog'
import { Spinner } from '@/components/ui/spinner'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { useStudioAssistantPanelInputs } from '@/hooks/use-studio-assistant-panel-inputs'
import { cn } from '@/lib/utils'
import {
  studioChipActiveClass,
  studioDialogBaseClass,
  StudioPanelHeader,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { StudioAssistantHeaderActions } from '@/components/business/assistant/StudioAssistantHeaderActions'
import { useStudioAssistantControls } from '@/hooks/use-studio-assistant-controls'

function PanelLoadingFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Spinner size="lg" className="text-muted-foreground" />
    </div>
  )
}

const PromptAssistantPanel = dynamic(
  () =>
    import('@/components/business/prompts/PromptAssistantPanel').then(
      (mod) => mod.PromptAssistantPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)

// ─── Chunk prefetch ────────────────────────────────────────────────
// Warms the panel's dynamic chunk on hover/focus intent so the first open
// shows the panel instantly instead of the loading fallback (the open
// transition itself is handled by StudioAssistantDock's width animation —
// this only removes the chunk-download stall inside it). Idempotent: the
// bundler caches the import promise, so repeat calls are free.
// 施工基准：docs/references/pages/assistant-shell.md.
let promptAssistantPanelPrefetched = false
function prefetchPromptAssistantPanel() {
  if (promptAssistantPanelPrefetched) return
  promptAssistantPanelPrefetched = true
  void import('@/components/business/prompts/PromptAssistantPanel')
}

interface StudioEnhanceButtonProps {
  disabled?: boolean
}

/**
 * StudioEnhanceButton — 工具条上那颗「助手」丸。开合永远挂在 `panels.enhance`
 * 上（`useStudioAssistantPanelInputs` 与操作员宿主读的是同一个槽），变的只有
 * **谁来渲染面板**：
 *
 *  - **图片 / 视频档（操作员档）**：这颗丸只是开关，桌面与手机都不在这里渲染
 *    面板 —— 桌面是 `StudioOperatorDock` 那颗右侧 `<aside>`，手机是同一颗 Dock
 *    里的全屏 Sheet（`StudioOperatorMobileSheet`）。
 *    ⭐ **旧的手机抽屉宿主已删**（本片）：它装的是旧 `PromptAssistantPanel`，
 *    与桌面早就不是同一个助手了 —— 留着就是「手机上点开的是另一套东西」。
 *    ⛔ 不留 fallback（工程原则 1）。
 *  - **音频档**：手机上仍是这里的 `ResponsiveDialog` 抽屉 + 旧面板。音频**没有**
 *    操作员（`StudioWorkspaceUI` 的白名单只放图片 / 视频，owner 2026-08-31
 *    「声音那边不用管」），删掉这一支等于音频手机上一个助手都没有 —— 那是功能
 *    回退，不是清理。收编排在第四期。
 *
 * 施工基准：docs/references/pages/assistant-shell.md
 */
export function StudioEnhanceButton({ disabled }: StudioEnhanceButtonProps) {
  const t = useTranslations('StudioV2')
  const isMobile = useIsMobile()
  const { state } = useStudioForm()
  const { promptEnhance } = useStudioData()
  const {
    open,
    setOpen,
    currentPrompt,
    modelId,
    assistantDomain,
    llmApiKeys,
    referenceImageData,
    injectedReference,
    workbenchState,
    writeback,
    loraConfirm,
  } = useStudioAssistantPanelInputs()
  const { route, researchMode } = useStudioAssistantControls()

  const isEnhancing = promptEnhance.isEnhancing

  /**
   * 这一档的助手是**操作员**（图片 / 视频）还是旧面板（音频）。
   *
   * ⚠ 白名单与 `StudioWorkspaceUI` 的 `isOperatorSurface` 逐字一致 —— 两边说的
   * 是同一件事「这条工作台有没有挂 `StudioOperatorDock`」。两份判据漂开的表现是
   * 「点助手没反应」（丸以为有 Dock，而 Dock 没挂）。
   * ⛔ 不写 `!== 'audio'`：将来多一个模态时，默认不给它助手比默认给它一个拧不动
   * 任何旋钮的助手安全（拍板 19）。
   */
  const isOperatorSurface =
    state.outputType === 'image' || state.outputType === 'video'
  /** 只有音频档的手机还需要这里的抽屉宿主。 */
  const usesLegacyDrawer = isMobile && !isOperatorSurface

  // Idle-time fallback prefetch — covers touch/keyboard entry that never
  // fires a hover/focus event before the first tap.
  // ⚠ 只在真的会用到旧面板时预取：操作员档一个字节都不该下这条 chunk。
  useEffect(() => {
    if (!usesLegacyDrawer) return
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void) => number
      cancelIdleCallback?: (handle: number) => void
    }
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(
        prefetchPromptAssistantPanel,
      )
      return () => idleWindow.cancelIdleCallback?.(handle)
    }
    const timeout = window.setTimeout(prefetchPromptAssistantPanel, 2000)
    return () => window.clearTimeout(timeout)
  }, [usesLegacyDrawer])

  const triggerButton = (
    <Toolbar.Button
      type="button"
      disabled={disabled || isEnhancing}
      aria-label={t('enhance')}
      aria-pressed={open}
      // 抽屉那一支由 `ResponsiveDialogTrigger` 接管点击，⛔ 别再挂一次。
      onClick={usesLegacyDrawer ? undefined : () => setOpen(!open)}
      onMouseEnter={usesLegacyDrawer ? prefetchPromptAssistantPanel : undefined}
      onFocus={usesLegacyDrawer ? prefetchPromptAssistantPanel : undefined}
      className={cn(studioToolTriggerClass, open && studioChipActiveClass)}
    >
      <Sparkles className={cn('size-4', isEnhancing && 'animate-pulse')} />
      <span className="hidden sm:inline">{t('enhance')}</span>
    </Toolbar.Button>
  )

  /**
   * 操作员档（桌面与手机都是）：这颗丸只切 `panels.enhance`，面板归
   * `StudioOperatorDock` 渲染 —— 桌面右侧 `<aside>`，手机全屏 Sheet。
   */
  if (!usesLegacyDrawer) {
    return triggerButton
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>{triggerButton}</ResponsiveDialogTrigger>
      <ResponsiveDialogContent
        className={cn(
          studioDialogBaseClass,
          'max-h-[min(86svh,720px)] w-full !max-w-none lg:w-[min(860px,calc(100vw-4rem))] lg:!max-w-[860px]',
        )}
        mobileBodyClassName="overflow-hidden px-3 pb-3 pt-1"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {/* 可见头部 — 与 StudioDockPanelArea 的 Dialog 型面板同规范（决议 5 契约） */}
        <StudioPanelHeader
          className="gap-1 sm:gap-2"
          icon={<Sparkles className="size-3.5 shrink-0 text-primary" />}
        >
          <span className="mr-auto shrink-0 whitespace-nowrap">
            {t('enhance')}
          </span>
          <StudioAssistantHeaderActions
            mobile
            assistantDomain={assistantDomain}
            onClose={() => setOpen(false)}
          />
        </StudioPanelHeader>
        <ResponsiveDialogDescription className="sr-only">
          {t('enhance')}
        </ResponsiveDialogDescription>
        <div className="flex h-[min(70svh,640px)] min-h-[360px] flex-col overflow-hidden px-1 pb-1 pt-2 sm:h-[min(680px,75vh)] sm:px-5 sm:pb-5 sm:pt-3">
          {/* ⚠ `injectedReference`（§3.0b 第 4 条「问助手」的落点）是**可选** prop：
              桌面 dock 传了、这个移动端宿主原来没传，编译器与全量单测都不会提醒，
              表现是「移动端点了问助手什么都没发生」。
              回归断言在 StudioEnhanceButton.test.tsx。 */}
          <PromptAssistantPanel
            currentPrompt={currentPrompt}
            modelId={modelId}
            assistantDomain={assistantDomain}
            referenceImageData={referenceImageData}
            llmApiKeys={llmApiKeys}
            workbenchState={workbenchState}
            writeback={writeback}
            injectedReference={injectedReference}
            onClose={() => setOpen(false)}
            assistantRoute={route}
            researchMode={researchMode}
            loraConfirm={loraConfirm}
          />
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
