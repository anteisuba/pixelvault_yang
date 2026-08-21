'use client'

import { useEffect, useState } from 'react'
import { Bot, GripVertical } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'

import { STUDIO_ASSISTANT_DOCK_RESIZE } from '@/constants/studio'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Spinner } from '@/components/ui/spinner'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  AssistantShell,
  AssistantShellHeader,
} from '@/components/business/assistant/AssistantShell'
import { useDockLayout } from '@/components/business/studio-shared/chrome/StudioAssistantDock'
import { StudioAssistantHeaderActions } from '@/components/business/assistant/StudioAssistantHeaderActions'
import { useOptionalActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useLoraCandidateConfirm } from '@/hooks/use-lora-candidate-confirm'
import { useStudioAssistantControls } from '@/hooks/use-studio-assistant-controls'
import { useStudioAssistantReference } from '@/hooks/use-studio-assistant-reference'
import type {
  PromptAssistantLoraPersona,
  PromptAssistantPanelProps,
} from '@/components/business/prompts/PromptAssistantPanel'
import type { AssistantWorkbenchState } from '@/types'

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
  persona: PromptAssistantLoraPersona
  /**
   * §3.0b：当前工作台状态，纯透传给面板。
   *
   * dock 自己不构造它——本页故意不挂 `<StudioProvider>`（见下方组件注释），
   * 装配台的底模 / 挂载 / 比例 / 参考图全是 `GenerateBranch` 的局部 state，
   * 只有那里读得到。可选是因为宿主换掉时不该连编译都过不去。
   */
  workbenchState?: AssistantWorkbenchState
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
  persona,
  workbenchState,
}: LoraAssistantDockProps) {
  const t = useTranslations('PromptAssistant')
  const isMobile = useIsMobile()
  const { layout, isResizing, resetWidth, widthHandlers } = useDockLayout()
  const { route, researchMode } = useStudioAssistantControls()
  // §3.0b 第 4 条：结果图「问助手」注入的附件。读的是模块级 store —— 发起方
  // （结果列那颗按钮，长在 GenerateBranch 深处）和消费方（面板，挂在这里）中间
  // 隔着整棵装配台树，逐层透传一个可选回调正是「漏传 = 三绿而功能全失效」的
  // 高发形态。写口在 `LoraWorkbench` 的 handleAskAssistantAboutResult。
  const { injectedReference, clearReference } = useStudioAssistantReference()
  /**
   * LoRA 一次确认链（任务包 §5）。**这个宿主是四档里唯一三件事都做得了的**：
   * `LoraStackProvider` 只包 `/studio/lora`（见 studio/lora/layout.tsx），
   * 挂载栈在这里拿得到，图片/视频工作台拿不到。
   *
   * 触发词走 `persona.onAppendPrompt` —— 装配台既有的那条追加路径（会去重、
   * 规范逗号），⛔ 不新造第二条写提示词的路。
   */
  // ⚠ 用**不抛**的那个：挂载栈对这张卡是可选能力，缺 Provider 应当少一个按钮，
  //   而不是整个 dock 崩掉（会抛的那版把本文件的测试全打红过）。
  const stack = useOptionalActiveLoraStack()
  const loraConfirm = useLoraCandidateConfirm({
    ...(stack ? { mount: stack.push } : {}),
    applyTriggerWords: persona.onAppendPrompt,
  })
  const [hasOpenedOnce, setHasOpenedOnce] = useState(open)
  if (open && !hasOpenedOnce) {
    setHasOpenedOnce(true)
  }

  /**
   * 一次注入只属于一次打开：助手关掉就把待注入的图丢掉。
   *
   * ⚠ 必要性在**移动端**才露出来 —— 那个宿主是 Drawer，关掉会把面板整个卸载，
   * 重开时面板内部的 `lastInjectedToken` 归零，留在 store 里的旧引用会被当成
   * 一次新注入**再挂一次**：用户没点，附件却在那儿，一不留神发出去就是白烧
   * 一次 vision。桌面停靠的面板常驻不卸载，只验桌面看不到这个病。
   *
   * ⚠ 顺序安全：「问助手」是在同一个事件里先 `injectReference` 再把 dock 打开，
   * React 合批后这个 effect 只会看到 `open === true`，不会把刚注入的清掉。
   *
   * ⚠ store 是**跨页共享**的一份（studio 图片工作台用的是同一个）。挂载时这条
   * 就会以 `open === false` 跑一次，顺带把从别的页带过来的陈旧引用清掉 —— 那
   * 是想要的行为，不是副作用。
   */
  useEffect(() => {
    if (!open) clearReference()
  }, [clearReference, open])

  const panelProps: PromptAssistantPanelProps = {
    currentPrompt,
    assistantDomain: 'lora',
    modelId,
    referenceImageData,
    injectedReference,
    llmApiKeys,
    /**
     * LoRA 装配台是四档宿主里最贫瘠的那一档（切片 S1）：只有提示词与负面，
     * **规格 / 模型 / 张数三项结构性不存在**——装配台的底模、比例、张数都是
     * `GenerateBranch` 的局部 state，不走 studio reducer，没有可写回的落点。
     * 这里如实只给三项，而不是传一堆点了没反应的回调。
     *
     * ⚠ 没有 `undo`：本页没有快照机制。按切片 S3 的契约，没快照就不给撤销
     * ——那是诚实，不是缺陷（拿一个不属于这次会话的旧值回滚才真的危险）。
     */
    writeback: {
      prompt: {
        current: currentPrompt || undefined,
        apply: onUsePrompt,
        isApplied: (value) => currentPrompt === value,
      },
      appendPrompt: persona.onAppendPrompt,
      negative: {
        apply: persona.onUseNegativePrompt,
        // 装配台的负面框是局部 state，dock 读不到它的当前值——所以只能给
        // 「能写」，给不了「已应用」。宁可永远显示「应用」，也不谎报已应用。
        isApplied: () => false,
      },
    },
    loraPersona: persona,
    assistantRoute: route,
    researchMode,
    workbenchState,
    loraConfirm,
  }

  // CD 助手 dock：正文上方一行「助手看得见什么」上下文 chips——挂载 ×N /
  // 触发词 ×N / 底模。全部取 persona 里真实喂给模型的上下文，不额外编造。
  const mountCount = persona.mounts?.length ?? 0
  const triggerCount =
    persona.mounts?.reduce(
      (sum, mount) => sum + (mount.triggerWords?.length ?? 0),
      0,
    ) ?? 0
  const contextChips = (
    <div className="flex flex-wrap gap-1.5 pb-2">
      {mountCount > 0 ? (
        <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-2xs text-muted-foreground">
          {t('contextMounts', { count: mountCount })}
        </span>
      ) : null}
      {triggerCount > 0 ? (
        <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-2xs text-muted-foreground">
          {t('contextTriggers', { count: triggerCount })}
        </span>
      ) : null}
      {persona.baseFamily ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-2xs text-muted-foreground">
          {t('contextBase')}
          <span className="font-mono text-foreground">
            {persona.baseFamily}
          </span>
        </span>
      ) : null}
    </div>
  )

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
            <StudioAssistantHeaderActions
              mobile
              assistantDomain={panelProps.assistantDomain ?? 'lora'}
              onClose={() => onOpenChange(false)}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
            {contextChips}
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
        // CD 装配台：助手是一张与三栏面板对齐的浮起圆角卡（上下右留页面留白·
        // 四边圆角+浮起投影），不是贴视口边的通高板。top-20 = py-5(20) + 模块
        // tab h-11(44) + gap-4(16)；右侧留白跟随页面 px-4/6/8。
        'node-canvas-panel-motion fixed bottom-4 right-4 top-4 z-40 hidden overflow-hidden rounded-xl bg-card lg:flex lg:flex-col',
        open && 'border border-border shadow-[var(--lora-shadow-modal)]',
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
          <StudioAssistantHeaderActions
            assistantDomain={panelProps.assistantDomain ?? 'lora'}
            onClose={() => onOpenChange(false)}
          />
        }
      />

      <div
        className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 transition-opacity duration-slow ease-standard"
        style={{ minWidth: layout.widthPx, opacity: open ? 1 : 0 }}
      >
        {contextChips}
        {hasOpenedOnce && <PromptAssistantPanel {...panelProps} />}
      </div>
    </AssistantShell>
  )
}
