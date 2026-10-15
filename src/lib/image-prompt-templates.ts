import {
  IMAGE_PROMPT_TEMPLATES,
  IMAGE_PROMPT_TEMPLATE_IDS,
  type ImagePromptTemplateId,
} from '@/constants/image-prompt-templates'

/**
 * `/` 模板的读与套（node-canvas-v2 §3）。纯函数：发送口、发送读数、助手快照、
 * 出完自动切共用同一份判据，⛔ 各处自己判 `promptTemplate === 'grid3'`。
 */

export function isImagePromptTemplateId(
  value: unknown,
): value is ImagePromptTemplateId {
  return (IMAGE_PROMPT_TEMPLATE_IDS as readonly unknown[]).includes(value)
}

/** 这一枪发几张：有模板按模板钉死，否则按张数（至少 1）。 */
export function imageSubmitCount(params: {
  readonly promptTemplate?: ImagePromptTemplateId
  readonly count?: number
}): number {
  return params.promptTemplate
    ? IMAGE_PROMPT_TEMPLATES[params.promptTemplate].count
    : Math.max(params.count ?? 1, 1)
}

/**
 * 你写的那一句接进模板全文。`shot`（0 起）只对逐张出的模板有意义。
 * 空句不套（没东西可讲，交给调用方拦）。
 */
export function wrapImagePromptTemplate(
  template: ImagePromptTemplateId,
  story: string,
  shot = 0,
): string {
  const trimmed = story.trim()
  if (!trimmed) return story
  const { count, prompt } = IMAGE_PROMPT_TEMPLATES[template]
  return prompt
    .replace('{story}', trimmed)
    .replaceAll('{shot}', String(shot + 1))
    .replaceAll('{total}', String(count))
}
