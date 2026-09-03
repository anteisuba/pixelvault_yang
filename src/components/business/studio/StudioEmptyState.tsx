'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, CircleHelp } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

import { StudioVideoModeToggle } from '@/components/business/studio/StudioVideoModeToggle'
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

  // Audio splits into speech / sfx: swap the copy + example chips for sound
  // effects so the empty state isn't voice-only. Recent works + tutorial stay
  // keyed to the base mode.
  const contentKey =
    mode === 'audio' && state.audioKind === AUDIO_KIND.SFX ? 'audio_sfx' : mode

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
    dispatch({ type: 'SET_PROMPT', payload: prompt })
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
    <div className="studio-empty-state flex w-full grow flex-col items-center justify-center gap-8 px-4 py-6 sm:gap-10">
      {isMobileStart ? (
        /* 移动端起手屏：（视频档多一条用途分段）+ 一句问句 + 2×2 示例卡。
           卡片封面优先借「继续创作」里那几张真图 —— 没有历史时退回按序号变化的
           token 渐变底，不摆一个假缩略图、也不留一块灰。 */
        <div className="flex w-full max-w-md flex-col gap-5">
          {/* 用途是**栏首第一决策**：它决定这一次发哪个端点、模型 chip 列哪些
              候选。放在示例卡下面就等于让人先选完再回头改前提。
              ⚠ 组件自己判「目录里真有 ≥2 档」，少于 2 档整颗不渲染。 */}
          {isVideo ? (
            <div
              data-testid="studio-mobile-video-mode"
              className="flex justify-center"
            >
              <StudioVideoModeToggle />
            </div>
          ) : null}
          <h2 className="text-center text-xl font-semibold text-foreground">
            {isVideo ? tMobile('emptyTitleVideo') : tMobile('emptyTitle')}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {STUDIO_MOBILE_EXAMPLE_KEYS.map((exampleKey, index) => (
              <ExampleCard
                key={exampleKey}
                index={index}
                wide={isVideo}
                label={t(`examples.${mode}.${exampleKey}.label`)}
                excerpt={t(`examples.${mode}.${exampleKey}.prompt`)}
                // ⚠ 视频借的是缩略图不是 `url`：把 mp4 塞进 <img> 只会得到一个
                //    坏掉的图标。素材域记过「视频零缩略图」，所以常态是 null →
                //    走渐变底。
                coverUrl={
                  (isVideo
                    ? recent[index]?.thumbnailUrl
                    : recent[index]?.url) ?? null
                }
                onSelect={() =>
                  handleExample(t(`examples.${mode}.${exampleKey}.prompt`))
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
          <div className="flex justify-center gap-2 overflow-x-auto pb-1">
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

// ── 移动端示例卡（图片 3:4 / 视频 16:9）────────────────────────────

interface ExampleCardProps {
  label: string
  /** 提示词的一行摘录 —— 光有标题看不出「点下去会填进去什么」。 */
  excerpt: string
  /** 第几张：渐变的色相按序号错开，四张才不是同一块底。 */
  index: number
  /** 视频档的封面是 16:9，图片档是 3:4。 */
  wide?: boolean
  /** 封面：借「继续创作」里的真图；没有则用 token 渐变底。 */
  coverUrl: string | null
  onSelect: () => void
}

/**
 * 没有历史图时的底 —— **不是一块灰**。四张各自的主色浓度按序号错开，一眼看得
 * 出是四张卡而不是四个待加载的占位。
 *
 * ⚠ 只用 `color-mix` 拌既有 token（`--primary` / `--muted` / `--secondary`），
 * 不引入新色值：暗色档跟着 token 一起翻，不需要第二套写法。
 * ⚠ 写在 `style` 里而不是 Tailwind 类：百分比随序号变，做成工具类就是 Hard
 * Rule 5 禁的任意值。
 */
function exampleCardGradient(index: number): string {
  const primaryPct = 10 + index * 7
  const tailPct = 6 + index * 4
  return [
    'linear-gradient(140deg,',
    `color-mix(in oklab, var(--primary) ${primaryPct}%, var(--muted)) 0%,`,
    `color-mix(in oklab, var(--secondary) ${100 - tailPct}%, var(--primary)) 100%)`,
  ].join(' ')
}

function ExampleCard({
  label,
  excerpt,
  index,
  wide,
  coverUrl,
  onSelect,
}: ExampleCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="studio-mobile-example-card"
      className={cn(
        'group flex w-full flex-col overflow-hidden rounded-xl border border-border/60 bg-background text-left',
        'transition-transform duration-fast ease-standard active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
      )}
    >
      <span
        className={cn(
          'relative block w-full',
          wide ? 'aspect-video' : 'aspect-[3/4]',
        )}
        style={
          coverUrl ? undefined : { background: exampleCardGradient(index) }
        }
      >
        {coverUrl ? (
          <OptimizedImage
            src={coverUrl}
            alt=""
            fill
            sizes="50vw"
            className="object-cover"
            loading="lazy"
          />
        ) : null}
      </span>
      <span className="flex flex-col gap-0.5 px-2.5 pb-2 pt-1.5">
        <span className="truncate text-xs font-medium text-foreground">
          {label}
        </span>
        {/* 一行摘录 —— 超出就截断，永远只占一行，四张卡才等高。 */}
        <span className="truncate text-2xs text-muted-foreground">
          {excerpt}
        </span>
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
      className="group relative size-20 shrink-0 overflow-hidden rounded-lg border border-border/50 transition-transform duration-200 hover:-translate-y-0.5 sm:size-24"
    >
      {gen.outputType === 'AUDIO' ? (
        <span className="flex size-full items-center justify-center bg-muted/20 text-muted-foreground">
          <AudioLines className="size-7" />
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
