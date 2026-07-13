'use client'

import { useCallback, useState } from 'react'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getCanvasImageEditCapability } from '@/constants/canvas-image-edit-capabilities'
import { getGenerationErrorMessage } from '@/lib/api-error-message'
import { createExtractedElementAPI, extractElementAPI } from '@/lib/api-client'
import { logger } from '@/lib/logger'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'

interface CanvasQuickEditPromptProps {
  nodeId: string
  data: NodeWorkflowNodeData
  fileLabel: string
  onClose(): void
}

function getSourceUrl(data: NodeWorkflowNodeData): string {
  if (typeof data.mediaUrl === 'string' && data.mediaUrl.trim()) {
    return data.mediaUrl
  }
  if (typeof data.imageUrl === 'string' && data.imageUrl.trim()) {
    return data.imageUrl
  }
  return ''
}

/**
 * Haivis L3 quick-edit panel under the selected image:
 * back → object tools, target filename, single Run action.
 * Implemented capability: element extract (prompt-based, real API).
 */
export function CanvasQuickEditPrompt({
  nodeId,
  data,
  fileLabel,
  onClose,
}: CanvasQuickEditPromptProps) {
  const t = useTranslations('StudioNode.quickEdit')
  const tEdit = useTranslations('StudioImageEdit')
  const tErrors = useTranslations('Errors')
  const { placeDerivedImages, focusNode } = useNodeWorkflowActions()
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const sourceUrl = getSourceUrl(data)
  const sourceGenerationId =
    typeof data.generationId === 'string'
      ? data.generationId
      : typeof data.sourceGenerationId === 'string'
        ? data.sourceGenerationId
        : undefined

  const run = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed || !sourceUrl || running) return

    setRunning(true)
    try {
      const modelId =
        getCanvasImageEditCapability('extract-element').defaultModelId ?? ''
      const response = await extractElementAPI({
        imageUrl: sourceUrl,
        prompt: trimmed,
        invert: false,
        sourceGenerationId,
        modelId,
      })
      if (!response.success || !response.data) {
        toast.error(
          getGenerationErrorMessage(tErrors, response, tEdit('extractFailed')),
        )
        return
      }

      const derivedIds =
        placeDerivedImages?.(nodeId, [
          {
            imageUrl: response.data.imageUrl,
            width: response.data.width,
            height: response.data.height,
            generationId: response.data.generation?.id,
            label: tEdit('tasks.extract-element.label'),
            editCapability: 'extract-element',
          },
        ]) ?? []

      if (derivedIds.length === 0) {
        toast.error(tEdit('extractFailed'))
        return
      }

      focusNode?.(derivedIds[0])

      const saveResponse = await createExtractedElementAPI({
        extractedImageUrl: response.data.imageUrl,
        sourceImageUrl: sourceUrl,
        sourceGenerationId,
        prompt: trimmed,
        invert: false,
        modelId,
      })
      if (!saveResponse.success) {
        logger.warn('[canvas-quick-edit] extracted element save failed', {
          error: saveResponse.error,
        })
        toast.warning(tEdit('extract.success'), {
          description: tEdit('extract.saveFailed'),
        })
      } else {
        toast.success(tEdit('extract.success'))
      }
      onClose()
    } catch (error) {
      logger.error('[canvas-quick-edit] failed', { error })
      toast.error(tEdit('extractFailed'))
    } finally {
      setRunning(false)
    }
  }, [
    focusNode,
    nodeId,
    onClose,
    placeDerivedImages,
    prompt,
    running,
    sourceGenerationId,
    sourceUrl,
    tEdit,
    tErrors,
  ])

  return (
    <div
      data-testid="canvas-quick-edit-prompt"
      className="w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-node-panel-inner bg-node-panel text-node-foreground shadow-node-panel"
    >
      <div className="flex items-center gap-1 border-b border-node-panel-inner px-2 py-1.5">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('back')}
          title={t('back')}
          className="flex size-8 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-node-foreground">
          {t('title')}
        </p>
      </div>

      <div className="p-3">
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('placeholder')}
          disabled={running || !sourceUrl}
          className="min-h-[4.75rem] resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 text-node-foreground shadow-none placeholder:text-node-subtle focus-visible:ring-0"
          autoFocus
        />
        <div className="mt-2 flex items-center justify-between gap-3 px-1">
          <p className="min-w-0 truncate text-xs leading-4 text-node-muted">
            {t('editing', { name: fileLabel })}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={running || !prompt.trim() || !sourceUrl}
            onClick={() => void run()}
            className="h-9 shrink-0 rounded-xl bg-node-paint px-3 text-xs font-semibold text-node-paint-fg hover:bg-node-paint/90"
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {t('run')}
          </Button>
        </div>
        <p className="mt-2 px-1 text-2xs leading-4 text-node-subtle">
          {t('hint')}
        </p>
      </div>
    </div>
  )
}
