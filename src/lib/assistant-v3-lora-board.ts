import { ASSISTANT_V3_LORA_ITEM_IDS } from '@/constants/assistant-v3'
import {
  LORA_BASE_MODELS,
  resolveLoraStackWeightBudget,
} from '@/constants/lora-base-models'
import { RUNNER_SAMPLERS, RUNNER_SCHEDULERS } from '@/constants/runner-sampling'
import {
  buildAssistantV3Handles,
  type AssistantV3Handles,
} from '@/lib/assistant-v3-board'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'
import type { CivitaiImageRecipe } from '@/types'

/**
 * v3 给模型看的 LoRA 台（S6 第一张脸）：一行一格的表单，⛔ 不是 JSON。
 *
 * ⭐ 与画布同一套写法：挂着的 LoRA 用句柄（`lora-cmg1ab`）不用资产 id；参考图叫
 *   `ref-1`（与提示词里的 @Image1 同号）；左边打开着的示例叫 `sample`。
 * ⚠ 正文与配方在板子上截短，全文用 `read` 取 —— 与画布卡片同一条。
 */

const BOARD_PROMPT_CHARS = 1_600
const BOARD_RECIPE_PROMPT_CHARS = 600
const BOARD_NEGATIVE_CHARS = 400
const BOARD_LORA_PROMPT_CHARS = 200
const MAX_BOARD_BASES = 12

type LoraItem = NonNullable<AssistantOperatorSnapshot['loras']>['items'][number]

export function buildAssistantV3LoraHandles(
  snapshot: AssistantOperatorSnapshot,
): AssistantV3Handles {
  return buildAssistantV3Handles(
    (snapshot.loras?.items ?? []).map((item) => item.id),
    ASSISTANT_V3_LORA_ITEM_IDS.loraPrefix,
  )
}

function clip(text: string, limit: number | null): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (limit === null || flat.length <= limit) return flat
  return `${flat.slice(0, limit)}… (${flat.length} chars, read for all)`
}

function quote(text: string | null | undefined, limit: number | null): string {
  return text?.trim() ? `"${clip(text, limit)}"` : '(empty)'
}

/** 这把底模的总权重上限（客户端套搭配卡时按它拦，见 `use-lora-operator-host`）。 */
export function loraWeightBudget(
  snapshot: AssistantOperatorSnapshot,
): number | null {
  const base = LORA_BASE_MODELS.find((entry) => entry.id === snapshot.model?.id)
  return base ? resolveLoraStackWeightBudget(base) : null
}

function parametersLine(snapshot: AssistantOperatorSnapshot): string {
  const parameters = snapshot.loraParameters
  if (!parameters)
    return 'Parameters: this base model has no sampling controls (set_params does nothing here).'
  const parts = [
    parameters.steps != null ? `${parameters.steps} steps` : null,
    parameters.guidanceScale != null ? `CFG ${parameters.guidanceScale}` : null,
    parameters.runnerSampler ? `sampler ${parameters.runnerSampler}` : null,
    parameters.runnerScheduler
      ? `scheduler ${parameters.runnerScheduler}`
      : null,
    parameters.runnerWidth && parameters.runnerHeight
      ? `${parameters.runnerWidth}×${parameters.runnerHeight}`
      : null,
    parameters.runnerSeed ? `seed ${parameters.runnerSeed}` : 'seed random',
  ].filter(Boolean)
  return [
    `Parameters: ${parts.join(' · ')}`,
    `  samplers: ${RUNNER_SAMPLERS.join(', ')}`,
    `  schedulers: ${RUNNER_SCHEDULERS.join(', ')}`,
  ].join('\n')
}

function loraLine(
  item: LoraItem,
  handles: AssistantV3Handles,
  promptText: string,
  full: boolean,
): string {
  const trigger = item.triggerWord
    ? ` · trigger "${item.triggerWord}" ${
        promptText.toLowerCase().includes(item.triggerWord.toLowerCase())
          ? '(in the prompt)'
          : '(NOT in the prompt)'
      }`
    : ' · no trigger word'
  const lines = [
    `- ${handles.handleOf(item.id)} ${item.name} · weight ${item.weight} · ${
      item.enabled ? 'on' : 'off'
    }${trigger} · ${item.family ?? 'unknown family'}${
      item.compatible ? '' : ' (does NOT fit this base model)'
    }`,
  ]
  if (item.recommendedPrompt)
    lines.push(
      `  author's prompt: ${quote(item.recommendedPrompt, full ? null : BOARD_LORA_PROMPT_CHARS)}`,
    )
  if (item.sourcePrompts?.length)
    lines.push(
      full
        ? item.sourcePrompts
            .map(
              (prompt, index) => `  source picture ${index + 1}: "${prompt}"`,
            )
            .join('\n')
        : `  ${item.sourcePrompts.length} source picture prompt(s) — read ${handles.handleOf(item.id)} for them`,
    )
  return lines.join('\n')
}

function recipeLines(recipe: CivitaiImageRecipe, full: boolean): string[] {
  const size =
    recipe.baseWidth && recipe.baseHeight
      ? `${recipe.baseWidth}×${recipe.baseHeight}`
      : recipe.sizeRaw
  const settings = [
    recipe.sampler ? `sampler "${recipe.sampler}"` : null,
    recipe.scheduler ? `scheduler "${recipe.scheduler}"` : null,
    recipe.steps ? `${recipe.steps} steps` : null,
    recipe.cfgScale ? `CFG ${recipe.cfgScale}` : null,
    size ? `size ${size}` : null,
    recipe.seed !== undefined ? `seed ${recipe.seed}` : null,
    recipe.clipSkip ? `clip skip ${recipe.clipSkip}` : null,
    recipe.checkpoint ? `checkpoint "${recipe.checkpoint}"` : null,
  ].filter(Boolean)
  return [
    `  prompt: ${quote(recipe.prompt, full ? null : BOARD_RECIPE_PROMPT_CHARS)}`,
    `  negative: ${quote(recipe.negativePrompt, full ? null : BOARD_NEGATIVE_CHARS)}`,
    ...(settings.length ? [`  ${settings.join(' · ')}`] : []),
    ...(recipe.source === 'ai_inferred'
      ? [
          '  (no recipe was published; this prompt was inferred from the picture)',
        ]
      : []),
  ]
}

