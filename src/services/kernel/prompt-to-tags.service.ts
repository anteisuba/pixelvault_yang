import 'server-only'

import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { parsePromptToTagsOutput } from '@/lib/tag-composer'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { checkNovelAiPromptTags } from '@/services/novelai-tags.service'
import { ensureUser } from '@/services/user.service'
import type {
  PromptToTagsRequest,
  PromptToTagsResponseData,
} from '@/types/tag-composer'

/**
 * **自然语言带到标签台时，让助手翻成标签**（owner 2026-09-27）。
 *
 * 与「润色」（`prompt-enhance.service` 的标签档）是两件事：润色会补质量词、调顺序、
 * 往里加东西；这里只**照原意直译** —— 原句里没有的一个都不加。
 */
const PROMPT_TO_TAGS_SYSTEM_PROMPT = `You convert an image description into a Danbooru tag list for tag-based anime diffusion models (NovelAI, PixAI).

Rules:
- Output ONLY a comma-separated list of English Danbooru tags. No sentences, no numbering, no quotes, no commentary.
- Translate what the description says, faithfully: every tag must name something the description states. Do NOT add quality tags (masterpiece, best quality, absurdres…), artists, styles, or anything you would only infer (no "puddle" for a rainy street, no "winter" for snow).
- People get count tags (1girl, 2boys) plus "solo" for one person, never a bare "girl" or "boy". No people at all: "no humans". Animals are plain tags ("cat"), never "1cat".
- Use real Danbooru tag spellings: lowercase, spaces instead of underscores, e.g. "1girl, solo, long hair, school uniform, rain, night, city street".
- Keep the names the user wrote. A known character becomes its Danbooru character tag, e.g. "denia (wuthering waves)"; an unknown name stays as written.
- Order: subject count, character, appearance, outfit, pose, expression, then scene, background, lighting.`

export async function translatePromptToTags(
  clerkId: string,
  input: PromptToTagsRequest,
): Promise<PromptToTagsResponseData> {
  const user = await ensureUser(clerkId)
  const route = await resolveLlmTextRoute(user.id)
  const raw = await llmTextCompletion({
    systemPrompt: PROMPT_TO_TAGS_SYSTEM_PROMPT,
    userPrompt: input.prompt,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })

  // ⚠ 回的不是一串标签（回了一段话）就报错，调用方退回「整句一格」，
  //   ⛔ 不把半截结果当成功。
  const tags = parsePromptToTagsOutput(raw)
  if (!tags) {
    logger.warn('prompt to tags: model did not return a tag list', {
      length: raw.length,
    })
    throw new ApiRequestError(
      'PROMPT_TAGS_UNUSABLE',
      502,
      'errors.promptTags.unusable',
      'The model did not return a tag list',
    )
  }
  const translated = tags.join(', ')

  /**
   * 翻完过一遍标签核对（与助手写标签同一把尺）：本地 Danbooru 词表先查，写歪的换成
   * 真实标签；选中的是 NAI 型号且有 key 时，查不到的再问官方联想。
   * ⚠ 核对只是锦上添花 —— 它失败时照样交出翻好的那串，⛔ 不让整次翻译作废。
   */
  try {
    const checked = await checkNovelAiPromptTags({
      userId: user.id,
      modelId: input.modelId ?? '',
      prompt: translated,
    })
    return { tags: checked.prompt }
  } catch (error) {
    logger.warn('prompt to tags: tag check skipped', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return { tags: translated }
  }
}
