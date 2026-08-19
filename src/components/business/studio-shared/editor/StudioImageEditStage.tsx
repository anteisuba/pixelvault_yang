'use client'

import { useCallback, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ImageEditSurface } from '@/components/business/studio-shared/editor/ImageEditSurface'
import { useStudioData } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import type { CanvasDerivedImageOutput } from '@/types/canvas-image-edit'

/**
 * 工作台侧的编辑宿主 —— 舞台接管态。
 *
 * 施工基准 `docs/references/pages/studio-image-edit.md` §2：进编辑后右侧结果区
 * 整片切成编辑态（返回条 + 图区 + 右侧控件栏），左参数栏不动、不收窄。
 *
 * 与画布弹窗共用 `ImageEditSurface`（2026-08-19 E5 之后连布局都只剩一套），
 * 两个宿主只差一处：结果落点 —— 这边**就地替换参考图槽位**（§6，owner
 * 2026-08-18 拍板），画布那边落派生节点。
 */

export interface StudioImageEditTarget {
  url: string
  /** 源图对应的 generation（从结果进编辑时有）。 */
  generationId?: string
  /**
   * 参考图槽位序号。有值 = 从参考图进的，编完就地替换该槽；
   * 没有 = 从生成结果进的，编完只落画廊，不碰参考图。
   */
  referenceIndex?: number
  /** 参考图总数，只用于「N / M」那行字。 */
  referenceTotal?: number
}

/**
 * 一步编辑。⚠ `summary` 是「做了什么」而不是「变成了什么」—— E4 的验收是
 * 「改五次能回到第三次」，只存图的话用户认不出第三次是哪一次。
 */
interface EditStep {
  url: string
  generationId?: string
  summary: string
}

interface StudioImageEditStageProps {
  target: StudioImageEditTarget
  onBack: () => void
  /**
   * 编辑成功后把目标换成新图 —— **不留在编辑器里看旧图**。
   *
   * ⚠ 2026-08-19 真机逮到的：只替换参考图槽位的话，左栏缩略图更新了、舞台上
   * 那张大图还是编辑前的，用户看着旧图以为没生效。而且接着编第二次会从旧图
   * 出发，等于把上一次的修改丢了。
   */
  onTargetChange?: (next: StudioImageEditTarget) => void
}

export function StudioImageEditStage({
  target,
  onBack,
  onTargetChange,
}: StudioImageEditStageProps) {
  const t = useTranslations('StudioImageEdit')
  const { imageUpload } = useStudioData()
  /**
   * 这一轮编辑的历史链。第 0 项是进编辑时的那张原图。
   *
   * ⚠ **只活在本次编辑会话里**，不跨刷新 —— 跨会话保存要动 schema，那是单独
   * 一件事（施工基准 §9 未列入本片）。先端到端跑通最小版本。
   */
  const [history, setHistory] = useState<EditStep[]>([
    {
      url: target.url,
      generationId: target.generationId,
      summary: t('stageHistoryOriginal'),
    },
  ])

  /** 把某张图落回槽位并让舞台跟上 —— 应用与回退共用这一条。 */
  const adopt = useCallback(
    (step: EditStep) => {
      if (target.referenceIndex !== undefined) {
        // ⚠ 就地替换，不是先删后加 —— 后者会把它挪到队尾，槽满时还会被判
        // over_limit，于是「改好这张再拿去生成」变成「改好的那张不参与生成」。
        imageUpload.replaceReferenceImage(target.referenceIndex, step.url)
      }
      onTargetChange?.({
        ...target,
        url: step.url,
        generationId: step.generationId,
      })
    },
    [imageUpload, onTargetChange, target],
  )

  const handleApplied = useCallback(
    (outputs: CanvasDerivedImageOutput[], summary: string): boolean => {
      const next = outputs[0]?.imageUrl
      if (!next) return false

      const step: EditStep = {
        url: next,
        generationId: outputs[0]?.generationId,
        summary,
      }
      // 从中间某一步回退后再编辑：砍掉它后面的分支，新的一步接在当前这张之后。
      setHistory((current) => {
        const at = current.findIndex((entry) => entry.url === target.url)
        const base = at >= 0 ? current.slice(0, at + 1) : current
        return [...base, step]
      })
      adopt(step)
      return true
    },
    [adopt, target.url],
  )

  const editingLabel =
    target.referenceIndex !== undefined
      ? t('stageEditingReference', {
          index: target.referenceIndex + 1,
          total: target.referenceTotal ?? target.referenceIndex + 1,
        })
      : t('sourceBadgeGeneration')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('stageBack')}
        </button>
        <span className="text-xs text-muted-foreground">{editingLabel}</span>
      </div>

      {history.length > 1 ? (
        <nav
          aria-label={t('stageHistory')}
          className="mb-4 flex flex-wrap items-center gap-1.5"
        >
          <span className="text-2xs text-muted-foreground/70">
            {t('stageHistory')}
          </span>
          {history.map((step, index) => {
            const current = step.url === target.url
            return (
              <button
                key={`${step.url}-${index}`}
                type="button"
                aria-current={current ? 'step' : undefined}
                title={step.summary}
                onClick={() => adopt(step)}
                className={cn(
                  'max-w-56 truncate rounded-full border px-2.5 py-1 text-2xs transition-colors',
                  current
                    ? 'border-foreground/20 bg-foreground text-background'
                    : 'border-border/70 text-muted-foreground hover:text-foreground',
                )}
              >
                {index === 0
                  ? step.summary
                  : `${t('stageHistoryStep', { index })} · ${step.summary}`}
              </button>
            )
          })}
        </nav>
      ) : null}

      <ImageEditSurface
        sourceUrl={target.url}
        sourceGenerationId={target.generationId}
        onApplied={handleApplied}
        onCancel={onBack}
      />
    </div>
  )
}
