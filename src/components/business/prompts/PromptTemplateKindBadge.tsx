import { useTranslations } from 'next-intl'

import {
  AudioLines,
  Boxes,
  Film,
  Image as ImageIcon,
  Layers,
} from '@/components/icons'
import type { LucideIcon } from '@/components/icons'
import { PROMPT_OUTPUT_TYPE_LABEL_KEYS } from '@/constants/prompt-library'
import type { RecipeTemplateKind } from '@/lib/recipe-template-kind'
import { cn } from '@/lib/utils'

/** 每种模板一个字形（与画布节点的图标同一套）；LoRA 模板是一叠。 */
const KIND_ICONS: Record<RecipeTemplateKind, LucideIcon> = {
  IMAGE: ImageIcon,
  VIDEO: Film,
  AUDIO: AudioLines,
  MODEL_3D: Boxes,
  LORA: Layers,
}

/**
 * 提示词页 A 的类型徽章（pages/prompts.md）：文字 + 图标，⛔ 彩色徽章。LoRA 模板那一枚
 * 反色 —— 它带的是一整套，不只是一段字。
 */
export function PromptTemplateKindBadge({
  kind,
  className,
}: {
  kind: RecipeTemplateKind
  className?: string
}) {
  const t = useTranslations('PromptLibrary')
  const lora = kind === 'LORA'
  const Icon = KIND_ICONS[kind]
  return (
    <span
      className={cn(
        'inline-flex h-5.5 shrink-0 items-center gap-1.25 rounded-full px-2 text-2xs font-semibold',
        lora ? 'bg-foreground text-background' : 'bg-muted text-foreground/70',
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {lora ? t('typeLora') : t(PROMPT_OUTPUT_TYPE_LABEL_KEYS[kind])}
    </span>
  )
}
