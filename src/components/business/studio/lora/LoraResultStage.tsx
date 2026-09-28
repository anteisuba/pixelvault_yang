'use client'

import type { CSSProperties } from 'react'
import { useTranslations } from 'next-intl'

import { BookmarkPlus, Bot, Check, X } from '@/components/icons'
import {
  StudioGeneratingProgress,
  type StudioGenerationFailure,
} from '@/components/business/studio-shared'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export interface LoraResultRoundItem {
  readonly id: string
  readonly url: string
}

interface LoraResultStageProps {
  /** 正在看的那一张（没出过图时为 `null`）。 */
  resultUrl: string | null
  /** 那一张的宽 / 高；没有快照时按正在出的这一张的比例画框。 */
  resultRatio: number | undefined
  /** 还没有图时那块素底框的宽 / 高（当前比例 / 精确尺寸）。 */
  pendingRatio: number
  /** 生成中，或刚出图还在演收尾那一拍。 */
  generating: boolean
  isCompleting: boolean
  completionReleased: boolean
  onEdgeRelease: () => void
  onCompleteAnimationDone: () => void
  elapsedSeconds: number
  stageLabel: string
  /** 新生成那一行参数（「18s · 底模 · 3:4」）。 */
  paramsLine?: string
  /** 没出图：线停住变灰 + 原因 + 重试（加载态 A）。 */
  failure: StudioGenerationFailure | null
  onCancel?: () => void
  onOpenPreview: () => void
  onAskAssistant: () => void
  /**
   * 「存成模板」（pages/prompts.md）：这一张出图那一刻的整套存进提示词页。只有结果条里
   * 有这一张（记着它的整套）时才给；存过的这一轮换成「已存成模板」。
   */
  templateSave?: { state: 'idle' | 'saving' | 'saved'; onSave: () => void }
  /** 没出过图时舞台中间那一句。 */
  hint: string
  round: readonly LoraResultRoundItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** 图下右侧那行等宽元信息。 */
  meta: string | null
  /** Runner 线路生成中的耗时预估（替掉元信息那一格）。 */
  eta: string | null
}

const fitStyle = (ratio: number) =>
  ({ '--studio-fit-ratio': ratio }) as CSSProperties

/** 图上右上角那几颗小圆键（问助手 · 存成模板）：贴在媒体上的固定亮底。 */
const mediaButton =
  'grid size-7.5 place-items-center rounded-full bg-background/85 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default'

/**
 * 生成台 B 的结果区（lora-generate.md §2.3）：图按舞台剩下的地方等比放到最大，
 * 图下一行「这一轮」缩略 + 元信息。
 *
 * ⭐ 框的比例就是图的比例（`studio-fit-area` / `studio-fit-box`，与图片台舞台同一套）：
 *   进度线跑在图自己的边上，⛔ 不是一块比图宽的框。
 * ⚠ 生成中 / 失败都在框里说（加载态 A）：没有旧图 = 素底框；有旧图 = 旧图盖白纱。
 *   ⛔ 不弹 toast、⛔ 不把失败写进输入框。
 */
