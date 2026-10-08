'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { ImageEditSurface } from '@/components/business/studio-shared/editor/ImageEditSurface'
import { useStudioData } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import type { CanvasDerivedImageOutput } from '@/types/canvas-image-edit'

/**
 * 工作台侧的编辑宿主 —— 舞台接管态。
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
  onChangeSource?: () => void
  onRunStateChange?: (state: 'running' | 'success' | 'error') => void
  composerContainer?: HTMLElement | null
  active?: boolean
}

export function StudioImageEditStage({
  target,
  onBack,
  onTargetChange,
  onChangeSource,
  onRunStateChange,
  composerContainer,
  active = true,
}: StudioImageEditStageProps) {
  const t = useTranslations('StudioImageEdit')
  const { imageUpload } = useStudioData()
  const imageUploadRef = useRef(imageUpload)
  useLayoutEffect(() => {
    imageUploadRef.current = imageUpload
  }, [imageUpload])
  const [isRunning, setIsRunning] = useState(false)
  const handleRunState = useCallback(
    (state: 'running' | 'success' | 'error') => {
      setIsRunning(state === 'running')
      onRunStateChange?.(state)
    },
    [onRunStateChange],
  )
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
      const referenceIndex = target.referenceIndex
      const currentImageUpload = imageUploadRef.current
      const referenceStillMatches =
        referenceIndex !== undefined &&
        currentImageUpload.referenceEntries[referenceIndex]?.url === target.url
      if (referenceStillMatches) {
        currentImageUpload.replaceReferenceImage(referenceIndex, step.url)
      }
      onTargetChange?.({
        ...target,
        url: step.url,
        generationId: step.generationId,
        referenceIndex: referenceStillMatches ? referenceIndex : undefined,
        referenceTotal: referenceStillMatches
          ? target.referenceTotal
          : undefined,
      })
    },
    [onTargetChange, target],
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

  /**
   * 舞台顶上只剩一行：这一轮的编辑历史（有了才出现）+ 右端「换一张」。
   * ⛔ 「← 回到工作台 · 画廊来源」那一行已撤（owner 2026-10-03）：回去点顶上的
   *   「自然语言 / 标签」，三处来回切的入口收成一处。
   */
  const showTopRow = history.length > 1 || Boolean(onChangeSource)
  /** 当前这张的上一步 —— 放大 / 修图结果用它做前后对比（动效样片 W）。 */
  const currentStep = history.findIndex((entry) => entry.url === target.url)
  const compareFromUrl = currentStep > 0 ? history[currentStep - 1].url : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showTopRow ? (
        <div className="mb-3 flex min-h-8 shrink-0 items-center gap-2">
          {history.length > 1 ? (
            <nav
              aria-label={t('stageHistory')}
              className="studio-mobile-chip-row flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
            >
              {history.map((step, index) => {
                const current = step.url === target.url
                return (
                  <button
                    key={`${step.url}-${index}`}
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    title={step.summary}
                    onClick={() => adopt(step)}
                    disabled={isRunning}
                    className={cn(
                      'max-w-56 shrink-0 truncate rounded-full border px-2.5 text-2xs transition-colors duration-fast ease-standard',
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
          ) : (
            <span className="flex-1" />
          )}
          {onChangeSource ? (
            <button
              type="button"
              disabled={isRunning}
              onClick={onChangeSource}
              className="touch-target-y h-8 shrink-0 rounded-full px-3 text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {t('changeSource')}
            </button>
          ) : null}
        </div>
      ) : null}

      <ImageEditSurface
        sourceUrl={target.url}
        sourceGenerationId={target.generationId}
        onApplied={handleApplied}
        onCancel={onBack}
        defaultTask="edit-image"
        composerContainer={composerContainer}
        active={active}
        onRunStateChange={handleRunState}
        compareFromUrl={compareFromUrl}
      />
    </div>
  )
}
