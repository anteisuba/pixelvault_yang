'use client'

import { useCallback, useMemo, type ComponentType } from 'react'
import {
  Check,
  Globe,
  GlobeLock,
  MessageSquarePlus,
  PanelRightClose,
  Share2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { CanvasAssistantHistory } from '@/components/business/node/CanvasAssistantHistory'
import { CanvasAssistantRouteSelector } from '@/components/business/node/CanvasAssistantRouteSelector'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePromptAssistant } from '@/hooks/kernel/use-prompt-assistant'
import { useStudioAssistantControls } from '@/hooks/use-studio-assistant-controls'
import { createAssistantConversationShareAPI } from '@/lib/api-client/assistant-conversation'
import type { NodeAssistantHistorySession } from '@/lib/node-assistant-history'
import type { AssistantProtocolDomain } from '@/constants/assistant-protocol'
import {
  RESEARCH_MODES,
  RESEARCH_MODE_VALUES,
  type ResearchMode,
} from '@/constants/research'
import { ASSISTANT_SURFACE_BY_DOMAIN } from '@/types/assistant-conversation'
import { cn } from '@/lib/utils'

/**
 * 联网检索三态（AI 导演内核 · 切片 1）。
 *
 * ⚠ **旧的布尔开关没有「关」** —— 服务端把 `research:false` 映射成 `auto`
 * （那个布尔表达的是「没主动开」），于是用户拨到关闭位以后助手照样会联网。
 * 三态是唯一能把 `off` 送到服务端的形状。
 *
 * 位置沿用旧开关（共享头部那一排），形态从「按一下切换」改成下拉三选一 ——
 * 三态用 aria-pressed 的双态按钮表达不了，而这一排每个控件只有 32px 宽，
 * 塞不下一个三段 toggle。下拉与旁边的「回复语言 / 路由」两个控件同构。
 */
const RESEARCH_MODE_ICONS: Record<
  ResearchMode,
  ComponentType<{ className?: string }>
> = {
  [RESEARCH_MODES.auto]: Globe,
  [RESEARCH_MODES.forced]: Globe,
  [RESEARCH_MODES.off]: GlobeLock,
}

const RESEARCH_MODE_LABEL_KEYS: Record<ResearchMode, string> = {
  [RESEARCH_MODES.auto]: 'research.modeAuto',
  [RESEARCH_MODES.forced]: 'research.modeForced',
  [RESEARCH_MODES.off]: 'research.modeOff',
}

const RESEARCH_MODE_HINT_KEYS: Record<ResearchMode, string> = {
  [RESEARCH_MODES.auto]: 'research.modeAutoHint',
  [RESEARCH_MODES.forced]: 'research.modeForcedHint',
  [RESEARCH_MODES.off]: 'research.modeOffHint',
}

interface StudioAssistantHeaderActionsProps {
  onClose(): void
  mobile?: boolean
  /**
   * A1：新对话 / 历史 / 分享读的必须是**面板正在用的那个槽**。宿主同时决定
   * 面板的 domain 和这里的 domain —— 传成两个不同的值，用户会看到「历史列表
   * 里全是别的域的对话」。
   */
  assistantDomain: AssistantProtocolDomain
}

export function StudioAssistantHeaderActions({
  onClose,
  mobile = false,
  assistantDomain,
}: StudioAssistantHeaderActionsProps) {
  const tHistory = useTranslations('StudioNode.history')
  const tPrompt = useTranslations('PromptAssistant')
  const { route, setRoute, researchMode, setResearchMode } =
    useStudioAssistantControls()
  const { sessionId, sessions, clear, selectSession } = usePromptAssistant(
    ASSISTANT_SURFACE_BY_DOMAIN[assistantDomain],
  )

  const historySessions = useMemo<NodeAssistantHistorySession[]>(
    () =>
      sessions.map((session) => ({
        id: session.id,
        title: session.title?.trim() || tHistory('new'),
        updatedAt: session.updatedAt,
        messages: [],
      })),
    [sessions, tHistory],
  )

  const handleShare = useCallback(async () => {
    if (!sessionId) {
      toast.error(tHistory('shareFailed'))
      return
    }
    const result = await createAssistantConversationShareAPI(sessionId)
    if (!result.success) {
      toast.error(tHistory('shareFailed'))
      return
    }
    try {
      const locale = window.location.pathname.split('/')[1] || 'en'
      await navigator.clipboard.writeText(
        `${window.location.origin}/${locale}/assistant/share/${result.data.token}`,
      )
      toast.success(tHistory('shareCopied'))
    } catch {
      toast.error(tHistory('shareFailed'))
    }
  }, [sessionId, tHistory])

  const CloseIcon = mobile ? X : PanelRightClose
  const ResearchIcon = RESEARCH_MODE_ICONS[researchMode]

  return (
    <>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={tHistory('new')}
        title={tHistory('new')}
        onClick={clear}
        className="rounded-xl text-muted-foreground hover:text-foreground"
      >
        <MessageSquarePlus className="size-4" />
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={tPrompt('research.label')}
            title={`${tPrompt('research.label')} · ${tPrompt(
              RESEARCH_MODE_LABEL_KEYS[researchMode],
            )}`}
            className={cn(
              'rounded-xl text-muted-foreground hover:text-foreground',
              // 只有 `forced` 上高亮：它是「这一轮一定联网」的主动状态。
              // `auto` 是默认，`off` 靠换成带锁的图标区分 —— 三个都染色等于
              // 没有默认态。
              researchMode === RESEARCH_MODES.forced &&
                'bg-primary/10 text-primary',
            )}
          >
            <ResearchIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-64">
          {RESEARCH_MODE_VALUES.map((mode) => (
            <DropdownMenuItem
              key={mode}
              onSelect={() => setResearchMode(mode)}
              className="items-start gap-3"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-sm">
                  {tPrompt(RESEARCH_MODE_LABEL_KEYS[mode])}
                </span>
                <span className="text-2xs text-muted-foreground">
                  {tPrompt(RESEARCH_MODE_HINT_KEYS[mode])}
                </span>
              </span>
              {researchMode === mode ? (
                <Check className="ml-auto size-4 shrink-0 text-primary" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <CanvasAssistantRouteSelector
        value={route}
        onChange={setRoute}
        // studio 没有 gateway 分支：不选 key 时服务端按 LLM_TEXT_ADAPTERS 优先级
        // 挑用户已绑的第一把（Gemini 打头），客户端预判不了是哪个。**所以只说
        // 「自动」，不报任何具体型号** —— 报错型号正是 2026-08-19 生产事故的成因。
        emptyRouteLabel={tPrompt('routeAuto')}
      />
      <CanvasAssistantHistory
        sessions={historySessions}
        activeSessionId={sessionId}
        onSelect={(id) => void selectSession(id)}
      />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={tHistory('share')}
        title={tHistory('share')}
        onClick={() => void handleShare()}
        className="rounded-xl text-muted-foreground hover:text-foreground"
      >
        <Share2 className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={tPrompt('dockCollapse')}
        onClick={onClose}
        className="rounded-xl text-muted-foreground hover:text-foreground"
      >
        <CloseIcon className="size-4" />
      </Button>
    </>
  )
}
