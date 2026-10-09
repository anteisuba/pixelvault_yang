import { ASSISTANT_V3_LORA_ITEM_IDS } from '@/constants/assistant-v3'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'

/**
 * v3 给模型看的图片台（S6 第二张脸）：一行一格的表单，⛔ 不是 JSON。
 *
 * ⭐ 与 LoRA 台同一套叫法：参考图叫 `ref-1`（与提示词里的 @Image1 同号），正文在
 *   板子上截短、全文用 `read` 取。
 * ⭐ 每个旋钮都把能选的值印出来 —— 不给可选列表，模型只会编一个（与画布 `set` 同一条）。
 */

const BOARD_PROMPT_CHARS = 1_600
const BOARD_NEGATIVE_CHARS = 400
const MAX_BOARD_MODELS = 40

type Model = AssistantOperatorSnapshot['availableModels'][number]

function clip(text: string, limit: number | null): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (limit === null || flat.length <= limit) return flat
  return `${flat.slice(0, limit)}… (${flat.length} chars, read for all)`
}

function quote(text: string | null | undefined, limit: number | null): string {
  return text?.trim() ? `"${clip(text, limit)}"` : '(empty)'
}

function modelEntry(model: Model): string {
  const channels = model.channels?.length
    ? ` (channels: ${model.channels.map((channel) => `${channel.label} [${channel.id}]`).join(', ')})`
    : ''
  return `${model.label} [${model.id}]${channels}`
}

function modelLines(snapshot: AssistantOperatorSnapshot): string[] {
  const current = snapshot.model
  const channel = current?.channels?.find(
    (entry) => entry.id === current.channelId,
  )
  const others = snapshot.availableModels
    .filter((option) => option.id !== current?.id)
    .slice(0, MAX_BOARD_MODELS)
  return [
    `Model: ${
      current
        ? `${current.label ?? current.id} [${current.id}]${
            current.channels && current.channels.length > 1
              ? channel
                ? ` · channel ${channel.label} [${channel.id}]`
                : ' · NO channel picked yet'
              : ''
          }`
        : '(none picked)'
    }`,
    ...(others.length
      ? [`Other models here: ${others.map(modelEntry).join(', ')}`]
      : []),
    ...(snapshot.otherWorkbenchModels?.length
      ? [
          `On another workbench (not selectable here): ${snapshot.otherWorkbenchModels
            .map((option) => option.label)
            .join(', ')}`,
        ]
      : []),
  ]
}

function choice(
  name: string,
  value: string | null,
  options: readonly string[] | undefined,
): string | null {
  if (!options?.length) return null
  return `${name} ${value ?? '(not set)'} (options: ${options.join(', ')})`
}

function specsLine(snapshot: AssistantOperatorSnapshot): string {
  const specs = snapshot.specs
  if (!specs) return 'Specs: this model has no size controls.'
  const parts = [
    choice('aspect ratio', specs.aspectRatio, specs.aspectRatioOptions),
    choice('resolution', specs.resolution, specs.resolutionOptions),
    choice('quality', specs.quality ?? null, specs.qualityOptions),
    choice('background', specs.background ?? null, specs.backgroundOptions),
  ].filter(Boolean)
  return parts.length
    ? `Specs: ${parts.join(' · ')}`
    : 'Specs: this model has no size controls.'
}

function optionLines(snapshot: AssistantOperatorSnapshot): string[] {
  const options = snapshot.capabilities ?? []
  if (!options.length) return []
  return [
    'Model options (set_option by key):',
    ...options.map((option) => {
      const domain = option.options?.length
        ? `one of ${option.options.join(', ')}`
        : option.range
          ? `${option.range.min}–${option.range.max}${option.range.step ? ` step ${option.range.step}` : ''}`
          : option.kind === 'toggle'
            ? 'true / false'
            : option.maxLength
              ? `text up to ${option.maxLength} chars`
              : option.kind
      return `- ${option.key}: ${
        option.value === null
          ? `default ${String(option.defaultValue)}`
          : String(option.value)
      } (${domain})${option.available ? '' : ' — needs a reference mounted first'}`
    }),
  ]
}

