'use client'

import { useEffect, useState } from 'react'
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
import { setStudioStageFocus } from '@/lib/studio-stage-focus'
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
 * LoRA 台的结果区（ui-spec ㊲ `LoraBench`，10-25 用户定摆法 B）：台面只放图 —— 这一轮
 * 放正中放大（图格 `MediaTile`：悬停变暗、左下浮出「交给助手」+ 存成模板，点它看大图）；
 * 之前几轮缩成小图排一条在输入框上方，点一张换上来看。
 *
 * ⚠ 生成中 / 失败都在正中那一格里说（加载态 A，「边即进度」跑在格子自己的边上）：
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
  // 底下那条里点过的一张；记着点它那一刻的最新一张 —— 出了新图就让回给新图。
  const [picked, setPicked] = useState<{
    id: string
    newestId: string | null
  } | null>(null)
  // 收尾那一拍：最新那一张已经到了，进度线在它自己的边上合拢；其余时候进度单占一格。
  const finishingId = isCompleting ? (round[0]?.id ?? null) : null
  const pendingTile = (generating && !finishingId) || failure !== null
  const holding = finishingId !== null && !completionReleased && !reduceMotion

  // 台上那一张：生成中 / 失败 = 进度格；否则 = 点过的那张（只在点它之后没出新图时算数），
  // 默认最新一张。底下一条 = 其余的图（新的在前）。
  const newestId = round[0]?.id ?? null
  const pickedItem =
    picked && picked.newestId === newestId
      ? round.find((item) => item.id === picked.id)
      : undefined
  const shown = pendingTile ? null : (pickedItem ?? round[0] ?? null)
  // 放大的那张告诉助手（「这张」= 它，10-25）；生成中没有选中。
  const shownId = shown?.id ?? null
  useEffect(() => {
    setStudioStageFocus(shownId)
    return () => setStudioStageFocus(null)
  }, [shownId])

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

  const strip = round.filter((item) => item.id !== shown?.id)
  const finishing = shown !== null && shown.id === finishingId
  const templateSave =
    shown && !finishing ? templateSaveFor(shown.id) : undefined

  return (
    <div
      data-testid="lora-result-card"
      className="flex min-h-0 flex-1 flex-col gap-3 pb-3"
    >
      <div className="grid min-h-0 flex-1 place-items-center">
        {pendingTile ? (
          <div
            data-testid="lora-result-main"
            className={cn(
              MEDIA_TILE_CLASS,
              'aspect-3/4 h-full max-w-full bg-card ring-1 ring-border',
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
        ) : shown ? (
          <div
            key={shown.id}
            data-testid="lora-result-main"
            className={cn(MEDIA_TILE_CLASS, 'h-full w-fit max-w-full')}
          >
            <motion.img
              src={shown.url}
              alt=""
              initial={finishing ? REVEAL_BLURRED : false}
              animate={holding && finishing ? REVEAL_BLURRED : REVEAL_CLEAR}
              transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
              className="h-full w-auto max-w-full object-contain"
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
                  onClick={() => onOpen(shown.id)}
                  aria-label={t('generate.resultPreviewLabel')}
                  className="absolute inset-0 z-10 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                />
                <MediaTileShade className="z-10" />
                <MediaTileActions
                  handToAssistant={{
                    label: t('generate.handToAssistant'),
                    onClick: () => onAskAssistant(shown.url),
                  }}
                  more={
                    templateSave ? (
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
        ) : null}
      </div>
      {strip.length > 0 ? (
        <div className="shrink-0 overflow-x-auto overscroll-contain">
          <div
            role="list"
            aria-label={t('generate.resultHistoryLabel')}
            className="mx-auto flex w-max gap-2"
          >
            {strip.map((item) => (
              <div key={item.id} role="listitem" className="shrink-0">
                <button
                  type="button"
                  onClick={() => setPicked({ id: item.id, newestId })}
                  aria-label={t('generate.resultShowLabel')}
                  className={cn(
                    MEDIA_TILE_CLASS,
                    'aspect-3/4 h-16 shrink-0 transition-opacity duration-fast ease-standard hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt=""
                    className="size-full object-cover"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {eta ? (
        <p
          data-testid="lora-generating-eta"
          role="status"
          className="text-center text-xs text-muted-foreground"
        >
          {eta}
        </p>
      ) : null}
    </div>
  )
}
