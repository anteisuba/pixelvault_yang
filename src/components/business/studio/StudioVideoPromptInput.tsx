'use client'

import { useMemo, useRef, type ClipboardEventHandler } from 'react'
import { useTranslations } from 'next-intl'

import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { useStudioForm } from '@/contexts/studio-context'
import {
  MentionInput,
  type MentionInputHandle,
  type MentionToken,
} from '@/components/ui/mention-input'
import { useStudioVideoAssets } from '@/hooks/use-studio-video-assets'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { getStudioVideoTokenFormat } from '@/lib/studio/video-workbench-slots'

/**
 * 视频档的提示词框 —— 正文里的素材编号渲染成缩略图胶囊（与图片档
 * `StudioReferencePromptInput` 同一个 `MentionInput`）。
 *
 * ⭐ 写法按模型（owner 09-24「按模型写它自己的格式」）：Seedance fal 是 `@Image1`，
 * 火山 / BytePlus 是 `图片1`，Wan 是 `图1`，MiniMax 是 `Image 1`…… 存储仍是原文，
 * 所见即所发；只有显示换成胶囊。`@ImageN` 在任何模型下也认（人和助手都可能这么写）。
 * ⚠ 编号与左栏素材轨同序（首帧 · 尾帧 · 参考图）—— `listStudioVideoImages`。
 */
export function StudioVideoPromptInput({
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
  const { selectedModel } = useVideoModelOptions(state.selectedOptionId ?? '')
  const { images, videos } = useStudioVideoAssets()
  const editorRef = useRef<MentionInputHandle>(null)
  const t = useTranslations('StudioVideoSlots')
  const tMention = useTranslations('StudioPromptArea.referenceMention')
  const tForm = useTranslations('StudioForm')
  const audios = state.videoAudioRefs

  const modelId = selectedModel?.modelId
  const adapterType = selectedModel?.adapterType as AI_ADAPTER_TYPES | undefined
  // ⚠ memo：token 表的引用每帧变会让编辑器重画胶囊、丢光标。
  const format = useMemo(
    () => getStudioVideoTokenFormat(modelId, adapterType),
    [modelId, adapterType],
  )

  const { tokens, candidates } = useMemo(() => {
    const out: MentionToken[] = []
    const picks: {
      id: string
      name: string
      tokenName: string
      thumbnailUrl?: string
    }[] = []
    const add = (
      kind: MentionToken['kind'],
      native: string,
      at: string,
      label: string,
      thumbnailUrl?: string,
    ) => {
      const base = {
        kind,
        slotLabel: label,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      }
      out.push({ ...base, name: native, literal: !format.prefixed })
      if (!format.prefixed) out.push({ ...base, name: at })
      picks.push({
        id: native,
        name: label,
        tokenName: native,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      })
    }
    for (const image of images) {
      add(
        'reference',
        format.image(image.n),
        `Image${image.n}`,
        t('image', { n: image.n }),
        image.url,
      )
    }
    videos.forEach((_, index) =>
      add(
        'video',
        format.video(index + 1),
        `Video${index + 1}`,
        t('video', { n: index + 1 }),
      ),
    )
    audios.forEach((_, index) =>
      add(
        'voice',
        format.audio(index + 1),
        `Audio${index + 1}`,
        t('audio', { n: index + 1 }),
      ),
    )
    return { tokens: out, candidates: picks }
  }, [format, images, videos, audios, t])

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
      emptyLabel={candidates.length ? tMention('noMatches') : tMention('empty')}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      onPaste={onPaste}
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
