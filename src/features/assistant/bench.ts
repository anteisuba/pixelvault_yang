import 'server-only'

import {
  assistantAdapterSupportsImage,
  assistantAdapterVideoTier,
} from '@/constants/assistant'
import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_FACE_IDS,
  ASSISTANT_V3_IMAGE_EDIT_OP_IDS,
  ASSISTANT_V3_LORA_EDIT_OP_IDS,
  ASSISTANT_V3_LORA_WRITE_FIELD_IDS,
  ASSISTANT_V3_TOOL_IDS,
  ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS,
} from '@/constants/assistant-v3'
import { buildAssistantV3Handles } from '@/lib/assistant-v3-board'
import { renderAssistantV3ImageBoard } from '@/lib/assistant-v3-image-board'
import {
  buildAssistantV3LoraHandles,
  renderAssistantV3LoraBoard,
} from '@/lib/assistant-v3-lora-board'
import type { PromptAssistantResponseLanguage } from '@/types'
import type {
  AssistantOperatorEvent,
  AssistantOperatorRequest,
  AssistantOperatorSnapshot,
} from '@/types/assistant-operator'
import type {
  AssistantV3PictureRef,
  AssistantV3Transcript,
} from '@/types/assistant-v3'
import {
  normalizePlanQuestions,
  type PreparedOperatorTurn,
} from '@/services/kernel/assistant-operator.service'
import {
  executeAssistantV3ImageCall,
  executeAssistantV3ImageMutation,
} from '@/services/kernel/assistant-v3-image.service'
import {
  executeAssistantV3LoraCall,
  executeAssistantV3LoraMutation,
} from '@/services/kernel/assistant-v3-lora.service'
import { createPictureCache } from '@/services/kernel/assistant-v3-look.service'
import type {
  V3Context,
  V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'
import { createClipCache } from '@/services/kernel/assistant-v3-watch.service'
import {
  ASSISTANT_NEXT_EDIT_OP_IDS as OP,
  ASSISTANT_NEXT_LORA_PARAM_KEYS,
} from '@/features/assistant/constants'
import type {
  AskInput,
  EditChange,
  GenerateInput,
  LookInput,
} from '@/features/assistant/tools'

/**
 * 工作台那一层：新内核的四个工具 → 台上真正的改动。
 *
 * ── 为什么借 v3 的执行函数 ───────────────────────────────────────
 * 台上每一格怎么改（换模型认名字、规格补齐、LoRA 认句柄、找句换句、确认卡过闸）是面板认的
 * 「线上协议」，v3 与旧执行器已经磨过一遍；新内核只换掉它们**外面**那一圈（工具契约、循环、
 * 上下文、搜索）。所以这里只做翻译：新工具的一条改动 → v3 那一条的入参，交给同一个执行函数。
 * ⚠ 第 8 步删旧内核时，这几个执行函数搬进 `features/assistant/`，⛔ 不是跟着删。
 */

export type BenchFace =
  | typeof ASSISTANT_V3_FACE_IDS.image
  | typeof ASSISTANT_V3_FACE_IDS.lora

export interface BenchResult {
  readonly output: string
  readonly error: boolean
  /** look 摆到模型眼前的图（地址 + 称呼）；字节由循环现下。 */
  readonly pictures?: readonly AssistantV3PictureRef[]
  /** 停在问题卡 / 确认卡上：这一轮到此为止。 */
  readonly stop?: boolean
}

export function benchFaceOf(domain: string): BenchFace | null {
  return domain === ASSISTANT_V3_FACE_IDS.image
    ? ASSISTANT_V3_FACE_IDS.image
    : domain === ASSISTANT_V3_FACE_IDS.lora
      ? ASSISTANT_V3_FACE_IDS.lora
      : null
}

/** v3 执行函数要的那一份上下文。`board` 是 v3 形状的板子那一条（找图 `#n`、被指着的片子从这里读）。 */
export function benchContext(input: {
  face: BenchFace
  clerkId: string
  prepared: PreparedOperatorTurn
  request: AssistantOperatorRequest
  language: PromptAssistantResponseLanguage
  stepPrefix: string
  board: AssistantV3Transcript[number]
  modelId: string
}): V3Context {
  const { prepared, request } = input
  const adapterType = prepared.route.adapterType
  const seesImages = assistantAdapterSupportsImage(adapterType, input.modelId)
  return {
    face: input.face,
    clerkId: input.clerkId,
    prepared,
    request,
    nodes: [],
    handles:
      input.face === ASSISTANT_V3_FACE_IDS.lora
        ? buildAssistantV3LoraHandles(request.snapshot)
        : buildAssistantV3Handles([]),
    language: input.language,
    stepPrefix: input.stepPrefix,
    transcript: [input.board],
    replyText: { current: '' },
    seesImages,
    pictures: createPictureCache(adapterType),
    clipTier: seesImages
      ? assistantAdapterVideoTier(adapterType, input.modelId)
      : false,
    clips: createClipCache(),
  }
}

/** 台上现在的样子：开轮的快照叠上这一轮已经落下的提示词 / 负面词 / LoRA 权重。 */
function currentSnapshot(context: V3Context): AssistantOperatorSnapshot {
  const { snapshot } = context.request
  const state = context.prepared.run.state
  return {
    ...snapshot,
    prompt: state.prompt,
    ...(snapshot.negativePrompt === undefined
      ? {}
      : { negativePrompt: state.negativePrompt ?? '' }),
    ...(snapshot.loras
      ? { loras: { ...snapshot.loras, items: state.loras } }
      : {}),
  }
}

/**
 * 给模型读的那块板子。⭐ 第 2 步沿用 v3 的板子文字，只把开头那句与里面的旧工具名换成新内核的说法；
 * 工作区编号与「查」是第 3 步的事。
 */
export function renderBench(
  context: V3Context,
  attachedNames: readonly string[],
  latestUserText: string,
): string {
  const snapshot = currentSnapshot(context)
  const text =
    context.face === ASSISTANT_V3_FACE_IDS.lora
      ? renderAssistantV3LoraBoard({
          snapshot,
          handles: context.handles,
          attachedNames,
          latestUserText,
        })
      : renderAssistantV3ImageBoard({ snapshot, attachedNames, latestUserText })
  return text
    .replace(
      /^(IMAGE|VIDEO|LORA) WORKBENCH — this is the form\.[^\n]*/,
      (_match, kind: string) =>
        `${kind} WORKBENCH — what is on it right now. Change it with edit.`,
    )
    .replace(
      /use these names with look and mount_reference/g,
      'use these names with look and edit add_reference',
    )
}

const NOTHING_TO_DO = 'Nothing was changed.'

function outcomeOf(outcome: V3Outcome): BenchResult {
  if (outcome.kind === 'stop')
    return {
      output: `Waiting for the creator: ${outcome.todo}`,
      error: false,
      stop: true,
    }
  if (outcome.kind === 'pending') return { output: NOTHING_TO_DO, error: false }
  return {
    output: outcome.output,
    error: outcome.error,
    ...(outcome.images?.length ? { pictures: outcome.images } : {}),
  }
}

type V3Mutation =
  | { tool: 'write'; input: unknown }
  | { tool: 'edit'; input: unknown }
  | { tool: null; error: string }

const need = (op: string, field: string): V3Mutation => ({
  tool: null,
  error: `${op} needs ${field}.`,
})

/** 新工具的一条改动 → v3 的 write / edit 入参（一条一条交，结果按条回）。 */
export function toV3Mutation(face: BenchFace, change: EditChange): V3Mutation {
  const lora = face === ASSISTANT_V3_FACE_IDS.lora
  switch (change.op) {
    case OP.prompt:
    case OP.negative:
      return {
        tool: 'write',
        input: {
          writes: [
            {
              field:
                change.op === OP.prompt
                  ? ASSISTANT_V3_LORA_WRITE_FIELD_IDS.prompt
                  : ASSISTANT_V3_LORA_WRITE_FIELD_IDS.negative,
              mode: change.mode ?? (change.edits?.length ? 'edit' : 'replace'),
              text: change.text ?? null,
              edits: change.edits ?? null,
            },
          ],
        },
      }
    case OP.model:
      if (!change.model) return need(change.op, 'model')
      return {
        tool: 'edit',
        input: {
          ops: [
            lora
              ? {
                  op: ASSISTANT_V3_LORA_EDIT_OP_IDS.setModel,
                  model: change.model,
                }
              : {
                  op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setModel,
                  model: change.model,
                  channel: change.channel ?? null,
                },
          ],
        },
      }
    case OP.removeReference:
      if (!change.picture) return need(change.op, 'picture ("ref-N")')
      return {
        tool: 'edit',
        input: {
          ops: [
            {
              op: lora
                ? ASSISTANT_V3_LORA_EDIT_OP_IDS.unmountReference
                : ASSISTANT_V3_IMAGE_EDIT_OP_IDS.unmountReference,
              ref: change.picture,
            },
          ],
        },
      }
    case OP.loraWeight:
    case OP.removeLora:
      if (!lora)
        return { tool: null, error: 'There are no LoRAs on this bench.' }
      if (!change.lora) return need(change.op, 'lora')
      if (change.op === OP.removeLora)
        return {
          tool: 'edit',
          input: {
            ops: [
              { op: ASSISTANT_V3_LORA_EDIT_OP_IDS.unmount, lora: change.lora },
            ],
          },
        }
      if (typeof change.weight !== 'number') return need(change.op, 'weight')
      return {
        tool: 'edit',
        input: {
          ops: [
            {
              op: ASSISTANT_V3_LORA_EDIT_OP_IDS.setWeight,
              lora: change.lora,
              weight: change.weight,
            },
          ],
        },
      }
    case OP.loraParam: {
      if (!lora)
        return {
          tool: null,
          error: 'This bench has no sampling parameters; use specs or option.',
        }
      const field = change.key
        ? ASSISTANT_NEXT_LORA_PARAM_KEYS[change.key.trim().toLowerCase()]
        : undefined
      if (!field)
        return {
          tool: null,
          error: `lora_param key must be one of: ${Object.keys(ASSISTANT_NEXT_LORA_PARAM_KEYS).join(', ')}.`,
        }
      if (change.value === null || change.value === undefined)
        return need(change.op, 'value')
      const numeric = ['steps', 'cfg', 'width', 'height'].includes(field)
      const value = numeric ? Number(change.value) : String(change.value)
      if (numeric && Number.isNaN(value))
        return { tool: null, error: `${change.key} must be a number.` }
      return {
        tool: 'edit',
        input: {
          ops: [
            {
              op: ASSISTANT_V3_LORA_EDIT_OP_IDS.setParams,
              steps: null,
              cfg: null,
              seed: null,
              width: null,
              height: null,
              sampler: null,
              scheduler: null,
              [field]: value,
            },
          ],
        },
      }
    }
  }
  if (lora)
    return {
      tool: null,
      error: `"${change.op}" is not a control on the LoRA bench. It has: prompt, negative, model, remove_reference, lora_weight, remove_lora, lora_param.`,
    }
  switch (change.op) {
    case OP.specs:
      return {
        tool: 'edit',
        input: {
          ops: [
            {
              op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSpecs,
              aspectRatio: change.aspectRatio ?? null,
              resolution: change.resolution ?? null,
              quality: change.quality ?? null,
              background: change.background ?? null,
            },
          ],
        },
      }
    case OP.count:
      if (typeof change.count !== 'number') return need(change.op, 'count')
      return {
        tool: 'edit',
        input: {
          ops: [
            {
              op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setCount,
              count: Math.round(change.count),
            },
          ],
        },
      }
    case OP.option:
      if (!change.key) return need(change.op, 'key')
      if (change.value === null || change.value === undefined)
        return need(change.op, 'value')
      return {
        tool: 'edit',
        input: {
          ops: [
            {
              op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setOption,
              key: change.key,
              value: change.value,
            },
          ],
        },
      }
    case OP.addReference:
      if (!change.picture) return need(change.op, 'picture')
      return {
        tool: 'edit',
        input: {
          ops: [
            {
              op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.mountReference,
              asset: change.picture,
            },
          ],
        },
      }
    case OP.importUrl:
      if (!change.url) return need(change.op, 'url')
      return {
        tool: 'edit',
        input: {
          ops: [
            { op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.importUrl, url: change.url },
          ],
        },
      }
    case OP.people:
      if (!change.people) return need(change.op, 'people')
      return {
        tool: 'edit',
        input: {
          ops: [
            {
              op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setPeople,
              positioning: change.positioning ?? 'auto',
              people: change.people.map((person) => ({
                prompt: person.prompt,
                negative: person.negative ?? null,
                x: person.x ?? null,
                y: person.y ?? null,
                interactions:
                  person.interactions?.map((interaction) => ({
                    ...interaction,
                    mutual: interaction.mutual ?? false,
                  })) ?? null,
                dialogue: person.dialogue ?? null,
              })),
            },
          ],
        },
      }
    case OP.sceneTexts:
      if (!change.items) return need(change.op, 'items')
      return {
        tool: 'edit',
        input: {
          ops: [
            {
              op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSceneTexts,
              items: change.items,
            },
          ],
        },
      }
    default:
      return { tool: null, error: `There is no edit op "${change.op}".` }
  }
}

/**
 * edit：按顺序一条一条落，每条当场就有结果；一条不成不拦后面的（各自说清哪一条怎么了）。
 * 停在卡上（LoRA 台的搭配卡等）就不再往下。
 */
export async function* runEdit(
  context: V3Context,
  changes: readonly EditChange[],
): AsyncGenerator<AssistantOperatorEvent, BenchResult> {
  const lines: string[] = []
  let failed = 0
  for (const [index, change] of changes.entries()) {
    const mutation = toV3Mutation(context.face as BenchFace, change)
    const label = `${index + 1}. ${change.op}`
    if (mutation.tool === null) {
      failed += 1
      lines.push(`${label} — not done: ${mutation.error}`)
      continue
    }
    const tool =
      mutation.tool === 'write'
        ? ASSISTANT_V3_TOOL_IDS.write
        : ASSISTANT_V3_TOOL_IDS.edit
    const result = outcomeOf(
      context.face === ASSISTANT_V3_FACE_IDS.lora
        ? yield* executeAssistantV3LoraMutation(context, tool, mutation.input)
        : yield* executeAssistantV3ImageMutation(context, tool, mutation.input),
    )
    if (result.error) failed += 1
    lines.push(`${label} — ${result.error ? 'not done: ' : ''}${result.output}`)
    if (result.stop)
      return { output: lines.join('\n'), error: false, stop: true }
  }
  return { output: lines.join('\n'), error: failed === changes.length }
}

export async function* runLook(
  context: V3Context,
  input: LookInput,
  attachedNames: readonly string[],
  latestUserText: string,
): AsyncGenerator<AssistantOperatorEvent, BenchResult> {
  const pictures = input.pictures ?? []
  const bench = renderBench(context, attachedNames, latestUserText)
  if (pictures.length === 0) return { output: bench, error: false }
  const call =
    context.face === ASSISTANT_V3_FACE_IDS.lora
      ? executeAssistantV3LoraCall
      : executeAssistantV3ImageCall
  const looked = outcomeOf(
    yield* call(context, ASSISTANT_V3_TOOL_IDS.look, {
      images: pictures,
      question: input.question ?? '',
    }),
  )
  return { ...looked, output: `${looked.output}\n\n${bench}` }
}

export async function* runGenerate(
  context: V3Context,
  input: GenerateInput,
): AsyncGenerator<AssistantOperatorEvent, BenchResult> {
  const call =
    context.face === ASSISTANT_V3_FACE_IDS.lora
      ? executeAssistantV3LoraCall
      : executeAssistantV3ImageCall
  return outcomeOf(
    yield* call(context, ASSISTANT_V3_TOOL_IDS.generate, {
      label: input.label ?? null,
      say: input.say ?? '',
    }),
  )
}

/** ask：一张问题卡，这一轮停在卡上，答复作为创作者的下一句回来。 */
export async function* runAsk(
  context: V3Context,
  input: AskInput,
): AsyncGenerator<AssistantOperatorEvent, BenchResult> {
  const references = context.request.snapshot.references?.items ?? []
  const mentioned = context.request.mentionedAssets ?? []
  const pictureUrl = (name: string | null | undefined) => {
    const key = name?.trim().toLowerCase()
    if (!key) return undefined
    const reference = /^ref-(\d+)$/.exec(key)
    if (reference) return references[Number(reference[1]) - 1]?.url
    return mentioned.find(
      (asset) => asset.id === name || asset.label?.trim().toLowerCase() === key,
    )?.url
  }
  const questions = normalizePlanQuestions(
    {
      questions: [
        {
          header: input.header?.trim() || input.question.slice(0, 12),
          question: input.question.slice(
            0,
            ASSISTANT_OPERATOR_LIMITS.maxMessageChars,
          ),
          multiSelect: input.multiSelect ?? false,
          allowOther: input.allowOther ?? true,
          options: input.options.map((option) => {
            const assetUrl = pictureUrl(option.picture)
            return {
              label: option.label,
              description: option.description ?? '',
              recommended: option.recommended ?? false,
              ...(assetUrl ? { assetUrl } : {}),
            }
          }),
        },
      ],
    },
    context.clerkId,
  )
  if (questions.length === 0)
    return {
      output:
        'The question was not shown: it needs at least two options, each with a one-line description.',
      error: true,
    }
  yield { type: ASSISTANT_OPERATOR_EVENTS.ask, questions }
  return {
    output: 'Waiting for the creator to answer.',
    error: false,
    stop: true,
  }
}

/** v3 形状的板子那一条（v3 执行函数从它读找到的图与被指着的片子）。 */
export function boardEntry(
  text: string,
  images: readonly AssistantV3PictureRef[],
): AssistantV3Transcript[number] {
  return {
    type: ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board,
    text,
    images: [...images],
  }
}
