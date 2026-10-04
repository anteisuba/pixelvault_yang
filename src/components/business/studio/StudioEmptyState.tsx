'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, CircleHelp } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { AUDIO_KIND, DEFAULT_AUDIO_KIND } from '@/constants/audio-options'
import { getModelById } from '@/constants/models'
import { resolveAudioKind } from '@/constants/models/audio'
import {
  STUDIO_EMPTY_EXAMPLE_KEYS,
  STUDIO_EMPTY_RECENT_COUNT,
  STUDIO_GUIDE_SEEN_STORAGE_KEY,
} from '@/constants/studio'
import {
  STUDIO_MOBILE_EXAMPLE_KEYS,
  STUDIO_MOBILE_RECENT_COUNT,
} from '@/constants/studio-mobile'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { focusStudioPrompt } from '@/lib/focus-studio-prompt'
import { getGenerationVideoPosterUrl } from '@/lib/generation-media'
import { parseTagChips } from '@/lib/tag-composer'
import { cn } from '@/lib/utils'
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
 * `.studio-workbench-stage:has(...)` 规则的锚点 —— 空态时结果区吃满剩余
 * 高度、内容垂直居中。（`.studio-canvas-slot` 那一份随 dock 于 2026-08-23 退役。）
 */
export function StudioEmptyState({ mode, onRemix }: StudioEmptyStateProps) {
  const t = useTranslations('StudioEmptyState')
  const tMobile = useTranslations('StudioMobile')
  const { state, dispatch } = useStudioForm()
  const { projects, imageUpload } = useStudioData()
  const [guideOpen, setGuideOpen] = useState(false)
  /**
   * 移动端起手屏（owner 2026-09-03 方向 A + 视频需求卡）：
   * 「用途分段（仅视频）+ 标题 + 2×2 示例卡 + 继续创作」。
   *
   * ⚠ 只在图片 / 视频两档换形态 —— 音频的移动端本轮不动，它的示例文案里也没有
   * 第四条（`e4` 只登记在 image / video 两组下）。
   */
  const isMobile = useIsMobile()
  const isMobileStart = isMobile && (mode === 'image' || mode === 'video')
  const isVideo = mode === 'video'

  /**
   * 标签台起手是**几组标签**（owner 2026-09-27）：点一组 = 正向栏换成这一组，
   * ⛔ 不再拿自然语言句子当示例（那一句进标签台只会变成一颗整句的格子）。
   */
  const isTags = mode === 'image' && state.promptDialect === 'tags'
  // Audio splits into speech / sfx: swap the copy + example chips for sound
  // effects so the empty state isn't voice-only. Recent works + tutorial stay
  // keyed to the base mode.
  const contentKey = isTags
    ? 'image_tags'
    : mode === 'audio' && state.audioKind === AUDIO_KIND.SFX
      ? 'audio_sfx'
      : mode

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
      .filter((g) => {
        if (String(g.outputType).toUpperCase() !== expected) return false
        if (mode !== 'audio') return Boolean(g.url)
        // Audio splits by kind: only surface recent works of the active kind.
        // `snapshot.audioKind` isn't loaded in the history list (heavy column),
        // so derive the kind from the model id, which is.
        const model = getModelById(g.model)
        const genKind = model ? resolveAudioKind(model) : DEFAULT_AUDIO_KIND
        return genKind === state.audioKind
      })
      .slice(
        0,
        isMobileStart ? STUDIO_MOBILE_RECENT_COUNT : STUDIO_EMPTY_RECENT_COUNT,
      )
  }, [projects.history, mode, state.audioKind, isMobileStart])

  const handleExample = (prompt: string) => {
    if (isTags) {
      dispatch({
        type: 'SET_TAG_CHIPS',
        payload: { polarity: 'positive', chips: parseTagChips(prompt) },
      })
    } else {
      dispatch({ type: 'SET_PROMPT', payload: prompt })
    }
    focusStudioPrompt()
  }

  /**
   * 点「继续创作」的缩略图 —— 除了照旧走 remix（把提示词/参数填回去），
   * **图本身也进输入框**当参考图（owner 2026-08-14）。少一步「再去挑一次刚
   * 才那张」的往返。
   *
   * ⚠ 只对图片模态做：视频/音频的产物挂成图片参考没有意义，那两个模态的
   * remix 行为保持原样。
   */
  const handleRecent = (gen: GenerationRecord) => {
    onRemix?.(gen)
    if (mode === 'image' && gen.url) {
      void imageUpload.addFromUrl(gen.url)
    }
    focusStudioPrompt()
  }

  return (
    <div className="studio-empty-state flex w-full grow flex-col items-center justify-center gap-5 px-3 py-4 lg:gap-10 lg:px-4 lg:py-6">
      {isMobileStart ? (
        /* 移动端起手屏：一句问句 + 2×2 示例卡。
           卡上只有字（标题 + 两行提示词，owner 2026-10-02 选 Claude / GPT 那一档）——
           ⛔ 不借「继续创作」的真图当封面：那张图与示例说的不是一回事（「胶片人像」
           配便利店夜景），没有历史时又只剩四块像在加载的灰底；真图留给下面那一行。 */
        <div className="flex w-full max-w-md flex-col gap-3">
          <h2 className="text-center text-xl font-semibold text-foreground">
            {isVideo ? tMobile('emptyTitleVideo') : tMobile('emptyTitle')}
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {STUDIO_MOBILE_EXAMPLE_KEYS.map((exampleKey) => (
              <ExampleCard
                key={exampleKey}
                label={t(`examples.${contentKey}.${exampleKey}.label`)}
                excerpt={t(`examples.${contentKey}.${exampleKey}.prompt`)}
                onSelect={() =>
                  handleExample(
                    t(`examples.${contentKey}.${exampleKey}.prompt`),
                  )
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex max-w-2xl flex-col items-center gap-4 text-center sm:gap-5">
          <p className="text-2xs font-medium uppercase tracking-widest text-muted-foreground/70">
            {t(`modeLabel.${contentKey}`)}
          </p>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t(`hint.${contentKey}`)}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {STUDIO_EMPTY_EXAMPLE_KEYS.map((exampleKey) => (
              <button
                key={exampleKey}
                type="button"
                onClick={() =>
                  handleExample(
                    t(`examples.${contentKey}.${exampleKey}.prompt`),
                  )
                }
                className="min-h-11 rounded-full border border-border/60 bg-muted/40 px-4 text-xs text-foreground/90 transition-colors hover:bg-muted sm:min-h-9 sm:text-sm"
              >
                {t(`examples.${contentKey}.${exampleKey}.label`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="w-full max-w-3xl">
          <p className="mb-2 text-center text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('recentLabel')}
          </p>
          <div className="flex justify-start gap-2 overflow-x-auto pb-1 sm:justify-center">
            {recent.map((gen) => (
              <RecentTile
                key={gen.id}
                gen={gen}
                onSelect={handleRecent}
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

// ── 移动端示例卡（只有字）────────────────────────────────────────────

interface ExampleCardProps {
  label: string
  /** 提示词摘录 —— 光有标题看不出「点下去会填进去什么」。 */
  excerpt: string
  onSelect: () => void
}

function ExampleCard({ label, excerpt, onSelect }: ExampleCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="studio-mobile-example-card"
      className={cn(
        'flex w-full flex-col gap-1 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-left',
        'transition-[transform,background-color] duration-fast ease-standard active:scale-[0.98] active:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span className="truncate text-sm font-medium text-foreground">
        {label}
      </span>
      {/* 两行摘录，超出截断 —— 同一行里的两张卡被 grid 拉成等高。 */}
      <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
        {excerpt}
      </span>
    </button>
  )
}

// ── 最近生成缩略块 ──────────────────────────────────────────────────

interface RecentTileProps {
  gen: GenerationRecord
  onSelect: (generation: GenerationRecord) => void
  label: string
}

function RecentTile({ gen, onSelect, label }: RecentTileProps) {
  const promptExcerpt = gen.prompt?.slice(0, 50) ?? ''
  return (
    <button
      type="button"
      onClick={() => onSelect(gen)}
      title={label}
      aria-label={`${label} ${promptExcerpt}`.trim()}
      className="group relative size-20 shrink-0 overflow-hidden rounded-lg border border-border/50 transition-transform duration-200 hover:-translate-y-0.5 lg:size-24"
    >
      {gen.outputType === 'AUDIO' ? (
        <span className="flex size-full items-center justify-center bg-muted/20 text-muted-foreground">
          <AudioLines className="size-7" />
        </span>
      ) : gen.outputType === 'VIDEO' && gen.url ? (
        <video
          src={gen.url}
          poster={getGenerationVideoPosterUrl(gen) ?? undefined}
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
