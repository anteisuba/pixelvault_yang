'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  STUDIO_EMPTY_EXAMPLE_KEYS,
  STUDIO_EMPTY_RECENT_COUNT,
  STUDIO_GUIDE_SEEN_STORAGE_KEY,
} from '@/constants/studio'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { focusStudioPrompt } from '@/lib/focus-studio-prompt'
import type { GenerationRecord } from '@/types'

import { XiaoheiGuideCarousel } from '@/components/business/studio-shared/XiaoheiGuideCarousel'
import { OptimizedImage } from '@/components/ui/optimized-image'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'

type StudioEmptyMode = 'image' | 'video' | 'audio'

interface StudioEmptyStateProps {
  mode: StudioEmptyMode
  onRemix?: (generation: GenerationRecord) => void
}

const EXPECTED_OUTPUT_TYPE: Record<StudioEmptyMode, string> = {
  image: 'IMAGE',
  video: 'VIDEO',
  audio: 'AUDIO',
}

/**
 * StudioEmptyState — 画布空态的「起手势」（2026-07-05 方案 A，替代常驻教程轮播）。
 *
 * 三段式：一句模式说明 + 示例 prompt chips（点击填入并聚焦输入框）、
 * 「继续创作」最近生成缩略图行（点击走 remix，与 StudioGallery 同路径）、
 * 教程「?」入口（Dialog 复用 XiaoheiGuideCarousel；首次访问自动弹一次，
 * localStorage 记忆，之后只能手动打开）。
 *
 * 布局注意：根元素的 `.studio-empty-state` 类是 globals.css 里
 * `.studio-canvas-slot:has(...)` 规则的锚点 —— 空态时画布槽吃满剩余
 * 视口高度、内容垂直居中，保证 canvas + dock 首屏完整可见。
 */
export function StudioEmptyState({ mode, onRemix }: StudioEmptyStateProps) {
  const t = useTranslations('StudioEmptyState')
  const { dispatch } = useStudioForm()
  const { projects } = useStudioData()
  const [guideOpen, setGuideOpen] = useState(false)

  // 首访自动弹一次教程。标记在用户关闭教程时才写（handleGuideOpenChange）：
  // 打开时就写会让 dev StrictMode 的卸载重挂载把刚打开的对话框吞掉，
  // 也意味着"弹过但没看完"的用户下次还能看到。storage 不可用时静默跳过。
  const autoOpenCheckedRef = useRef(false)
  useEffect(() => {
    if (autoOpenCheckedRef.current) return
    autoOpenCheckedRef.current = true
    try {
      if (!localStorage.getItem(STUDIO_GUIDE_SEEN_STORAGE_KEY)) {
        // One-time localStorage hydration is an external browser sync on mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setGuideOpen(true)
      }
    } catch {
      // localStorage 不可用（隐私模式等）—— 不自动弹，教程仍可从「?」打开。
    }
  }, [])

  const handleGuideOpenChange = (open: boolean) => {
    setGuideOpen(open)
    if (!open) {
      try {
        localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
      } catch {
        // 写不进标记只影响下次是否自动弹，忽略。
      }
    }
  }

  const recent = useMemo(() => {
    const expected = EXPECTED_OUTPUT_TYPE[mode]
    return projects.history
      .filter(
        (g) =>
          String(g.outputType).toUpperCase() === expected &&
          (mode === 'audio' || Boolean(g.url)),
      )
      .slice(0, STUDIO_EMPTY_RECENT_COUNT)
  }, [projects.history, mode])

  const handleExample = (prompt: string) => {
    dispatch({ type: 'SET_PROMPT', payload: prompt })
    focusStudioPrompt()
  }

  return (
    <div className="studio-empty-state flex w-full grow flex-col items-center justify-center gap-8 px-4 py-6 sm:gap-10">
      <div className="flex max-w-2xl flex-col items-center gap-4 text-center sm:gap-5">
        <p className="text-2xs font-medium uppercase tracking-widest text-muted-foreground/70">
          {t(`modeLabel.${mode}`)}
        </p>
        <p className="text-sm text-muted-foreground sm:text-base">
          {t(`hint.${mode}`)}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {STUDIO_EMPTY_EXAMPLE_KEYS.map((exampleKey) => (
            <button
              key={exampleKey}
              type="button"
              onClick={() =>
                handleExample(t(`examples.${mode}.${exampleKey}.prompt`))
              }
              className="min-h-11 rounded-full border border-border/60 bg-muted/40 px-4 text-xs text-foreground/90 transition-colors hover:bg-muted sm:min-h-9 sm:text-sm"
            >
              {t(`examples.${mode}.${exampleKey}.label`)}
            </button>
          ))}
        </div>
      </div>

      {recent.length > 0 && (
        <div className="w-full max-w-3xl">
          <p className="mb-2 text-center text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('recentLabel')}
          </p>
          <div className="flex justify-center gap-2 overflow-x-auto pb-1">
            {recent.map((gen) => (
              <RecentTile
                key={gen.id}
                gen={gen}
                onRemix={onRemix}
                label={t('recentRemixHint')}
              />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setGuideOpen(true)}
        className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs text-muted-foreground/80 transition-colors hover:text-foreground sm:min-h-9"
      >
        <CircleHelp className="size-3.5" />
        {t('guideButton')}
      </button>

      <ResponsiveDialog open={guideOpen} onOpenChange={handleGuideOpenChange}>
        <ResponsiveDialogContent className="sm:max-w-3xl">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('guideDialogTitle')}
            </ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <XiaoheiGuideCarousel key={mode} guideId={mode} />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  )
}

// ── 最近生成缩略块 ──────────────────────────────────────────────────

interface RecentTileProps {
  gen: GenerationRecord
  onRemix?: (generation: GenerationRecord) => void
  label: string
}

function RecentTile({ gen, onRemix, label }: RecentTileProps) {
  const promptExcerpt = gen.prompt?.slice(0, 50) ?? ''
  return (
    <button
      type="button"
      onClick={() => onRemix?.(gen)}
      title={label}
      aria-label={`${label} ${promptExcerpt}`.trim()}
      className="group relative size-20 shrink-0 overflow-hidden rounded-lg border border-border/50 transition-transform duration-200 hover:-translate-y-0.5 sm:size-24"
    >
      {gen.outputType === 'AUDIO' ? (
        <span className="flex size-full items-center justify-center bg-muted/20 text-xl">
          🎵
        </span>
      ) : gen.outputType === 'VIDEO' && gen.url ? (
        <video
          src={gen.url}
          poster={gen.thumbnailUrl ?? gen.previewUrl ?? undefined}
          muted
          playsInline
          preload="none"
          className="size-full object-cover"
        />
      ) : gen.url ? (
        <OptimizedImage
          src={gen.url}
          alt={promptExcerpt}
          fill
          sizes="96px"
          className="object-cover"
          loading="lazy"
        />
      ) : null}
    </button>
  )
}
