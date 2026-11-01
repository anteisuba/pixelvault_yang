import type { TagChip } from '@/types/tag-composer'
import { isStyleMediumTag } from '@/lib/tag-lookup'

/**
 * 通用「存成模板」框里「存哪些」没勾的几格，从这一台的参数里摘掉（owner 11-01）。
 *
 * - `negative` = 负面（总的 + 每位角色的）
 * - `characters` = 标签台各角色（`novelAiLayout`）
 * - `lora` = LoRA 台挂载（`advancedParams.loras` + `loraSetup`）
 * - `params` = 其余参数（比例、步数、CFG……）
 *
 * 没出现在 `include` 里的格子当作勾上。
 */
export function pickTemplateParams(
  params: Record<string, unknown>,
  include: Record<string, boolean>,
): Record<string, unknown> {
  const rawAdvanced = params.advancedParams
  const advanced: Record<string, unknown> =
    rawAdvanced &&
    typeof rawAdvanced === 'object' &&
    !Array.isArray(rawAdvanced)
      ? { ...(rawAdvanced as Record<string, unknown>) }
      : {}
  const out: Record<string, unknown> = { ...params }

  if (include.characters === false) delete advanced.novelAiLayout
  if (include.lora === false) {
    delete advanced.loras
    delete out.loraSetup
  }
  if (include.negative === false) {
    delete advanced.negativePrompt
    const layout = advanced.novelAiLayout as
      | { characters?: Array<Record<string, unknown>> }
      | undefined
    if (layout?.characters)
      advanced.novelAiLayout = {
        ...layout,
        characters: layout.characters.map((character) => ({
          ...character,
          negativePrompt: '',
        })),
      }
  }
  if (include.params === false) {
    delete out.aspectRatio
    for (const key of Object.keys(advanced))
      if (!['negativePrompt', 'novelAiLayout', 'loras'].includes(key))
        delete advanced[key]
  }

  if (rawAdvanced !== undefined || Object.keys(advanced).length > 0)
    out.advancedParams = advanced
  return out
}

/** 一串标签里的画风那几格：画师（`artist:`）+ 画法（`*_(medium)` 等）。 */
export function styleChipsOf(chips: readonly TagChip[]): TagChip[] {
  return chips.filter((chip) => {
    const text = chip.text.trim().toLowerCase()
    return (
      text.startsWith('artist:') || isStyleMediumTag(text.replace(/\s+/g, '_'))
    )
  })
}
