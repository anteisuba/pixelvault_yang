'use client'

import { useCallback, useMemo } from 'react'
import {
  Globe,
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
import { usePromptAssistant } from '@/hooks/kernel/use-prompt-assistant'
import { useStudioAssistantControls } from '@/hooks/use-studio-assistant-controls'
import { createAssistantConversationShareAPI } from '@/lib/api-client/assistant-conversation'
import type { NodeAssistantHistorySession } from '@/lib/node-assistant-history'
import { cn } from '@/lib/utils'

interface StudioAssistantHeaderActionsProps {
  onClose(): void
  mobile?: boolean
}

export function StudioAssistantHeaderActions({
  onClose,
  mobile = false,
}: StudioAssistantHeaderActionsProps) {
  const tConversation = useTranslations('StudioNode.conversation')
  const tHistory = useTranslations('StudioNode.history')
  const tPrompt = useTranslations('PromptAssistant')
  const { route, setRoute, researchEnabled, setResearchEnabled } =
    useStudioAssistantControls()
  const { sessionId, sessions, clear, selectSession } = usePromptAssistant()

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
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={tConversation('research')}
        aria-pressed={researchEnabled}
        title={tConversation('researchHint')}
        onClick={() => setResearchEnabled(!researchEnabled)}
        className={cn(
          'rounded-xl text-muted-foreground hover:text-foreground',
          researchEnabled && 'bg-primary/10 text-primary',
        )}
      >
        <Globe className="size-4" />
      </Button>
      <CanvasAssistantRouteSelector value={route} onChange={setRoute} />
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
