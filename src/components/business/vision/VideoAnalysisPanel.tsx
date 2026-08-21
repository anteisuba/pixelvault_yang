'use client'

import { useCallback, useState } from 'react'
import { ScanEye, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { RESEARCH_CONCLUSION_BASES } from '@/constants/research'
import {
  VIDEO_ANALYSIS_MODES,
  VIDEO_FRAME_CAPTURE_REASONS,
  VIDEO_FRAME_PLAN,
  type VideoFrameCaptureReason,
} from '@/constants/video-analysis'
import {
  VISION_TASKS,
  VISION_TASK_VALUES,
  type VisionBasis,
  type VisionTask,
} from '@/constants/vision'
import { useVideoFrameAnalysis } from '@/hooks/use-video-frame-analysis'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

/**
 * 「分析这个视频」的 UI 落点（AI 导演内核 · 切片 2 · §4.3 的最后一米）。
 *
 * 管线上一批就通了（`captureVideoFrames` → `useVideoFrameAnalysis` →
 * `POST /api/vision/analyze-video`），缺的只是一个入口。这个面板就是那个入口：
 * **抽帧在浏览器、分析在服务端、结论如实带出处**。
 *
 * ── 三条如实汇报的规矩 ─────────────────────────────────────────────
 * 1. **抽帧要几秒，进行中态必须分两段**（抽帧 / 分析）：8 次 seek + 编码在慢机器上
 *    能到十几秒，一个笼统的「处理中」会让人以为卡死了。
 * 2. ⛔ **抽帧失败绝不静默**。失败时 hook 仍会把请求发出去（服务端可能有能直接看
 *    视频的路），但「这一轮没抽到帧」是用户有权知道的事 —— 尤其
 *    `tainted-canvas`：🔬 `*.vercel.app` 预览部署不在 R2 的 CORS 允许名单里，
 *    那里**必然**抽不到帧，修法是加 origin 不是换视频。文案按原因码分开写。
 * 3. **回执写清这一轮看了什么**：读了 8 帧还是读了视频本体、有没有因为片长降级、
 *    有没有借别的模型的路。一句「分析完成」等于把这三件事全藏起来。
 */

/** 任务 → i18n key。⛔ 穷举 Record 无兜底：加了任务而忘了文案，编译期就红。 */
const TASK_LABEL_KEYS: Record<VisionTask, string> = {
  [VISION_TASKS.characterIdentity]: 'task.characterIdentity',
  [VISION_TASKS.styleStudy]: 'task.styleStudy',
  [VISION_TASKS.qualityReview]: 'task.qualityReview',
  [VISION_TASKS.compare]: 'task.compare',
}

/** basis → i18n key。视觉线只有三态（没有 `source`，看图得不到出处）。 */
const BASIS_LABEL_KEYS: Record<VisionBasis, string> = {
  [RESEARCH_CONCLUSION_BASES.observation]: 'basis.observation',
  [RESEARCH_CONCLUSION_BASES.inference]: 'basis.inference',
  [RESEARCH_CONCLUSION_BASES.unknown]: 'basis.unknown',
}

/**
 * 抽帧失败原因 → i18n key。⛔ 穷举、⛔ 无兜底 —— 六条原因六种修法，
 * 兜底成一句「抽帧失败」会把用户引到唯一无效的那条路（换个视频重试）。
 */
const CAPTURE_REASON_KEYS: Record<VideoFrameCaptureReason, string> = {
  [VIDEO_FRAME_CAPTURE_REASONS.unsupportedEnvironment]:
    'captureReason.unsupportedEnvironment',
  [VIDEO_FRAME_CAPTURE_REASONS.loadFailed]: 'captureReason.loadFailed',
  [VIDEO_FRAME_CAPTURE_REASONS.unreadableDuration]:
    'captureReason.unreadableDuration',
  [VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas]: 'captureReason.taintedCanvas',
  [VIDEO_FRAME_CAPTURE_REASONS.timeout]: 'captureReason.timeout',
  [VIDEO_FRAME_CAPTURE_REASONS.encodeFailed]: 'captureReason.encodeFailed',
}

interface VideoAnalysisPanelProps {
  /** 视频本体的 URL。必须是 R2 / CDN 直链 —— 抽帧要它带 CORS 头。 */
  videoUrl: string
  /** 落 `ResearchRun.projectId`，回看时按文件夹找得到这一轮。 */
  projectId?: string | null
}

export function VideoAnalysisPanel({
  videoUrl,
  projectId,
}: VideoAnalysisPanelProps) {
  const t = useTranslations('VideoAnalysis')
  const tErrors = useTranslations('Errors')
  const [task, setTask] = useState<VisionTask>(VISION_TASKS.qualityReview)
  const { phase, result, error, captureFailure, run } = useVideoFrameAnalysis()

  const isBusy = phase === 'extracting' || phase === 'analyzing'

  const handleRun = useCallback(() => {
    void run({
      task,
      video: videoUrl,
      // ⚠ 素材页没有自己的助手 surface（AssistantSurface 是 Prisma enum，新增一个
      //   要 migration）。视频分析归到 VIDEO_STUDIO —— 它就是视频域的活，
      //   ⛔ 别为了「素材页」这三个字造第五个 surface。
      surface: ASSISTANT_SURFACE_IDS.videoStudio,
      ...(projectId ? { projectId } : {}),
    })
  }, [projectId, run, task, videoUrl])

  return (
    <section className="mt-5 space-y-3 border-t border-border/60 pt-5">
      <div className="space-y-1">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <ScanEye className="size-4" />
          {t('title')}
        </h3>
        <p className="text-xs leading-5 text-muted-foreground">
          {t('description', { count: VIDEO_FRAME_PLAN.frameCount })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={task}
          onValueChange={(next) => setTask(next as VisionTask)}
        >
          <SelectTrigger
            className="h-8 flex-1 text-xs"
            aria-label={t('taskLabel')}
            disabled={isBusy}
          >
            {/* 显式给 children：⛔ 别依赖 Radix 从 item 反查文案 —— 那要 content
                挂载过一次，closed-first 的场景下会显示成空白。 */}
            <SelectValue>{t(TASK_LABEL_KEYS[task])}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {VISION_TASK_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(TASK_LABEL_KEYS[value])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={handleRun}
          disabled={isBusy}
        >
          {isBusy ? <Spinner size="md" /> : null}
          {phase === 'done' || phase === 'error' ? t('rerun') : t('run')}
        </Button>
      </div>

      {isBusy ? (
        <p className="text-xs leading-5 text-muted-foreground" role="status">
          {phase === 'extracting'
            ? t('extracting', { count: VIDEO_FRAME_PLAN.frameCount })
            : t('analyzing')}
        </p>
      ) : null}

      {/*
       * ⛔ 抽帧失败不静默：不管这一轮最后成没成，只要没抽到帧就说出来 ——
       * 「成功了」和「用整段视频硬看出来的」是两件不同的事。
       */}
      {captureFailure ? (
        <div className="space-y-1 rounded-lg border border-border/70 bg-muted/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <TriangleAlert className="size-3.5" />
            {t('captureFailedTitle')}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {t(CAPTURE_REASON_KEYS[captureFailure])}
          </p>
        </div>
      ) : null}

      {phase === 'error' && error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-5 text-foreground">
          {getApiErrorMessage(
            tErrors,
            {
              error: error.message,
              ...(error.errorCode ? { errorCode: error.errorCode } : {}),
              ...(error.i18nKey ? { i18nKey: error.i18nKey } : {}),
            },
            t('failed'),
          )}
        </p>
      ) : null}

      {phase === 'done' && result ? (
        <div className="space-y-3">
          <ul className="space-y-2">
            {result.conclusions.map((conclusion, index) => (
              <li
                key={`${String(index)}-${conclusion.statement.slice(0, 24)}`}
                className="rounded-lg border border-border/60 bg-card p-3"
              >
                <Badge
                  variant={
                    conclusion.basis === RESEARCH_CONCLUSION_BASES.observation
                      ? 'secondary'
                      : 'outline'
                  }
                  className="mb-1.5"
                >
                  {t(BASIS_LABEL_KEYS[conclusion.basis])}
                </Badge>
                <p className="text-xs leading-5 break-words text-foreground">
                  {conclusion.statement}
                </p>
              </li>
            ))}
          </ul>

          {result.conclusions.length === 0 ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {t('emptyResult')}
            </p>
          ) : null}

          {result.observations.uncertainties.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                {t('uncertainties')}
              </p>
              <ul className="list-disc space-y-1 pl-4">
                {result.observations.uncertainties.map((item) => (
                  <li
                    key={item}
                    className="text-xs leading-5 text-muted-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 回执：这一轮到底看了什么。⛔ 一句「分析完成」等于把它全藏起来。 */}
          <ul className="space-y-1 border-t border-border/60 pt-2 text-xs leading-5 text-muted-foreground">
            <li>
              {result.mode === VIDEO_ANALYSIS_MODES.frames
                ? t('receiptFrames', {
                    count: VIDEO_FRAME_PLAN.frameCount,
                    version: VIDEO_FRAME_PLAN.planVersion,
                  })
                : t('receiptNative')}
            </li>
            <li>{t('receiptModel', { model: result.model })}</li>
            {result.downgraded ? <li>{t('receiptDowngraded')}</li> : null}
            {result.borrowedRoute ? <li>{t('receiptBorrowed')}</li> : null}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
