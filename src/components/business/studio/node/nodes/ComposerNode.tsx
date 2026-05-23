'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  ArrowUp,
  ChevronDown,
  Hash,
  ImagePlus,
  Loader2,
  Maximize2,
  MessageCircleQuestion,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'

import { SCRIPT_BREAKDOWN_LIMITS } from '@/constants/script-breakdown'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode } from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NODE_ACCENTS, NODE_HANDLE_CLASS } from './shared'

const COMPOSER_ACCENT = NODE_ACCENTS.composer

export function ComposerNode({
  id,
  data,
  selected,
}: NodeProps<NodeWorkflowNode>) {
  const t = useTranslations('StudioNode')
  const { isLoading, updateNodeData, sendFromComposer, hasOutgoingAgent } =
    useNodeWorkflowActions()

  const promptValue = data.prompt
  const linked = hasOutgoingAgent(id)
  const canSend = promptValue.trim().length > 0 && !isLoading && linked

  const handlePromptChange = useCallback(
    (value: string) => updateNodeData(id, { prompt: value }),
    [id, updateNodeData],
  )

  const handleSend = useCallback(() => {
    if (!canSend) return
    void sendFromComposer(id)
  }, [canSend, id, sendFromComposer])

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        if (canSend) handleSend()
      }
    },
    [canSend, handleSend],
  )

  return (
    <article
      className={cn(
        'group relative w-[560px] overflow-hidden rounded-[22px] border bg-[#181716] shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-colors',
        selected
          ? COMPOSER_ACCENT.selectedRing
          : 'border-white/[0.08] hover:border-white/20',
      )}
    >
      <Handle
        type="source"
        position={Position.Right}
        className={NODE_HANDLE_CLASS}
      />
      <Handle
        type="target"
        position={Position.Left}
        className={NODE_HANDLE_CLASS}
      />

      <div className="nodrag flex cursor-default items-start gap-3 p-3">
        <button
          type="button"
          aria-label={t('composer.attachTooltip')}
          title={t('composer.attachTooltip')}
          className="grid size-12 shrink-0 place-items-center rounded-2xl border border-dashed border-white/15 bg-[#1f1d1b] text-[#6f6a63] transition-colors hover:border-white/30 hover:text-foreground/80"
        >
          <ImagePlus className="size-4" />
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start gap-2">
            <Textarea
              value={promptValue}
              onChange={(event) => handlePromptChange(event.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={SCRIPT_BREAKDOWN_LIMITS.IDEA_MAX_LENGTH}
              placeholder={t('composer.placeholder')}
              rows={3}
              className="min-h-[72px] resize-none border-0 bg-transparent p-0 text-sm leading-[22px] text-foreground/90 shadow-none placeholder:text-[#6f6a63] focus-visible:ring-0"
            />
            <button
              type="button"
              aria-label={t('composer.expandTooltip')}
              title={t('composer.expandTooltip')}
              className="grid size-7 shrink-0 place-items-center rounded-md text-[#a6a098] transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
              <ComposerChip
                icon={Hash}
                label={t('composer.agentMode')}
                dropdown
              />
              <ComposerChip
                icon={MessageCircleQuestion}
                label={t('composer.askMode')}
                dropdown
              />
              <ComposerChip icon={Wand2} label={t('composer.skillLibrary')} />
            </div>
            <SendButton
              loading={isLoading}
              disabled={!canSend}
              label={
                linked ? t('composer.sendTooltip') : t('composer.noTargetTip')
              }
              onClick={handleSend}
            />
          </div>
        </div>
      </div>
    </article>
  )
}

interface ComposerChipProps {
  icon: LucideIcon
  label: ReactNode
  dropdown?: boolean
}

function ComposerChip({ icon: Icon, label, dropdown }: ComposerChipProps) {
  return (
    <button
      type="button"
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#22211f] px-2.5 text-[11px] font-semibold text-[#a6a098] transition-colors hover:bg-[#2d2b28] hover:text-foreground/90"
    >
      <Icon className="size-3" />
      <span>{label}</span>
      {dropdown && <ChevronDown className="size-3" />}
    </button>
  )
}

interface SendButtonProps {
  loading: boolean
  disabled: boolean
  label: string
  onClick: () => void
}

function SendButton({ loading, disabled, label, onClick }: SendButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full bg-[#f4f1ea] text-[#0d0c0b] transition-all',
        'hover:bg-white disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-[#0d0c0b]/60',
      )}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ArrowUp className="size-4" strokeWidth={2.5} />
      )}
    </button>
  )
}
