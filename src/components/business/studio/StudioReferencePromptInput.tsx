'use client'

import { useMemo, useRef, type ClipboardEventHandler } from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import {
  MentionInput,
  type MentionInputHandle,
  type MentionToken,
} from '@/components/ui/mention-input'
import { getImageFileFromDataTransfer } from '@/lib/image-input'

export function StudioReferencePromptInput({
  disabled,
  placeholder,
  className,
  onSubmit,
  onPaste,
}: {
  disabled?: boolean
  placeholder?: string
  className?: string
  onSubmit(): void
  onPaste?: ClipboardEventHandler<HTMLElement>
}) {
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const editorRef = useRef<MentionInputHandle>(null)
  const t = useTranslations('StudioPromptArea.referenceMention')
  const tForm = useTranslations('StudioForm')
  const tokens = useMemo<MentionToken[]>(
    () =>
      imageUpload.referenceEntries.map((entry, index) => ({
        name: `Image${index + 1}`,
        kind: 'reference',
        thumbnailUrl: entry.url,
        slotLabel: `@${t('image', { index: index + 1 })}${entry.disabledReason ? ` · ${t('unavailable')}` : ''}`,
      })),
    [imageUpload.referenceEntries, t],
  )
  const candidates = useMemo(
    () =>
      tokens.flatMap((token, index) =>
        imageUpload.referenceEntries[index].disabledReason
          ? []
          : [
              {
                id: token.name,
                name: t('image', { index: index + 1 }),
                tokenName: token.name,
                thumbnailUrl: token.thumbnailUrl,
              },
            ],
      ),
    [tokens, imageUpload.referenceEntries, t],
  )

  return (
    <MentionInput
      ref={editorRef}
      id={STUDIO_PROMPT_TEXTAREA_ID}
      aria-label={tForm('promptLabel')}
      value={state.prompt}
      onValueChange={(value) =>
        dispatch({ type: 'SET_PROMPT', payload: value })
      }
      tokens={tokens}
      mentionCandidates={candidates}
      onMentionSelect={(candidate) =>
        editorRef.current?.insertToken(candidate.tokenName ?? candidate.name)
      }
      emptyLabel={candidates.length ? t('noMatches') : t('empty')}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      onPaste={(event) => {
        onPaste?.(event)
        if (event.defaultPrevented) return
        const file = getImageFileFromDataTransfer(event.clipboardData)
        if (file) {
          event.preventDefault()
          void imageUpload.handleFileChange(file)
        }
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          event.stopPropagation()
          onSubmit()
        }
      }}
    />
  )
}
