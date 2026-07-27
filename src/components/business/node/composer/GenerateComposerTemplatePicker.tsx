'use client'

import {
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { ChevronDown, LayoutTemplate } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { OUTPUT_TYPE_ICONS } from '@/components/business/prompts/OutputTypeChip'
import {
  FALLBACK_ICON_CLASSES,
  FALLBACK_WASH_CLASSES,
} from '@/components/business/prompts/PromptTemplateList'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_DEFAULT_FILTER,
  NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTERS,
  NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTER_IDS,
  type GenerateComposerTemplateFilter,
} from '@/constants/node-studio'
import { useRecipes } from '@/hooks/prompts/use-recipes'
import { cn } from '@/lib/utils'
import type { OutputType, RecipeRecord } from '@/types'

function stopCanvasKey(event: ReactKeyboardEvent<HTMLElement>) {
  event.stopPropagation()
}

const KEY_GUARD = {
  onKeyDownCapture: stopCanvasKey,
  onKeyUpCapture: stopCanvasKey,
} as const

/** Same numeric precedent as PromptTemplatePicker's own inspiration search
 *  box (StudioNode.generateComposer 是不同命名空间，但同一约束级别，见
 *  src/components/business/studio/PromptTemplatePicker.tsx 的 200). */
const TEMPLATE_SEARCH_MAX_LENGTH = 200

function matchesQuery(recipe: RecipeRecord, normalizedQuery: string): boolean {
  const haystack = [recipe.name, recipe.compiledPrompt, ...(recipe.tags ?? [])]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
  return haystack.includes(normalizedQuery)
}

interface GenerateComposerTemplatePickerProps {
  /** §5.5 预筛：挂在哪族卡下就只列那个输出类型的模板（同 §3「无效组合从根
   *  上不存在」）。本轮只有 image 会渲染这颗按钮（音频参数条见 §8，尚未接
   *  线），类型不写死成字面量，让这颗组件跟调用方的 mode 解耦。 */
  outputType: OutputType
  /** 当前草稿——只用来在替换前拍一张"撤销快照"，不做其它用途。 */
  promptDraft: string
  /** §5.5「只取提示词文本」：调用方只需要把 compiledPrompt 塞进草稿，这颗
   *  组件不知道、也不碰 modelId / params / referenceAssets / negativePrompt。 */
  onApply(compiledPrompt: string): void
}

/**
 * canvas-generate-composer.md §5.5「从提示词模板取用」——底部参数条里的
 * `▤ 用模板` 按钮 + 浮层。数据与卡形态复用 `/prompts` 现有的（useRecipes 既
 * 有查询链路 + PromptTemplateList 同款无封面字形兜底），浮层材质复用
 * composer 自己的 popover 配方（.canvas-composer-popover）——不新建 API，不
 * 新造卡，只新写"封面优先网格 + 搜索 + 轻筛选 + 替换草稿"这层取用壳。
 */