export function LoraResultStage({
  resultUrl,
  resultRatio,
  pendingRatio,
  generating,
  isCompleting,
  completionReleased,
  onEdgeRelease,
  onCompleteAnimationDone,
  elapsedSeconds,
  stageLabel,
  paramsLine,
  failure,
  onCancel,
  onOpenPreview,
  onAskAssistant,
  templateSave,
  hint,
  round,
  selectedId,
  onSelect,
  meta,
  eta,
}: LoraResultStageProps) {
  const t = useTranslations('LoraWorkbench')
  const tCancel = useTranslations('GenerationCancel')
  const tStudio = useTranslations('StudioV3')
  const busy = generating || failure !== null
  const ratio = resultUrl ? (resultRatio ?? pendingRatio) : pendingRatio
  const showBox = busy || resultUrl !== null

  return (
    <div
      data-testid="lora-result-card"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-6 pb-4 pt-5.5"
    >
      {showBox ? (
        <div className="studio-fit-area flex min-h-0 flex-1 items-center justify-center">
          <div
            style={fitStyle(ratio)}
            className={cn(
              'studio-fit-box relative overflow-hidden rounded-xl',
              resultUrl ? 'bg-muted' : 'bg-card',
            )}
          >
            {resultUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resultUrl}
                  alt=""
                  className="size-full object-cover"
                />
                {busy ? (
                  <div
                    aria-hidden
                    className={cn(
                      'absolute inset-0 bg-background/60 transition-opacity duration-base ease-linear motion-reduce:transition-none',
                      isCompleting && completionReleased && 'opacity-0',
                    )}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={onOpenPreview}
                    aria-label={t('generate.resultPreviewLabel')}
                    className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  />
                )}
              </>
            ) : null}
            {busy ? (
              <StudioGeneratingProgress
                elapsedSeconds={elapsedSeconds}
                stageLabel={stageLabel}
                paramsLine={resultUrl ? undefined : paramsLine}
                variant={resultUrl ? 'compact' : 'full'}
                cornerRadiusVar="--radius-xl"
                isCompleting={isCompleting}
                onEdgeRelease={onEdgeRelease}
                onCompleteAnimationDone={onCompleteAnimationDone}
                failure={failure}
              />
            ) : null}
            {generating && onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                data-testid="lora-generation-cancel"
                aria-label={tCancel('cancel')}
                className="absolute right-3 top-3 z-10 grid size-7.5 place-items-center rounded-full bg-background/85 text-muted-foreground backdrop-blur-sm transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
            {resultUrl && !busy ? (
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
                {templateSave ? (
                  <button
                    type="button"
                    data-testid="lora-save-template"
                    onClick={templateSave.onSave}
                    disabled={templateSave.state !== 'idle'}
                    aria-busy={templateSave.state === 'saving' || undefined}
                    aria-label={
                      templateSave.state === 'saved'
                        ? t('generate.templateSaved')
                        : t('generate.saveTemplate')
                    }
                    title={
                      templateSave.state === 'saved'
                        ? t('generate.templateSaved')
                        : t('generate.saveTemplate')
                    }
                    className={cn(
                      mediaButton,
                      templateSave.state === 'saved' && 'text-foreground',
                    )}
                  >
                    {templateSave.state === 'saving' ? (
                      <Spinner size="sm" />
                    ) : templateSave.state === 'saved' ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      <BookmarkPlus className="size-3.5" aria-hidden />
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onAskAssistant}
                  aria-label={tStudio('toolAskAssistant')}
                  title={tStudio('toolAskAssistant')}
                  className={mediaButton}
                >
                  <Bot className="size-3.5" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="grid min-h-0 flex-1 place-items-center text-2sm text-muted-foreground/70">
          {hint}
        </p>
      )}

      {showBox && (round.length > 1 || meta || eta) ? (
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          {round.length > 1 ? (
            <div
              role="listbox"
              aria-label={t('generate.resultHistoryLabel')}
              className="flex shrink-0 items-center gap-1.5"
            >
              <span className="mr-1 whitespace-nowrap text-xs text-muted-foreground">
                {t('generate.roundLabel')}
              </span>
              {round.map((item) => {
                const active = item.id === selectedId
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      'h-10 w-7.5 shrink-0 overflow-hidden rounded-md bg-muted transition-shadow duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card'
                        : 'hover:ring-2 hover:ring-foreground/20',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </button>
                )
              })}
            </div>
          ) : null}
          {eta ? (
            <p
              data-testid="lora-generating-eta"
              role="status"
              className="ml-auto min-w-0 truncate text-xs text-muted-foreground"
            >
              {eta}
            </p>
          ) : meta ? (
            <p className="ml-auto min-w-0 truncate font-mono text-xs tabular-nums text-muted-foreground">
              {meta}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
