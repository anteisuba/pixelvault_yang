'use client'

import { useCallback, useState } from 'react'
import { Bot, GripVertical, PanelRightClose, Share2, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { STUDIO_ASSISTANT_DOCK_RESIZE } from '@/constants/studio'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Spinner } from '@/components/ui/spinner'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  AssistantShell,
  AssistantShellHeader,
} from '@/components/business/assistant/AssistantShell'
import { useDockLayout } from '@/components/business/studio-shared/chrome/StudioAssistantDock'
import { createAssistantConversationShareAPI } from '@/lib/api-client/assistant-conversation'
import type {
  PromptAssistantLoraPersona,
  PromptAssistantPanelProps,
} from '@/components/business/prompts/PromptAssistantPanel'

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

interface LoraAssistantDockProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPrompt: string
  modelId?: string
  llmApiKeys: { id: string; label: string }[]
  referenceImageData?: string
  onUsePrompt: (text: string) => void
  onAppendPrompt: (text: string) => void
  persona: PromptAssistantLoraPersona
}

/**
 * LoraAssistantDock — /studio/lora?section=generate 专属助手宿主（F2，
 * docs/plans/lora-assistant-nl2tag-2026-07.md §1.2）。
 *
 * 复用 StudioAssistantDock 的两块真正跨页共享的 chrome（宽度记忆 store
 * `useDockLayout` + `AssistantShell`/`AssistantShellHeader` 头部规范），但
 * 不是那个组件本身的变体：
 *   - `/studio/lora` 故意不挂 `<StudioProvider>`（见 studio/lora/layout.tsx
 *     顶部注释），`useStudioAssistantPanelInputs` 依赖的 useStudioForm /
 *     useStudioData 在这里会直接抛错，没法复用。
 *   - 画布结果 / prompt-strip 缩略图的拖拽注入（STUDIO_REFERENCE_DRAG_TYPE /
 *     'studio-generation'）在本页没有对应的拖拽源，不搬这段逻辑。
 *   - `/studio/lora` 是 max-w-6xl 居中阅读宽版式（vs Studio 通栏画布工作
 *     区），不值得为一个面板重排整页布局；改用 `fixed` 贴视口右边同样能做到
 *     "分摊右侧宽度"的视觉效果，`GenerateBranch` 侧只需给主内容让出一段
 *     `marginRight`（同一份 `useDockLayout` 宽度）。
 *
 * 桌面独占（`isMobile` 时不渲染）——移动端抽屉留作后续切片，不在 F2 范围。
 */
export function LoraAssistantDock({
  open,
  onOpenChange,
  currentPrompt,
  modelId,
  llmApiKeys,
  referenceImageData,
  onUsePrompt,
  onAppendPrompt,
  persona,
}: LoraAssistantDockProps) {
  const t = useTranslations('PromptAssistant')
  const tHistory = useTranslations('StudioNode.history')
  const isMobile = useIsMobile()
  const { layout, isResizing, resetWidth, widthHandlers } = useDockLayout()
  const [assistantSessionId, setAssistantSessionId] = useState<string | null>(
    null,
  )
  const [hasOpenedOnce, setHasOpenedOnce] = useState(open)
  if (open && !hasOpenedOnce) {
    setHasOpenedOnce(true)
  }

  const handleShareAssistant = useCallback(async () => {
    if (!assistantSessionId) {
      toast.error(tHistory('shareFailed'))
      return
    }
    const result = await createAssistantConversationShareAPI(assistantSessionId)
    if (!result.success) {
      toast.error(tHistory('shareFailed'))
      return
    }
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/${window.location.pathname.split('/')[1] || 'en'}/assistant/share/${result.data.token}`,
      )
      toast.success(tHistory('shareCopied'))
    } catch {
      toast.error(tHistory('shareFailed'))
    }
  }, [assistantSessionId, tHistory])

  const panelProps: PromptAssistantPanelProps = {
    currentPrompt,
    modelId,
    referenceImageData,
    llmApiKeys,
    onUsePrompt,
    onAppendPrompt,
    onSessionIdChange: setAssistantSessionId,
    loraPersona: persona,
  }

  // 移动端（< 1024，owner 2026-07-20 拍板「近全屏」）：助手改近全屏底部 sheet
  // （vaul Drawer，iOS 风）——桌面停靠不适用。Drawer 自带抓手 / 圆角顶 / 遮罩 /
  // 软键盘避让（--keyboard-inset）/ 下滑关闭；触控开场不自动聚焦（不弹键盘）。
  // top-14 留顶部缺口 = 近全屏；mt-0 覆盖 drawer 默认 mt-24。
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="top-14 mt-0">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 pb-3 pt-1">
            <Bot className="size-4 shrink-0 text-primary" aria-hidden />
            <DrawerTitle className="flex-1 text-sm font-medium">
              {t('dockTitle')}
            </DrawerTitle>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={tHistory('share')}
              title={tHistory('share')}
              onClick={() => void handleShareAssistant()}
              className="rounded-xl text-muted-foreground hover:text-foreground"
            >
              <Share2 className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={t('dockCollapse')}
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
            {hasOpenedOnce && <PromptAssistantPanel {...panelProps} />}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <AssistantShell
      role="complementary"
      aria-label={t('dockLabel')}
      aria-hidden={!open}
      inert={!open}
      data-resizing={isResizing ? 'true' : undefined}
      style={{ width: open ? `${layout.widthPx}px` : '0px' }}
      className={cn(
        'node-canvas-panel-motion fixed inset-y-0 right-0 z-40 hidden overflow-hidden bg-background lg:flex lg:h-svh lg:flex-col',
        open && 'border-l border-border/60',
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('dockResizeLabel')}
        aria-valuemin={STUDIO_ASSISTANT_DOCK_RESIZE.minWidthPx}
        aria-valuemax={STUDIO_ASSISTANT_DOCK_RESIZE.maxWidthPx}
        aria-valuenow={layout.widthPx}
        tabIndex={0}
        {...widthHandlers}
        onDoubleClick={resetWidth}
        title={t('dockResizeLabel')}
        className="group absolute inset-y-0 left-0 z-10 flex w-2.5 cursor-col-resize items-center justify-center focus:outline-none"
      >
        <span className="flex h-14 w-1.5 items-center justify-center rounded-full bg-border/80 text-muted-foreground transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary/60">
          <GripVertical className="size-3" />
        </span>
      </div>

      <AssistantShellHeader
        title={t('dockTitle')}
        leading={<Bot className="size-4 shrink-0 text-primary" />}
        actions={
          <>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={tHistory('share')}
              title={tHistory('share')}
              onClick={() => void handleShareAssistant()}
              className="rounded-xl text-muted-foreground hover:text-foreground"
            >
              <Share2 className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={t('dockCollapse')}
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-muted-foreground hover:text-foreground"
            >
              <PanelRightClose className="size-4" />
            </Button>
          </>
        }
      />

      <div
        className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 transition-opacity duration-slow ease-standard"
        style={{ minWidth: layout.widthPx, opacity: open ? 1 : 0 }}
      >
        {hasOpenedOnce && <PromptAssistantPanel {...panelProps} />}
      </div>
    </AssistantShell>
  )
}
