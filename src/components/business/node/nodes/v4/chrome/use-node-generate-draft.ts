'use client'

/**
 * 提示词**草稿 + 发送**（图片 / 音频卡与手机端抽屉共用的那一小块状态机）。
 *
 * 桌面卡与 S12 的手机底部抽屉是同一条路径：写词 → `set_prompt` → `generateNode`
 * → `set_media` 回填。把它散在两处写，就会出现「手机上发出去的那一枪没落
 * `mediaJobId`」这类只在刷新之后才看得见的漂移。
 *
 * ⚠ 视频卡不用这一份：它多一层「默认模型 / 默认档到按下生成那一刻才落库」的
 * 语义，住在 `video/use-video-composer` 里。⛔ 不要把那一层塞进来做成开关。
 */

import { useEffect, useState } from 'react'

import { PROGRESS_TICK_MS } from '@/constants/generation-progress'
import { useNodeMediaGenerationV4 } from '@/hooks/node/use-node-media-generation-v4'

import { useNodeV4Canvas, type NodeV4MediaPatch } from '../NodeV4Context'

export interface NodeGenerateDraftOptions {
  readonly id: string
  /** 节点上落着的提示词（助手改它时草稿跟上）。 */
  readonly prompt: string | undefined
  /** 节点上落着的在飞 job id —— 有它就是「生成中」（刷新之后也认得出来）。 */
  readonly mediaJobId: string | undefined
  /**
   * 成功一枪时往节点上写什么。⚠ 默认只写 `url / generationId / 清 job`；
   * 图片卡要多写一个 `imageSource`，所以留这个口子。
   */
  buildMediaPatch?(result: {
    readonly mediaUrl: string
    readonly generation: { readonly id: string }
    readonly thumbnailUrl?: string | undefined
  }): NodeV4MediaPatch
}

export interface NodeGenerateDraft {
  readonly draft: string
  setDraft(next: string): void
  readonly currentPrompt: string
  readonly generating: boolean
  /** 生成开始到现在的秒数（裱框显影读它）。 */
  readonly elapsed: number
  submitPrompt(): void
  cancel(): void
}

export function useNodeGenerateDraft({
  id,
  prompt,
  mediaJobId,
  buildMediaPatch,
}: NodeGenerateDraftOptions): NodeGenerateDraft {
  const canvas = useNodeV4Canvas()
  const generation = useNodeMediaGenerationV4()
  const [draft, setDraft] = useState(prompt ?? '')
  const [syncedPrompt, setSyncedPrompt] = useState(prompt ?? '')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  // 助手 `set_prompt` 落下来时草稿跟上 —— 渲染期同步，⛔ 不放 effect 里。
  const currentPrompt = prompt ?? ''
  if (syncedPrompt !== currentPrompt) {
    setSyncedPrompt(currentPrompt)
    setDraft(currentPrompt)
  }

  const generating = Boolean(mediaJobId) || startedAt !== null

  useEffect(() => {
    if (!generating) return
    const begin = startedAt ?? Date.now()
    const tick = () => setElapsed((Date.now() - begin) / 1000)
    tick()
    const timer = window.setInterval(tick, PROGRESS_TICK_MS)
    return () => window.clearInterval(timer)
  }, [generating, startedAt])

  const submitPrompt = () => {
    if (draft.trim().length === 0 || generating) return
    if (draft !== currentPrompt) canvas.onSetPrompt(id, draft)
    setStartedAt(Date.now())
    void generation
      .generateNode(
        id,
        { nodes: canvas.nodes, edges: canvas.edges },
        {
          prompt: draft,
          // 落 job id = 持久化「有一单在飞」：刷新之后由回填 hook 取回结果。
          onJobCreated: (jobId) => canvas.onSetMedia(id, { mediaJobId: jobId }),
          // ⚠ 回填写在 `onEach` 而不是 `.then`：张数 > 1 时是顺序发的 N 枪。
          onEach: (result) => {
            if (!result.success) return
            canvas.onSetMedia(
              id,
              buildMediaPatch?.(result) ?? {
                url: result.mediaUrl,
                generationId: result.generation.id,
                mediaJobId: undefined,
              },
            )
          },
        },
      )
      .then(() => setStartedAt(null))
  }

  return {
    draft,
    setDraft,
    currentPrompt,
    generating,
    elapsed,
    submitPrompt,
    cancel: () => setStartedAt(null),
  }
}
