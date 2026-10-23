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
import { searchMemoriesStep } from '@/services/kernel/assistant-v3-memories.service'
import {
  ASSISTANT_NEXT_EDIT_OP_IDS as OP,
  ASSISTANT_NEXT_FIND_KIND_IDS,
  ASSISTANT_NEXT_FIND_KINDS,
  ASSISTANT_NEXT_LIMITS,
  ASSISTANT_NEXT_LORA_PARAM_KEYS,
  type AssistantNextFindKind,
} from '@/features/assistant/constants'
import type {
  AskInput,
  EditChange,
  FindInput,
  GenerateInput,
  LookInput,
} from '@/features/assistant/tools'
import {
  findInWorkspace,
  openWorkspaceHandle,
  parseWorkspaceHandle,
  type WorkspaceOwner,
  type WorkspacePicture,
} from '@/features/assistant/workspace.service'

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
  aliases = '',
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
    .concat(aliases ? `\n${aliases}` : '')
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
 * `add_reference 图_1624`：编号 → 那一张（记进准入名单），换成旧执行器认的 id。附图里有同名的
 * 照旧交给台上（它认附图的全名）。
 */
async function withPictureNumber(
  context: V3Context,
  change: EditChange,
): Promise<EditChange> {
  if (change.op !== OP.addReference || !change.picture) return change
  const name = change.picture.trim().toLowerCase()
  const attached = (context.request.mentionedAssets ?? []).some(
    (asset) => asset.label?.trim().toLowerCase() === name,
  )
  const handle = parseWorkspaceHandle(change.picture)
  if (attached || handle?.kind !== 'picture') return change
  const opened = await openWorkspaceHandle(ownerOf(context), handle).catch(
    () => null,
  )
  const picture = opened?.pictures[0]
  if (!picture?.generationId) return change
  admitPictures(context, [picture])
  return { ...change, picture: picture.generationId }
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
  for (const [index, given] of changes.entries()) {
    const change = await withPictureNumber(context, given)
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

/** 查到 / 打开的图记进本轮的准入名单：之后 `add_reference 图_N` 才挂得上（旧执行器只认名单里的）。 */
function admitPictures(
  context: V3Context,
  pictures: readonly WorkspacePicture[],
): void {
  for (const picture of pictures)
    if (picture.generationId)
      context.prepared.run.searchIndex.set(picture.generationId, {
        assetId: picture.generationId,
        displayName: picture.label,
        url: picture.url,
        kind: 'image',
      })
}

function ownerOf(context: V3Context): WorkspaceOwner {
  return {
    userId: context.prepared.user.id,
    clerkId: context.clerkId,
    incognito: context.request.incognito === true,
  }
}

/**
 * look：不给名字 = 读板子；给了就逐个打开。认得出的编号（图_N、角色·…、LoRA·…、提示词·…、
 * 对话·…、设置）由工作区打开，其余（ref-N、result-N、sample、附图的名字）交给台上那一套。
 */
export async function* runLook(
  context: V3Context,
  input: LookInput,
  attachedNames: readonly string[],
  latestUserText: string,
  aliases = '',
): AsyncGenerator<AssistantOperatorEvent, BenchResult> {
  const names = input.names ?? []
  const bench = renderBench(context, attachedNames, latestUserText, aliases)
  if (names.length === 0) return { output: bench, error: false }
  const parts: string[] = []
  const pictures: AssistantV3PictureRef[] = []
  const benchNames: string[] = []
  let failed = 0
  for (const name of names) {
    const handle = parseWorkspaceHandle(name)
    // 附图的名字本身就长得像编号（`图_1588·摘要`）：台上认得的先给台上。
    const attached = attachedNames.some(
      (attachedName) =>
        attachedName.trim().toLowerCase() === name.trim().toLowerCase(),
    )
    if (!handle || attached) {
      benchNames.push(name)
      continue
    }
    const opened = await openWorkspaceHandle(ownerOf(context), handle).catch(
      () => null,
    )
    if (!opened) {
      failed += 1
      parts.push(
        `${name}: not found. Use find to look it up (numbers look like 图_1624; names like 角色·Name, LoRA·name).`,
      )
      continue
    }
    admitPictures(context, opened.pictures)
    pictures.push(...opened.pictures)
    parts.push(opened.text)
  }
  if (benchNames.length > 0) {
    const call =
      context.face === ASSISTANT_V3_FACE_IDS.lora
        ? executeAssistantV3LoraCall
        : executeAssistantV3ImageCall
    const looked = outcomeOf(
      yield* call(context, ASSISTANT_V3_TOOL_IDS.look, {
        images: benchNames,
        question: input.question ?? '',
      }),
    )
    if (looked.error) failed += 1
    pictures.push(...(looked.pictures ?? []))
    parts.unshift(looked.output)
  }
  return {
    output: `${parts.join('\n\n')}\n\n${bench}`,
    error: failed === names.length,
    ...(pictures.length
      ? { pictures: pictures.slice(0, ASSISTANT_NEXT_LIMITS.maxLookPictures) }
      : {}),
  }
}

/** find：工作区一次查几类；记忆走 v3 那条（隐身与作用域都在那里）。 */
export async function* runFind(
  context: V3Context,
  input: FindInput,
): AsyncGenerator<AssistantOperatorEvent, BenchResult> {
  const query = input.query?.trim() ?? ''
  const kinds = (
    input.kinds?.length ? input.kinds : ASSISTANT_NEXT_FIND_KINDS
  ) as AssistantNextFindKind[]
  const parts: string[] = []
  const workspaceKinds = kinds.filter(
    (kind) => kind !== ASSISTANT_NEXT_FIND_KIND_IDS.memories,
  )
  if (workspaceKinds.length > 0) {
    const found = await findInWorkspace(ownerOf(context), query, workspaceKinds)
    admitPictures(context, found.pictures)
    parts.push(found.text)
  }
  if (kinds.includes(ASSISTANT_NEXT_FIND_KIND_IDS.memories)) {
    const memories = outcomeOf(yield* searchMemoriesStep(context, query))
    parts.push(`MEMORIES\n${memories.output}`)
  }
  return {
    output: `${parts.join('\n\n')}\n\nOpen any of these with look (by its number or name).`,
    error: false,
  }
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