export function renderAssistantV3LoraBoard(input: {
  snapshot: AssistantOperatorSnapshot
  handles: AssistantV3Handles
  /** 这条消息带的图（结果、截图）的名字 —— `look` 按名字找。 */
  attachedNames: readonly string[]
  latestUserText: string
}): string {
  const { snapshot, handles } = input
  const loras = snapshot.loras
  const budget = loraWeightBudget(snapshot)
  const total =
    Math.round(
      (loras?.items ?? [])
        .filter((item) => item.enabled)
        .reduce((sum, item) => sum + item.weight, 0) * 100,
    ) / 100
  const otherBases = snapshot.availableModels
    .filter((option) => option.id !== snapshot.model?.id)
    .slice(0, MAX_BOARD_BASES)
  const references = snapshot.references?.items ?? []
  const viewing = snapshot.viewingRecipe

  return [
    'LORA WORKBENCH — this is the form. Change it with edit (model, parameters, LoRA weights) and write (prompt, negative).',
    `Base model: ${snapshot.model ? `${snapshot.model.label} [${snapshot.model.id}]` : '(none picked)'}${loras?.baseFamily ? ` · family ${loras.baseFamily}` : ''}`,
    ...(otherBases.length
      ? [
          `Other base models: ${otherBases.map((option) => `${option.label} [${option.id}]`).join(', ')}`,
        ]
      : []),
    `Prompt: ${quote(snapshot.prompt, BOARD_PROMPT_CHARS)}`,
    `Negative: ${quote(snapshot.negativePrompt, BOARD_NEGATIVE_CHARS)}`,
    parametersLine(snapshot),
    loras?.items.length
      ? [
          `LoRAs mounted (each weight ${loras.minWeight}–${loras.maxWeight}; enabled weights add up to ${total}${budget !== null ? `, this base model allows at most ${budget}` : ''}):`,
          ...loras.items.map((item) =>
            loraLine(item, handles, snapshot.prompt, false),
          ),
        ].join('\n')
      : 'LoRAs mounted: none. New LoRAs are found with search_library kind "lora" and mounted by the creator (propose_setup / show_picks).',
    references.length
      ? `References (the prompt can name them as @Image1…): ${references
          .map(
            (reference, index) =>
              `${ASSISTANT_V3_LORA_ITEM_IDS.referencePrefix}${index + 1}${reference.label ? ` "${reference.label}"` : ''}`,
          )
          .join(', ')}`
      : 'References: none mounted.',
    ...(viewing
      ? [
          `Open on the left — "${ASSISTANT_V3_LORA_ITEM_IDS.sample}": example ${viewing.position} / ${viewing.total} of ${viewing.loraName || 'the LoRA'} (its picture is attached). Its recipe:`,
          ...recipeLines(viewing.recipe, false),
        ]
      : ['Open on the left: no example picture.']),
    ...(snapshot.sourceRecipe
      ? [
          'Recipe the creator applied earlier (做同款):',
          ...recipeLines(snapshot.sourceRecipe, false),
        ]
      : []),
    ...(input.attachedNames.length
      ? [
          `Pictures attached to this message (attached below; use these names with look): ${input.attachedNames.map((name) => `"${name}"`).join(', ')}`,
        ]
      : []),
    '',
    `CREATOR SAID: ${input.latestUserText}`,
  ].join('\n')
}

/** `read` 一项的全文。对不上的名字回 `null`。 */
export function renderAssistantV3LoraItem(
  item: string,
  snapshot: AssistantOperatorSnapshot,
  handles: AssistantV3Handles,
): string | null {
  const key = item.trim().toLowerCase()
  if (key === ASSISTANT_V3_LORA_ITEM_IDS.prompt)
    return `Prompt (full): ${quote(snapshot.prompt, null)}`
  if (key === ASSISTANT_V3_LORA_ITEM_IDS.negative)
    return `Negative (full): ${quote(snapshot.negativePrompt, null)}`
  if (key === ASSISTANT_V3_LORA_ITEM_IDS.sample) {
    const viewing = snapshot.viewingRecipe
    return viewing
      ? [
          `Example ${viewing.position} / ${viewing.total} of ${viewing.loraName || 'the LoRA'} (full recipe):`,
          ...recipeLines(viewing.recipe, true),
        ].join('\n')
      : 'No example picture is open on the left.'
  }
  if (key.startsWith(ASSISTANT_V3_LORA_ITEM_IDS.referencePrefix)) {
    const index =
      Number(key.slice(ASSISTANT_V3_LORA_ITEM_IDS.referencePrefix.length)) - 1
    const reference = snapshot.references?.items[index]
    return reference
      ? `${key}: ${reference.label ? `"${reference.label}" ` : ''}${reference.url} — look at it to see what it shows.`
      : null
  }
  const id = handles.idOf(item)
  const lora = id
    ? snapshot.loras?.items.find((entry) => entry.id === id)
    : null
  return lora ? loraLine(lora, handles, snapshot.prompt, true) : null
}
