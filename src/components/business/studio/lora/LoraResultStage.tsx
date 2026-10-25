'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { BookmarkPlus, Check, X } from '@/components/icons'
import {
  StudioGeneratingProgress,
  type StudioGenerationFailure,
} from '@/components/business/studio-shared'
import {
  MEDIA_TILE_CLASS,
  MEDIA_TILE_ROUND_CLASS,
  MediaTileActions,
  MediaTileShade,
} from '@/components/ui/media-tile'
import { Spinner } from '@/components/ui/spinner'
import { DURATION, EASE_STANDARD, RESULT_REVEAL } from '@/constants/motion'
import { cn } from '@/lib/utils'

export interface LoraResultRoundItem {
  readonly id: string
  readonly url: string
}

export interface LoraResultTemplateSave {
  state: 'idle' | 'saving' | 'saved'
  onSave: () => void
}

interface LoraResultStageProps {
  /** 这次出的图，新的在前。 */
  round: readonly LoraResultRoundItem[]
  /** 生成中（还没到图）：最前面多一格进度。 */
  generating: boolean
  /** 刚出图还在演收尾那一拍：最新那一张压在白纱下，线松手时变清。 */
  isCompleting: boolean
  completionReleased: boolean
  onEdgeRelease: () => void
  onCompleteAnimationDone: () => void
  elapsedSeconds: number
  stageLabel: string
  /** 新生成那一行参数（「18s · 底模 · 3:4」）。 */
  paramsLine?: string
  /** 没出图：最前面那一格线停住变灰 + 原因 + 重试（加载态 A）。 */
  failure: StudioGenerationFailure | null
  onCancel?: () => void
  /** 点一格：看大图。 */
  onOpen: (id: string) => void
  onAskAssistant: (url: string) => void
  /** 「存成模板」（pages/prompts.md）：这一张出图那一刻的整套；记不着整套的格子不给。 */
  templateSaveFor: (id: string) => LoraResultTemplateSave | undefined
  /** 还没出过图时台面中间那一句。 */
  hint: string
  /** Runner 线路生成中的耗时预估。 */
  eta: string | null
}

const REVEAL_BLURRED = {
  filter: `blur(${RESULT_REVEAL.blurPx}px)`,
  scale: RESULT_REVEAL.fromScale,
} as const
const REVEAL_CLEAR = { opacity: 1, filter: 'blur(0px)', scale: 1 } as const

/**
 * LoRA 台的结果区（ui-spec ㊲ `LoraBench`）：台面只放图 —— 这次出的图一行 4 张（图格
 * `MediaTile`：干净无框，悬停变暗、左下浮出「交给助手」+ 存成模板），点一格看大图。
 *
 * ⚠ 生成中 / 失败都在最前面那一格里说（加载态 A，「边即进度」跑在格子自己的边上）：
 *   ⛔ 不弹 toast、⛔ 不把失败写进输入框。
 * ⭐ 新图由糊变清（与图片台同一套 `RESULT_REVEAL`）：出图那一拍到的新图先在白纱下
 *   糊着，线松手时白纱撤、图变清。
 */
export function LoraResultStage({
  round,
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
  onOpen,
  onAskAssistant,
  templateSaveFor,
  hint,
  eta,
}: LoraResultStageProps) {
  const t = useTranslations('LoraWorkbench')
  const tCancel = useTranslations('GenerationCancel')
  const reduceMotion = useReducedMotion()
  // 收尾那一拍：最新那一张已经到了，进度线在它自己的边上合拢；其余时候进度单占一格。
  const finishingId = isCompleting ? (round[0]?.id ?? null) : null
  const pendingTile = (generating && !finishingId) || failure !== null
  const holding = finishingId !== null && !completionReleased && !reduceMotion

  if (!pendingTile && round.length === 0) {
    return (
      <p
        data-testid="lora-result-card"
        className="grid min-h-0 flex-1 place-items-center text-2sm text-muted-foreground/70"
      >
        {hint}
      </p>
    )
  }

  const progress = (onMedia: boolean) => (
    <StudioGeneratingProgress
      elapsedSeconds={elapsedSeconds}
      stageLabel={stageLabel}
      paramsLine={onMedia ? undefined : paramsLine}
      variant={onMedia ? 'compact' : 'full'}
      cornerRadiusVar="--radius-12"
      isCompleting={isCompleting}
      onEdgeRelease={onEdgeRelease}
      onCompleteAnimationDone={onCompleteAnimationDone}
      failure={failure}
    />
  )

  return (
    <div
      data-testid="lora-result-card"
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4"
    >
      <div
        role="list"
        aria-label={t('generate.resultHistoryLabel')}
        className="grid grid-cols-4 gap-2.5"
      >
        {pendingTile ? (
          <div
            role="listitem"
            className={cn(
              MEDIA_TILE_CLASS,
              'aspect-3/4 bg-card ring-1 ring-border',
            )}
          >
            {progress(false)}
            {generating && onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                data-testid="lora-generation-cancel"
                aria-label={tCancel('cancel')}
                className={cn(
                  MEDIA_TILE_ROUND_CLASS,
                  'absolute top-2 right-2 z-20',
                )}
              >
                <X aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
        {round.map((item) => {
          const finishing = item.id === finishingId
          const templateSave = finishing ? undefined : templateSaveFor(item.id)
          return (
            <div
              key={item.id}
              role="listitem"
              className={cn(MEDIA_TILE_CLASS, 'aspect-3/4')}
            >
              <motion.img
                src={item.url}
                alt=""
                initial={finishing ? REVEAL_BLURRED : false}
                animate={holding && finishing ? REVEAL_BLURRED : REVEAL_CLEAR}
                transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
                className="size-full object-cover"
              />
              {finishing ? (
                <>
                  <div
                    aria-hidden
                    className={cn(
                      'absolute inset-0 bg-background/60 transition-opacity duration-base ease-linear motion-reduce:transition-none',
                      completionReleased && 'opacity-0',
                    )}
                  />
                  {progress(true)}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onOpen(item.id)}
                    aria-label={t('generate.resultPreviewLabel')}
                    className="absolute inset-0 z-10 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  />
                  <MediaTileShade className="z-10" />
                  <MediaTileActions
                    handToAssistant={{
                      label: t('generate.handToAssistant'),
                      onClick: () => onAskAssistant(item.url),
                    }}
                    more={
                      templateSave ? (
                        <button
                          type="button"
                          data-testid="lora-save-template"
                          onClick={templateSave.onSave}
                          disabled={templateSave.state !== 'idle'}
                          aria-busy={
                            templateSave.state === 'saving' || undefined
                          }
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
                            MEDIA_TILE_ROUND_CLASS,
                            'pointer-events-auto',
                          )}
                        >
                          {templateSave.state === 'saving' ? (
                            <Spinner size="sm" />
                          ) : templateSave.state === 'saved' ? (
                            <Check aria-hidden />
                          ) : (
                            <BookmarkPlus aria-hidden />
                          )}
                        </button>
                      ) : undefined
                    }
                  />
                </>
              )}
            </div>
          )
        })}
      </div>
      {eta ? (
        <p
          data-testid="lora-generating-eta"
          role="status"
          className="mt-2.5 text-xs text-muted-foreground"
        >
          {eta}
        </p>
      ) : null}
    </div>
  )
}
