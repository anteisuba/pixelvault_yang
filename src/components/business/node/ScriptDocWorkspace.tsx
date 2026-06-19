'use client'

import { useCallback, useMemo } from 'react'
import {
  AlertCircle,
  Film,
  Loader2,
  Mic,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import { Button } from '@/components/ui/button'
import { useNodeScriptDoc } from '@/hooks/use-node-script-doc'
import type { AssistantConversationMessage } from '@/hooks/use-assistant-conversation'
import type { AppLocale } from '@/i18n/routing'
import type { ScriptDoc } from '@/types/script-doc'

import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'

interface ScriptDocWorkspaceProps {
  scriptDoc: ScriptDoc | undefined
  messages: AssistantConversationMessage[]
  locale: AppLocale
  apiKeyId?: string
}

const TOAST_OPTIONS = {
  duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
  position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
} as const

/**
 * E1 expanded ⤢ right pane: the assistant's ScriptDoc made real.
 *
 * Read-only view of the fact model + two actions: "Draft / update outline"
 * (structured LLM step off the conversation → `setScriptDoc`) and "Generate
 * nodes" (idempotent projection → `applyScriptDocToGraph`). The assistant only
 * edits the ScriptDoc; this confirm step is the only thing that touches the
 * graph.
 */
export function ScriptDocWorkspace({
  scriptDoc,
  messages,
  locale,
  apiKeyId,
}: ScriptDocWorkspaceProps) {
  const t = useTranslations('StudioNode.dock')
  const { setScriptDoc, applyScriptDocToGraph } = useNodeWorkflowActions()
  const { draft, isDrafting, error } = useNodeScriptDoc()

  // Only non-empty turns are worth sending; the streaming placeholder carries
  // an empty content string until the first chunk lands.
  const apiMessages = useMemo(
    () =>
      messages
        .filter((message) => message.content.trim().length > 0)
        .map((message) => ({ role: message.role, content: message.content })),
    [messages],
  )

  const roleNameById = useMemo(
    () => new Map((scriptDoc?.roles ?? []).map((role) => [role.id, role.name])),
    [scriptDoc],
  )

  const handleDraft = useCallback(async () => {
    if (apiMessages.length === 0) {
      toast.info(t('scriptDocNeedChat'), TOAST_OPTIONS)
      return
    }
    const next = await draft({
      messages: apiMessages,
      scriptDoc,
      locale,
      apiKeyId,
    })
    if (next) {
      setScriptDoc(next)
    }
  }, [apiKeyId, apiMessages, draft, locale, scriptDoc, setScriptDoc, t])

  const handleApply = useCallback(() => {
    const result = applyScriptDocToGraph()
    if (result.refusal) {
      toast.info(t('scriptDocApplyEmpty'), TOAST_OPTIONS)
      return
    }
    if (result.created === 0) {
      toast.info(t('scriptDocApplyNothing'), TOAST_OPTIONS)
      return
    }
    toast.success(
      t('scriptDocApplyResult', { created: result.created }),
      TOAST_OPTIONS,
    )
  }, [applyScriptDocToGraph, t])

  const hasContent = Boolean(
    scriptDoc && (scriptDoc.roles.length > 0 || scriptDoc.shots.length > 0),
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-node-panel-inner px-4 py-3">
        <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
          {t('scriptDoc')}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {scriptDoc ? (
          <div className="space-y-4">
            <div>
              <p className="text-base font-semibold leading-6 text-node-foreground">
                {scriptDoc.title}
              </p>
              {scriptDoc.logline ? (
                <p className="mt-1 text-xs leading-5 text-node-muted">
                  {scriptDoc.logline}
                </p>
              ) : null}
              {scriptDoc.styleNote ? (
                <p className="mt-2 inline-flex rounded-full border border-node-panel-inner bg-node-panel-soft px-2.5 py-1 text-2xs text-node-subtle">
                  {scriptDoc.styleNote}
                </p>
              ) : null}
            </div>

            {scriptDoc.roles.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                  <Users className="size-3.5" />
                  {t('scriptDocRolesLabel', { count: scriptDoc.roles.length })}
                </div>
                <div className="space-y-1.5">
                  {scriptDoc.roles.map((role) => (
                    <div
                      key={role.id}
                      className="rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-node-foreground">
                        {role.name}
                      </p>
                      {role.description ? (
                        <p className="mt-0.5 text-2xs leading-4 text-node-muted">
                          {role.description}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {scriptDoc.shots.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                  <Film className="size-3.5" />
                  {t('scriptDocShotsLabel', { count: scriptDoc.shots.length })}
                </div>
                <div className="space-y-2">
                  {scriptDoc.shots.map((shot, index) => (
                    <div
                      key={shot.id}
                      className="space-y-2 rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2.5"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xs font-semibold text-node-subtle">
                          {index + 1}
                        </span>
                        <p className="flex-1 text-xs leading-5 text-node-foreground">
                          {shot.summary}
                        </p>
                      </div>
                      {shot.camera ? (
                        <p className="text-2xs leading-4 text-node-subtle">
                          {shot.camera}
                        </p>
                      ) : null}
                      {shot.dialogue.length > 0 ? (
                        <div className="space-y-1 border-t border-node-panel-inner pt-2">
                          {shot.dialogue.map((line) => (
                            <p
                              key={line.id}
                              className="flex items-start gap-1.5 text-2xs leading-4 text-node-muted"
                            >
                              <Mic className="mt-0.5 size-3 shrink-0 text-node-subtle" />
                              <span>
                                <span className="font-semibold text-node-foreground">
                                  {roleNameById.get(line.speakerRoleId) ??
                                    line.speakerRoleId}
                                </span>
                                {`: ${line.line}`}
                              </span>
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-semibold text-node-foreground">
              {t('scriptDocEmptyTitle')}
            </p>
            <p className="max-w-xs text-xs leading-5 text-node-subtle">
              {t('scriptDocEmptyHint')}
            </p>
          </div>
        )}

        {error ? (
          <div className="mt-3 flex gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0">{error}</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-node-panel-inner px-4 py-3">
        <Button
          type="button"
          onClick={handleDraft}
          disabled={isDrafting}
          className="h-10 flex-1 rounded-2xl border border-node-panel-inner bg-node-panel-soft text-xs font-semibold text-node-foreground hover:border-node-edge hover:bg-node-panel-inner disabled:text-node-subtle"
        >
          {isDrafting ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Wand2 className="mr-1.5 size-4" />
          )}
          {scriptDoc ? t('scriptDocUpdate') : t('scriptDocDraft')}
        </Button>
        <Button
          type="button"
          onClick={handleApply}
          disabled={!hasContent || isDrafting}
          className="h-10 flex-1 rounded-2xl bg-node-foreground text-xs font-semibold text-node-canvas hover:bg-node-foreground/90 disabled:bg-node-panel-inner disabled:text-node-subtle"
        >
          <Sparkles className="mr-1.5 size-4" />
          {t('scriptDocApply')}
        </Button>
      </div>
    </div>
  )
}
