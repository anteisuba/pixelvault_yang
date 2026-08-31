'use client'

import { useCallback, useRef, useState } from 'react'
import { Library, Music2, Trash2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  REFERENCE_AUDIO_MAX_BYTES,
  REFERENCE_AUDIO_MAX_MB,
} from '@/constants/audio-options'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import { VIDEO_REFERENCE_LIMITS } from '@/constants/video-reference-limits'
import { uploadReferenceAudioAPI } from '@/lib/api-client/voices'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import type { VideoAudioReference } from '@/contexts/studio-context'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { AudioOwnerPicker } from '@/components/business/studio-shared/primitives/AudioOwnerPicker'
import { AudioPlayer } from '@/components/ui/audio-player'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { GenerationRecord } from '@/types'

/**
 * 视频工作台的**音频参考**面板（台账 A，owner 2026-08-29 拍板）。
 *
 * ── 这条通道原本断在哪 ──────────────────────────────────────────────
 * 后端整条是通的：Zod schema、service、worker 三层早就收 `audioUrls` +
 * `audioBindings`，连校验（音频数上限 / 超槽 400 / `audioRequiresVisual`）都写好
 * 了。断的只有最上面两层 —— **UI 没有入口**，以及 `buildVideoInput` 不填这两个
 * 字段。后果是工作台这条路**永远做不出带指定音色的对白视频**，而
 * 「全能参考」那一档明明选得到（Seedance 2.5 是全仓唯一允许纯音频参考、音频槽
 * 多达 10 个的模型）。
 *
 * ── 三个不显然的点 ──────────────────────────────────────────────────
 * ① **槽位上限跟着选中的模型走**，不是一个写死的数：读
 *    `getVideoModelSendContract(...).slots.audio`，与发送路径、服务端校验同一份
 *    真相。上限为 0（该模型不吃音频参考）时整个面板给一句话，不摆一个点了会被
 *    服务端 400 拒掉的上传按钮。
 * ② **只存 URL 不存 File**：`generate-video.service.ts` 对音频是原样透传、
 *    **不重传 R2**，所以这里必须先把文件传成公网地址
 *    （`uploadReferenceAudioAPI`）再落进表单。
 * ③ **归属（属于哪个角色）走共享控件** `AudioOwnerPicker` —— 与画布那条
 *    （台账 X）同一套语义。候选来自**本次已应用的角色卡**，留空则退化成无标签
 *    `@AudioN`（schema 允许）。
 */
export function StudioVideoAudioPanel() {
  const t = useTranslations('StudioVideoAudio')
  const { state, dispatch } = useStudioForm()
  const { characters } = useStudioData()
  // 与 `StudioPromptArea` 读同一条：槽位上限必须问**这一次真的会跑的那个端点**。
  const { selectedModel } = useVideoModelOptions(state.selectedOptionId ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)

  const refs = state.videoAudioRefs
  /**
   * ⚠ 上限问的是**当前选中的模型**。没选模型时给 0 —— 那时「能挂几条」这个问题
   * 还没有答案，摆一个上传口只会让用户传完才发现发不出去。
   */
  const modelAudioSlots = selectedModel
    ? getVideoModelSendContract(
        selectedModel.modelId,
        selectedModel.adapterType,
      ).slots.audio
    : 0
  const audioSlots = Math.min(modelAudioSlots, VIDEO_REFERENCE_LIMITS.AUDIO)
  const isFull = refs.length >= audioSlots
  const ownerCandidates = characters.activeCards.map((card) => card.name)

  const setRefs = useCallback(
    (next: VideoAudioReference[]) => {
      dispatch({ type: 'SET_VIDEO_AUDIO_REFS', payload: next })
    },
    [dispatch],
  )

  const addRef = useCallback(
    (entry: Omit<VideoAudioReference, 'id'>) => {
      if (isFull) return
      // 同一段音频挂两次对模型没有意义，而它会白占一个槽。
      if (refs.some((existing) => existing.url === entry.url)) return
      setRefs([
        ...refs,
        {
          id:
            globalThis.crypto?.randomUUID?.() ??
            `audio-${refs.length}-${entry.url.slice(-12)}`,
          ...entry,
        },
      ])
    },
    [isFull, refs, setRefs],
  )

  const handlePickFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0] ?? null
      event.target.value = ''
      if (!selected) return

      if (selected.size > REFERENCE_AUDIO_MAX_BYTES) {
        toast.error(t('errorTooLarge', { max: `${REFERENCE_AUDIO_MAX_MB} MB` }))
        return
      }
      if (!selected.type.startsWith('audio/')) {
        toast.error(t('errorNotAudio'))
        return
      }

      setIsUploading(true)
      const result = await uploadReferenceAudioAPI(selected)
      setIsUploading(false)

      if (!result.success || !result.data) {
        toast.error(result.error ?? t('errorUploadFailed'))
        return
      }
      addRef({
        url: result.data.url,
        fileName: result.data.fileName || selected.name,
      })
      toast.success(t('uploadSuccess'))
    },
    [addRef, t],
  )

  const handlePickAsset = useCallback(
    (generation: GenerationRecord) => {
      if (!generation.url) return
      addRef({
        url: generation.url,
        // 素材库里的音频常常没有文件名，用台词首句兜底 —— 那正是用户认得出它的
        // 那一行（台账 E 同源：文本一直都在，只是不给看）。
        fileName: generation.prompt?.trim() || generation.id,
      })
      setAssetDialogOpen(false)
    },
    [addRef],
  )

  if (audioSlots === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
        {selectedModel ? t('unsupported') : t('pickModelFirst')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
          {t('count', { used: refs.length, max: audioSlots })}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isFull || isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <Spinner size="sm" className="mr-2" />
          ) : (
            <Upload className="mr-2 size-4" />
          )}
          {t('upload')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isFull}
          onClick={() => setAssetDialogOpen(true)}
        >
          <Library className="mr-2 size-4" />
          {t('fromAssets')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          disabled={isFull || isUploading}
          onChange={handlePickFile}
        />
      </div>

      {isFull ? (
        <p role="status" className="text-xs text-muted-foreground">
          {t('limitReached', { max: audioSlots })}
        </p>
      ) : null}

      {refs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {refs.map((ref, index) => (
            <li
              key={ref.id}
              className="flex flex-col gap-2 rounded-lg border border-border/60 p-2"
            >
              <div className="flex items-center gap-2">
                <Music2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {/* `@AudioN` 的 N 就是这里的序号 —— 用户在提示词里写的引用要
                      对得上，所以序号必须显示出来。 */}
                  {t('slotBadge', { index: index + 1 })} · {ref.fileName}
                </span>
                <button
                  type="button"
                  aria-label={t('remove')}
                  title={t('remove')}
                  onClick={() =>
                    setRefs(refs.filter((entry) => entry.id !== ref.id))
                  }
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <AudioPlayer src={ref.url} />
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {t('ownerLabel')}
                </span>
                <AudioOwnerPicker
                  value={ref.ownerName}
                  candidates={ownerCandidates}
                  onChange={(ownerName) =>
                    setRefs(
                      refs.map((entry) =>
                        entry.id === ref.id ? { ...entry, ownerName } : entry,
                      ),
                    )
                  }
                  labels={{
                    none: t('ownerNone'),
                    custom: t('ownerCustom'),
                    customPlaceholder: t('ownerPlaceholder'),
                    ariaLabel: t('ownerLabel'),
                  }}
                  className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        title={t('assetDialogTitle')}
        description={t('assetDialogDescription')}
        mediaType="audio"
        onSelect={handlePickAsset}
      />
    </div>
  )
}
