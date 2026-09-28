import { useTranslations } from 'next-intl'

import {
  AudioLines,
  Boxes,
  Film,
  Image as ImageIcon,
  Tag,
} from '@/components/icons'
import type { LucideIcon } from '@/components/icons'
import { PROMPT_OUTPUT_TYPE_LABEL_KEYS } from '@/constants/prompt-library'
import type {
  RecipeTemplateKind,
  TagTemplateSource,
} from '@/lib/recipe-template-kind'
import { cn } from '@/lib/utils'

/** 每种模板一个字形（与画布节点的图标同一套）；标签模板是一枚标签。 */
const KIND_ICONS: Record<RecipeTemplateKind, LucideIcon> = {
  IMAGE: ImageIcon,
  VIDEO: Film,
  AUDIO: AudioLines,
  MODEL_3D: Boxes,
  TAGS: Tag,
}

/** 提示词页 A 的类型徽章（pages/prompts.md）：文字 + 图标，⛔ 彩色徽章。 */
export function PromptTemplateKindBadge({
  kind,
  className,
}: {
  kind: RecipeTemplateKind
  className?: string
}) {
  const t = useTranslations('PromptLibrary')
  const Icon = KIND_ICONS[kind]
  return (
    <span
      className={cn(
        'inline-flex h-5.5 shrink-0 items-center gap-1.25 rounded-full bg-muted px-2 text-2xs font-semibold text-foreground/70',
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {kind === 'TAGS' ? t('typeTags') : t(PROMPT_OUTPUT_TYPE_LABEL_KEYS[kind])}
    </span>
  )
}

const SOURCE_KEYS = {
  tags: 'sourceTagBench',
  prompts: 'sourcePrompts',
} as const

/**
 * 标签模板从哪来（画板 `TgA`）：LoRA 台存的是一枚反色「LoRA」角标 —— 它带的是一整套，
 * 不只是一串标签；另两种写一行灰字。
 */
export function PromptTemplateSourceMark({
  source,
}: {
  source: TagTemplateSource
}) {
  const t = useTranslations('PromptLibrary')
  if (source === 'lora') {
    return (
      <span className="inline-flex h-4.5 shrink-0 items-center rounded-sm bg-foreground px-1.5 font-mono text-2xs font-semibold text-background">
        {t('typeLora')}
      </span>
    )
  }
  return (
    <span className="shrink-0 whitespace-nowrap text-2xs text-muted-foreground">
      {t(SOURCE_KEYS[source])}
    </span>
  )
}