export function GenerateComposerTemplatePicker({
  outputType,
  promptDraft,
  onApply,
}: GenerateComposerTemplatePickerProps) {
  const t = useTranslations('StudioNode.generateComposer')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<GenerateComposerTemplateFilter>(
    NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_DEFAULT_FILTER,
  )
  // 只在浮层真正打开时才发起（module 级缓存，命中时不会真的再打一次网
  // 络——见 use-recipes.ts），composer 常驻画布，不该在用户从没点过这颗按
  // 钮时就预取。
  const { recipes, isLoading } = useRecipes(open)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      // §5.5 没有规定要记住上次搜索/筛选——每次重开都是一次新的"挑模板"，
      // 沿用陈旧的搜索词反而容易让人以为没结果。
      setQuery('')
      setFilter(NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_DEFAULT_FILTER)
    }
  }

  const scoped = useMemo(
    () => recipes.filter((recipe) => recipe.outputType === outputType),
    [recipes, outputType],
  )

  const filtered = useMemo(() => {
    let base = scoped
    if (filter === NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTER_IDS.recent) {
      // ⚠ Recipe.lastUsedAt 目前全代码库零写入点（见 types/index.ts
      // RecipeRecord 的实读注记）——这条分支在当前数据下大概率恒为空，是既
      // 有数据面的缺口，机制本身按 §5.5 原样对接这个字段。
      base = base
        .filter((recipe) => Boolean(recipe.lastUsedAt))
        .slice()
        .sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))
    } else if (
      filter === NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTER_IDS.mostUsed
    ) {
      base = base
        .filter((recipe) => (recipe.usageCount ?? 0) > 0)
        .slice()
        .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
    }
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return base
    return base.filter((recipe) => matchesQuery(recipe, normalizedQuery))
  }, [scoped, filter, query])

  const handlePick = (recipe: RecipeRecord) => {
    const previous = promptDraft
    onApply(recipe.compiledPrompt)
    setOpen(false)
    // §5.5「插入语义：替换 + 一次撤销」——不做每次弹窗问，替换后给一个短暂
    // 可点的撤销，误操作拿得回来。
    toast.success(t('templateApplied'), {
      action: {
        label: t('templateUndo'),
        onClick: () => onApply(previous),
      },
    })
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...KEY_GUARD}
          aria-expanded={open}
          className="canvas-composer-pill nodrag"
        >
          <LayoutTemplate className="size-3 shrink-0" aria-hidden />
          {t('templateButton')}
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="canvas-composer-popover canvas-composer-template-popover"
        {...KEY_GUARD}
      >
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('templateSearchPlaceholder')}
          maxLength={TEMPLATE_SEARCH_MAX_LENGTH}
          className="canvas-composer-template-search"
        />
        <div className="canvas-composer-template-filters">
          {NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={cn(
                'canvas-composer-seg-btn',
                filter === id && 'canvas-composer-seg-btn--active',
              )}
            >
              {t(`templateFilterLabel.${id}`)}
            </button>
          ))}
        </div>
        <div className="canvas-composer-template-grid">
          {filtered.length === 0 ? (
            <p className="canvas-composer-template-empty">
              {isLoading && scoped.length === 0
                ? t('templateLoading')
                : t('templateEmpty')}
            </p>
          ) : (
            filtered.map((recipe) => (
              <TemplateCard
                key={recipe.id}
                recipe={recipe}
                onPick={() => handlePick(recipe)}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface TemplateCardProps {
  recipe: RecipeRecord
  onPick: () => void
}

/** 封面优先卡——形态同 PromptTemplateList 的 PromptTemplateCard（零重造：无
 *  封面兜底直接复用同一份 FALLBACK_*_CLASSES + OUTPUT_TYPE_ICONS），但内容
 *  按 §5.5 收窄成「标题 + 用过 N 次」，正文（compiledPrompt）退到 hover 才浮
 *  现——composer 浮层比 /prompts 页的网格窄得多，没有余量常显一段提示词。 */
function TemplateCard({ recipe, onPick }: TemplateCardProps) {
  const t = useTranslations('StudioNode.generateComposer')
  const [imageFailed, setImageFailed] = useState(false)
  const hasCover = Boolean(recipe.coverThumbnailUrl) && !imageFailed
  const FallbackIcon = OUTPUT_TYPE_ICONS[recipe.outputType]
  const title = recipe.name || recipe.modelId

  return (
    <button
      type="button"
      {...KEY_GUARD}
      onClick={onPick}
      title={title}
      className="canvas-composer-template-card"
    >
      <span className="canvas-composer-template-card-cover">
        {hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element -- stored generation thumbnails are already optimized R2 derivatives
          <img
            src={recipe.coverThumbnailUrl ?? undefined}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span
            className={cn(
              'canvas-composer-template-card-fallback',
              FALLBACK_WASH_CLASSES[recipe.outputType],
            )}
          >
            <FallbackIcon
              aria-hidden
              className={cn('size-4', FALLBACK_ICON_CLASSES[recipe.outputType])}
            />
          </span>
        )}
        <span className="canvas-composer-template-card-hover">
          {recipe.compiledPrompt}
        </span>
      </span>
      <span className="canvas-composer-template-card-title">{title}</span>
      <span className="canvas-composer-template-card-usage">
        {t('templateUsageCount', { count: recipe.usageCount ?? 0 })}
      </span>
    </button>
  )
}