/** 标签台：NAI 的分角色提示词与画面文字（只在这台上有）。 */
function tagLines(snapshot: AssistantOperatorSnapshot): string[] {
  const lines: string[] = []
  const people = snapshot.novelAiCharacters
  if (people) {
    const layout = people.layout
    lines.push(
      layout?.characters.length
        ? `People (set_people, up to ${people.max}, positioning ${layout.positioning}):\n${layout.characters
            .map(
              (person, index) =>
                `- ${index + 1}${person.enabled === false ? ' (off)' : ''}: ${quote(person.prompt, BOARD_NEGATIVE_CHARS)}${
                  person.dialogue ? ` · says "${person.dialogue}"` : ''
                }${
                  person.interactions?.length
                    ? ` · ${person.interactions.map((interaction) => `${interaction.tag} → ${interaction.target + 1}${interaction.mutual ? ' (mutual)' : ''}`).join(', ')}`
                    : ''
                }`,
            )
            .join('\n')}`
        : `People: none laid out (set_people, up to ${people.max}).`,
    )
  }
  const texts = snapshot.novelAiSceneTexts
  if (texts)
    lines.push(
      `Scene text (set_scene_texts; up to ${texts.maxChars} chars each${texts.latinOnly ? ', this model draws English letters only' : ''}): ${
        texts.items.length
          ? texts.items.map((item) => `${item.kind} "${item.text}"`).join(', ')
          : 'none'
      }`,
    )
  return lines
}

function referencesLine(snapshot: AssistantOperatorSnapshot): string {
  const references = snapshot.references
  if (!references) return 'References: this model takes no reference images.'
  const items = references.items
  const room = `${items.length} of ${references.limit} slots used`
  return items.length
    ? `References (${room}; the prompt names them as @Image1…): ${items
        .map(
          (reference, index) =>
            `${ASSISTANT_V3_LORA_ITEM_IDS.referencePrefix}${index + 1}${reference.label ? ` "${reference.label}"` : ''}`,
        )
        .join(', ')}`
    : `References: none mounted (${room}).`
}

export function renderAssistantV3ImageBoard(input: {
  snapshot: AssistantOperatorSnapshot
  /** 这条消息带的图（上传、@ 的结果）的名字 —— `look` / `mount_reference` 按名字找。 */
  attachedNames: readonly string[]
  latestUserText: string
}): string {
  const { snapshot } = input
  return [
    'IMAGE WORKBENCH — this is the form. Change it with edit (model, specs, count, options, references) and write (prompt, negative).',
    ...modelLines(snapshot),
    `Prompt: ${quote(snapshot.prompt, BOARD_PROMPT_CHARS)}`,
    snapshot.negativePrompt === undefined
      ? 'Negative: this model has no negative prompt.'
      : `Negative: ${quote(snapshot.negativePrompt, BOARD_NEGATIVE_CHARS)}`,
    specsLine(snapshot),
    ...(snapshot.count
      ? [
          `Pictures per run: ${snapshot.count.value} (options: ${snapshot.count.options.join(', ')})`,
        ]
      : []),
    ...optionLines(snapshot),
    ...tagLines(snapshot),
    referencesLine(snapshot),
    ...(input.attachedNames.length
      ? [
          `Pictures attached to this message (attached below; use these names with look and mount_reference): ${input.attachedNames.map((name) => `"${name}"`).join(', ')}`,
        ]
      : []),
    '',
    `CREATOR SAID: ${input.latestUserText}`,
  ].join('\n')
}

/** `read` 一项的全文。对不上的名字回 `null`。 */
export function renderAssistantV3ImageItem(
  item: string,
  snapshot: AssistantOperatorSnapshot,
): string | null {
  const key = item.trim().toLowerCase()
  if (key === ASSISTANT_V3_LORA_ITEM_IDS.prompt)
    return `Prompt (full): ${quote(snapshot.prompt, null)}`
  if (key === ASSISTANT_V3_LORA_ITEM_IDS.negative)
    return snapshot.negativePrompt === undefined
      ? 'This model has no negative prompt.'
      : `Negative (full): ${quote(snapshot.negativePrompt, null)}`
  if (key.startsWith(ASSISTANT_V3_LORA_ITEM_IDS.referencePrefix)) {
    const index =
      Number(key.slice(ASSISTANT_V3_LORA_ITEM_IDS.referencePrefix.length)) - 1
    const reference = snapshot.references?.items[index]
    return reference
      ? `${key}: ${reference.label ? `"${reference.label}" ` : ''}— look at it to see what it shows.`
      : null
  }
  return null
}
