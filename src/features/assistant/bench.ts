import 'server-only'

import {
  assistantAdapterSupportsImage,
  assistantAdapterVideoTier,
} from '@/constants/assistant'
import {
  ASSISTANT_AUTO_GENERATE_LIMITS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_CARDS_EDIT_OP_IDS,
  ASSISTANT_V3_FACE_IDS,
  ASSISTANT_V3_IMAGE_EDIT_OP_IDS,
  ASSISTANT_V3_LORA_EDIT_OP_IDS,
  ASSISTANT_V3_LORA_WRITE_FIELD_IDS,
  ASSISTANT_V3_TOOL_IDS,
  ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS,
} from '@/constants/assistant-v3'
import {
  assistantV3CanvasNodes,
  buildAssistantV3Handles,
} from '@/lib/assistant-v3-board'
import {
  buildAssistantV3CardsHandles,
  renderAssistantV3CardsBoard,
  renderAssistantV3CardsItem,
} from '@/lib/assistant-v3-cards-board'
import { renderAssistantV3ImageBoard } from '@/lib/assistant-v3-image-board'
import {
  buildAssistantV3LoraHandles,
  renderAssistantV3LoraBoard,
} from '@/lib/assistant-v3-lora-board'
import { assistantWorkspaceFromKey } from '@/lib/assistant-workspace'
import { resolveClosestStudioAspectRatio } from '@/lib/studio-remix'
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
  refused,
  runOldTool,
} from '@/services/kernel/assistant-v3-bench.service'
import {
  executeAssistantV3CardsCall,
  executeAssistantV3CardsMutation,
} from '@/services/kernel/assistant-v3-cards.service'
import {
  executeAssistantV3ImageCall,
  executeAssistantV3ImageMutation,
} from '@/services/kernel/assistant-v3-image.service'
import {
  executeAssistantV3LoraCall,
  executeAssistantV3LoraMutation,
} from '@/services/kernel/assistant-v3-lora.service'
import { createPictureCache } from '@/services/kernel/assistant-v3-look.service'
import {
  planSafely,
  TITLE_TEXT,
  type V3Context,
  type V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'
import { createClipCache } from '@/services/kernel/assistant-v3-watch.service'
import { executeCall as executeAssistantV3CanvasCall } from '@/services/kernel/assistant-v3.service'
import { searchMemoriesStep } from '@/services/kernel/assistant-v3-memories.service'
import {
  ASSISTANT_NEXT_EDIT_OP_IDS as OP,
  ASSISTANT_NEXT_FIND_KIND_IDS,
  ASSISTANT_NEXT_FIND_KINDS,
  ASSISTANT_NEXT_LIMITS,
  ASSISTANT_NEXT_LORA_PARAM_KEYS,
  ASSISTANT_NEXT_RECIPE_PART_IDS as PART,
  ASSISTANT_NEXT_RECIPE_PARTS,
  type AssistantNextEditOp,
  type AssistantNextFindKind,
  type AssistantNextRecipePart,
} from '@/features/assistant/constants'
import {
  CANVAS_OPS,
  renderCanvasBoard,
  splitCanvasLook,
  toCanvasPiece,
  translateCanvasPieces,
  type CanvasBatch,
} from '@/features/assistant/canvas'
import { isLibraryOp, runLibraryChange } from '@/features/assistant/library'
import { readTaggerFor } from '@/features/assistant/tagger'
import type { BenchOpening } from '@/features/assistant/open'
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
  readPictureRecipe,
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
  | typeof ASSISTANT_V3_FACE_IDS.video
  | typeof ASSISTANT_V3_FACE_IDS.cards
  | typeof ASSISTANT_V3_FACE_IDS.canvas
  | typeof ASSISTANT_V3_FACE_IDS.home

const BENCH_FACES: readonly string[] = [
  ASSISTANT_V3_FACE_IDS.image,
  ASSISTANT_V3_FACE_IDS.lora,
  ASSISTANT_V3_FACE_IDS.video,
  ASSISTANT_V3_FACE_IDS.cards,
  ASSISTANT_V3_FACE_IDS.canvas,
  ASSISTANT_V3_FACE_IDS.home,
]

/** 每台 `edit` 能用哪几种改法（台上没有的那一格回一句说明，列出这台有的）。 */
const OPS_BY_FACE: Record<BenchFace, readonly AssistantNextEditOp[]> = {
  [ASSISTANT_V3_FACE_IDS.image]: [
    OP.prompt,
    OP.negative,
    OP.model,
    OP.specs,
    OP.count,
    OP.option,
    OP.addReference,
    OP.removeReference,
    OP.importUrl,
    OP.people,
    OP.sceneTexts,
    OP.applyRecipe,
  ],
  [ASSISTANT_V3_FACE_IDS.video]: [
    OP.prompt,
    OP.negative,
    OP.model,
    OP.specs,
    OP.option,
    OP.addReference,
    OP.removeReference,
    OP.importUrl,
    OP.addAudio,
    OP.sound,
    OP.applyRecipe,
  ],
  [ASSISTANT_V3_FACE_IDS.lora]: [
    OP.prompt,
    OP.negative,
    OP.model,
    OP.removeReference,
    OP.addLora,
    OP.loraWeight,
    OP.removeLora,
    OP.loraParam,
    OP.applyRecipe,
  ],
  [ASSISTANT_V3_FACE_IDS.cards]: [OP.proposeProfile, OP.proposeImages],
  [ASSISTANT_V3_FACE_IDS.canvas]: CANVAS_OPS,
  // 首页没有台：只有到哪儿都能用的改库 / 设置 / 记忆那几种（`isLibraryOp`）。
  [ASSISTANT_V3_FACE_IDS.home]: [],
}

/**
 * 首页带着一份小配方时（第 9g 步，owner 10-24）能改的那几格：提示词、模型、比例、张数、参考图
 * （+ 照某张图的配方，套不上的照实说）。负面词、模型专属参数、标签台的人物分栏都在图片台上。
 */
const HOME_DRAFT_OPS: readonly AssistantNextEditOp[] = [
  OP.prompt,
  OP.model,
  OP.specs,
  OP.count,
  OP.addReference,
  OP.removeReference,
  OP.applyRecipe,
]

/** 首页的板子（第 9f 步）：没有台，说清能做什么、要干活先开台。 */
const HOME_BOARD = `HOME — no bench is open: the creator is on the home page, talking with you before any work starts. There is no form here to change and nothing to generate. Talk the idea through; find and look work as usual, and library / settings / memory edits work everywhere. When it is time to make something, open the bench it belongs on (image, tags, video, lora, canvas, character) and carry on there.`

/** 首页那份小配方的开头（第 9g 步）：下面接图片台那块板子，只是能改的格子少。 */
const HOME_DRAFT_BOARD = `HOME — no bench is open: the creator is on the home page. A simple picture is made right here in the conversation: below is the small draft it is made from (the confirm card shows it as a little form the creator can change). edit ops on the draft: ${HOME_DRAFT_OPS.join(', ')}. Anything more (negative prompt, model options, LoRAs, the tag bench's people, video, canvas) belongs on a bench: open it and carry on there.`

export interface BenchResult {
  readonly output: string
  readonly error: boolean
  /** look 摆到模型眼前的图（地址 + 称呼）；字节由循环现下。 */
  readonly pictures?: readonly AssistantV3PictureRef[]
  /** 停在问题卡 / 确认卡上：这一轮到此为止。 */
  readonly stop?: boolean
  /** 画布：这次 edit 里要交给浏览器落的那一批（循环合成一批再落，落完再接着跑）。 */
  readonly canvas?: CanvasBatch
  /** 开台（第 9e 步）：去哪。循环存好这一跳、停在 `bench_open`，到了新台再补结果。 */
  readonly opening?: BenchOpening
}

export function benchFaceOf(domain: string): BenchFace | null {
  return BENCH_FACES.includes(domain) ? (domain as BenchFace) : null
}

/** 首页的快照带着一份图片配方（规格 + 张数那两节，第 9g 步）：对话里直接出图。 */
export function isHomeDraftSnapshot(snapshot: AssistantOperatorSnapshot) {
  return snapshot.specs !== undefined && snapshot.count !== undefined
}

/** 这一轮是首页那份小配方：照图片台跑，会话仍在首页（第 9g 步）。 */
function isHomeDraft(context: V3Context): boolean {
  return (
    context.face === ASSISTANT_V3_FACE_IDS.image &&
    assistantWorkspaceFromKey(context.request.workspaceKey)?.workspace ===
      'home'
  )
}

/** 这一轮 `edit` 能用哪几种改法。 */
function opsOf(context: V3Context): readonly AssistantNextEditOp[] {
  return isHomeDraft(context)
    ? HOME_DRAFT_OPS
    : OPS_BY_FACE[context.face as BenchFace]
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
  // 画布：每一跳按这一跳的快照现读（浏览器落完带回来的新画面，新卡这时才有 id）。
  const nodes =
    input.face === ASSISTANT_V3_FACE_IDS.canvas && request.snapshot.canvas
      ? assistantV3CanvasNodes(request.snapshot.canvas)
      : []
  return {
    face: input.face,
    clerkId: input.clerkId,
    prepared,
    request,
    nodes,
    handles:
      input.face === ASSISTANT_V3_FACE_IDS.lora
        ? buildAssistantV3LoraHandles(request.snapshot)
        : input.face === ASSISTANT_V3_FACE_IDS.cards
          ? buildAssistantV3CardsHandles(request.snapshot)
          : buildAssistantV3Handles(nodes.map((node) => node.id)),
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
  const autoGenerate = context.request.autoGenerate
    ? context.face === ASSISTANT_V3_FACE_IDS.canvas
      ? '\nLET AI GENERATE: on — generate starts at once, every card you list (no picture limit on the canvas).'
      : `\nLET AI GENERATE: on — generate starts at once, at most ${ASSISTANT_AUTO_GENERATE_LIMITS.maxOutputsPerRound} pictures in this message.`
    : ''
  if (context.face === ASSISTANT_V3_FACE_IDS.home)
    return HOME_BOARD.concat(aliases ? `\n${aliases}` : '')
  if (isHomeDraft(context))
    return `${HOME_DRAFT_BOARD}\n\n${renderAssistantV3ImageBoard({
      snapshot: currentSnapshot(context),
      attachedNames,
      latestUserText,
    })
      .replace(
        /^IMAGE WORKBENCH — this is the form\.[^\n]*/,
        'THE DRAFT — what is in it right now. Change it with edit.',
      )
      .replace(
        /use these names with look and mount_reference/g,
        'use these names with look and edit add_reference',
      )}`
      .concat(aliases ? `\n${aliases}` : '')
      .concat(autoGenerate)
  if (context.face === ASSISTANT_V3_FACE_IDS.canvas)
    return renderCanvasBoard(context, attachedNames, latestUserText)
      .concat(aliases ? `\n${aliases}` : '')
      .concat(autoGenerate)
  const snapshot = currentSnapshot(context)
  const text =
    context.face === ASSISTANT_V3_FACE_IDS.lora
      ? renderAssistantV3LoraBoard({
          snapshot,
          handles: context.handles,
          attachedNames,
          latestUserText,
        })
      : context.face === ASSISTANT_V3_FACE_IDS.cards
        ? renderAssistantV3CardsBoard({
            snapshot,
            handles: context.handles,
            attachedNames,
            latestUserText,
          })
        : renderAssistantV3ImageBoard({
            snapshot,
            attachedNames,
            latestUserText,
          })
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
    .concat(autoGenerate)
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
export function toV3Mutation(
  face: BenchFace,
  change: EditChange,
  ops: readonly AssistantNextEditOp[] = OPS_BY_FACE[face],
): V3Mutation {
  if (!ops.includes(change.op as AssistantNextEditOp))
    return {
      tool: null,
      error: `"${change.op}" is not a control on this ${face === ASSISTANT_V3_FACE_IDS.cards ? 'page' : 'bench'}. It has: ${ops.join(', ')} (and the library ops, which work everywhere).`,
    }
  const lora = face === ASSISTANT_V3_FACE_IDS.lora
  const video = face === ASSISTANT_V3_FACE_IDS.video
  const edit = (op: Record<string, unknown>): V3Mutation => ({
    tool: 'edit',
    input: { ops: [op] },
  })
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
      return edit(
        lora
          ? { op: ASSISTANT_V3_LORA_EDIT_OP_IDS.setModel, model: change.model }
          : {
              op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setModel,
              model: change.model,
              channel: change.channel ?? null,
            },
      )
    case OP.removeReference:
      if (!change.picture) return need(change.op, 'picture ("ref-N")')
      return edit({
        op: lora
          ? ASSISTANT_V3_LORA_EDIT_OP_IDS.unmountReference
          : ASSISTANT_V3_IMAGE_EDIT_OP_IDS.unmountReference,
        ref: change.picture,
      })
    case OP.removeLora:
      if (!change.lora) return need(change.op, 'lora')
      return edit({
        op: ASSISTANT_V3_LORA_EDIT_OP_IDS.unmount,
        lora: change.lora,
      })
    case OP.loraWeight:
      if (!change.lora) return need(change.op, 'lora')
      if (typeof change.weight !== 'number') return need(change.op, 'weight')
      return edit({
        op: ASSISTANT_V3_LORA_EDIT_OP_IDS.setWeight,
        lora: change.lora,
        weight: change.weight,
      })
    case OP.loraParam: {
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
      return edit({
        op: ASSISTANT_V3_LORA_EDIT_OP_IDS.setParams,
        steps: null,
        cfg: null,
        seed: null,
        width: null,
        height: null,
        sampler: null,
        scheduler: null,
        [field]: value,
      })
    }
    case OP.specs:
      return edit(
        video
          ? {
              op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSpecs,
              duration:
                typeof change.duration === 'number'
                  ? Math.round(change.duration)
                  : null,
              aspectRatio: change.aspectRatio ?? null,
              resolution: change.resolution ?? null,
            }
          : {
              op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSpecs,
              aspectRatio: change.aspectRatio ?? null,
              resolution: change.resolution ?? null,
              quality: change.quality ?? null,
              background: change.background ?? null,
            },
      )
    case OP.count:
      if (typeof change.count !== 'number') return need(change.op, 'count')
      return edit({
        op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setCount,
        count: Math.round(change.count),
      })
    case OP.option:
      if (!change.key) return need(change.op, 'key')
      if (change.value === null || change.value === undefined)
        return need(change.op, 'value')
      return edit({
        op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setOption,
        key: change.key,
        value: change.value,
      })
    case OP.addReference:
      if (!change.picture) return need(change.op, 'picture')
      return edit({
        op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.mountReference,
        asset: change.picture,
        ...(video ? { slot: change.slot ?? null } : {}),
      })
    case OP.importUrl:
      if (!change.url) return need(change.op, 'url')
      return edit({
        op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.importUrl,
        url: change.url,
      })
    case OP.addAudio:
      if (!change.audio) return need(change.op, 'audio')
      return edit({
        op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.mountAudio,
        asset: change.audio,
        owner: change.owner ?? null,
      })
    case OP.sound:
      if (typeof change.enabled !== 'boolean') return need(change.op, 'enabled')
      return edit({
        op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSound,
        enabled: change.enabled,
      })
    case OP.people:
      if (!change.people) return need(change.op, 'people')
      return edit({
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
      })
    case OP.sceneTexts:
      if (!change.items) return need(change.op, 'items')
      return edit({
        op: ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSceneTexts,
        items: change.items,
      })
    case OP.proposeProfile:
      if (!change.character) return need(change.op, 'character')
      if (!change.fields?.length) return need(change.op, 'fields')
      return edit({
        op: ASSISTANT_V3_CARDS_EDIT_OP_IDS.proposeProfile,
        character: change.character,
        say: change.say ?? '',
        fields: change.fields.map((field) => ({
          field: field.field,
          text: field.text,
          source: field.source ?? '',
          sourceUrl: field.sourceUrl ?? null,
          added: field.added ?? null,
        })),
      })
    case OP.proposeImages:
      if (!change.character) return need(change.op, 'character')
      if (!change.images?.length) return need(change.op, 'images')
      return edit({
        op: ASSISTANT_V3_CARDS_EDIT_OP_IDS.proposeImages,
        character: change.character,
        say: change.say ?? '',
        images: change.images.map((image) => ({
          asset: image.picture ?? null,
          find: image.find ?? null,
          reason: image.reason ?? '',
        })),
      })
    default:
      // add_lora / apply_recipe 由 `runEdit` 自己展开，走不到这里。
      return { tool: null, error: `There is no edit op "${change.op}".` }
  }
}

/** 图的编号（`图_1624`）→ 那一张的 generationId（记进准入名单，旧执行器只认名单里的）。附图的全名照旧。 */
async function pictureIdOf(context: V3Context, name: string): Promise<string> {
  const key = name.trim().toLowerCase()
  const attached = (context.request.mentionedAssets ?? []).some(
    (asset) => asset.label?.trim().toLowerCase() === key,
  )
  const handle = parseWorkspaceHandle(name)
  if (attached || handle?.kind !== 'picture') return name
  const opened = await openWorkspaceHandle(ownerOf(context), handle).catch(
    () => null,
  )
  const picture = opened?.pictures[0]
  if (!picture?.generationId) return name
  admitPictures(context, [picture])
  return picture.generationId
}

/** `角色·马尔福` → 页上那位的句柄（`char-b27ce8`）；本来就是句柄或认不出的原样交给执行器。 */
function characterHandleOf(context: V3Context, name: string): string {
  const handle = parseWorkspaceHandle(name)
  if (handle?.kind !== 'character') return name
  const wanted = handle.name.toLowerCase()
  const character = context.request.snapshot.cards?.characters.find(
    (entry) => entry.name.trim().toLowerCase() === wanted,
  )
  return character ? context.handles.handleOf(character.id) : name
}

/** 附在这条消息上的声音按名字认（旧执行器要素材 id）。 */
function attachedIdOf(context: V3Context, name: string): string {
  const key = name.trim().toLowerCase()
  return (
    (context.request.mentionedAssets ?? []).find(
      (asset) => asset.label?.trim().toLowerCase() === key,
    )?.id ?? name
  )
}

/** 一条改动里的编号与名字换成执行器认的那一种（图 → generationId、角色 → 句柄、附件 → id）。 */
async function withResolvedNames(
  context: V3Context,
  change: EditChange,
): Promise<EditChange> {
  switch (change.op) {
    case OP.addReference:
      return change.picture
        ? { ...change, picture: await pictureIdOf(context, change.picture) }
        : change
    case OP.addAudio:
      return change.audio
        ? { ...change, audio: attachedIdOf(context, change.audio) }
        : change
    case OP.proposeImages:
      return {
        ...change,
        ...(change.character
          ? { character: characterHandleOf(context, change.character) }
          : {}),
        ...(change.images
          ? {
              images: await Promise.all(
                change.images.map(async (image) =>
                  image.picture
                    ? {
                        ...image,
                        picture: await pictureIdOf(context, image.picture),
                      }
                    : image,
                ),
              ),
            }
          : {}),
      }
    case OP.proposeProfile:
      return change.character
        ? { ...change, character: characterHandleOf(context, change.character) }
        : change
    default:
      return change
  }
}

/** `LoRA·malfoid` / `malfoid` → 名字本身（搜的时候用）。 */
function loraNameOf(raw: string): string {
  const handle = parseWorkspaceHandle(raw)
  return handle?.kind === 'lora' ? handle.name : raw.trim()
}

/**
 * add_lora：按名字在 LoRA 库页上搜（与「找 LoRA」同一条检索，⛔ 不出过程行、不翻库页），挑名字
 * 对得上的那一把（没有就挑第一把），交给旧执行器的 `mount_lora`（新内核才开，见 `run.nextKernel`）。
 */
async function* mountLoraByName(
  context: V3Context,
  change: EditChange,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const tool = ASSISTANT_OPERATOR_TOOL_IDS.mountLora
  const name = change.lora ? loraNameOf(change.lora) : ''
  const title = `${TITLE_TEXT[context.language].mountLora}「${name}」`
  if (!name) return yield* refused(context, tool, title, 'add_lora needs lora.')
  const search = await planSafely(
    context,
    ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
    { query: name },
  )
  if (search.kind !== 'read')
    return yield* refused(
      context,
      tool,
      title,
      (search.kind === 'rejected' && search.detail) ||
        'LoRAs cannot be searched here.',
    )
  await search.run()
  const found = [...context.prepared.run.loraIndex.values()]
  const wanted = name.toLowerCase()
  const candidate =
    found.find((entry) => entry.name.trim().toLowerCase() === wanted) ??
    found.find((entry) => entry.name.toLowerCase().includes(wanted)) ??
    found[0]
  if (!candidate)
    return yield* refused(
      context,
      tool,
      title,
      `No LoRA called "${name}" was found. Use find (kinds ["loras"]) to see the library.`,
    )
  return yield* runOldTool(context, tool, title, {
    candidateId: candidate.candidateId,
    ...(typeof change.weight === 'number' ? { weight: change.weight } : {}),
  })
}

/**
 * apply_recipe：把那张图的配方拆成这台有的那几种改法，按顺序交给同一条路（每一格各自一行、
 * 各自能撤销）。先换模型（换模型会重置参数），再写词、尺寸、参数、参考图、LoRA。
 * 这台没有的那几格不套，回一句说清楚（跨台切换是第 9 步「开台」）。
 */
async function recipeChanges(
  context: V3Context,
  change: EditChange,
): Promise<
  | { ok: true; tag: string; changes: EditChange[]; notes: string[] }
  | { ok: false; error: string }
> {
  if (!change.picture)
    return { ok: false, error: 'apply_recipe needs picture.' }
  const recipe = await readPictureRecipe(
    ownerOf(context),
    change.picture,
  ).catch(() => null)
  if (!recipe)
    return {
      ok: false,
      error: `${change.picture}: no such picture of the creator's. Give its number (图_1624); find can look it up.`,
    }
  const face = context.face as BenchFace
  const wanted = new Set<AssistantNextRecipePart>(
    (change.parts?.length
      ? change.parts
      : ASSISTANT_NEXT_RECIPE_PARTS) as AssistantNextRecipePart[],
  )
  const snapshot = context.request.snapshot
  const changes: EditChange[] = []
  const notes: string[] = []
  const add = (next: Omit<EditChange, 'op'> & { op: AssistantNextEditOp }) =>
    changes.push(next as EditChange)
  const lora = face === ASSISTANT_V3_FACE_IDS.lora

  if (
    wanted.has(PART.model) &&
    recipe.model &&
    snapshot.model?.catalogId !== recipe.model &&
    snapshot.model?.id !== recipe.model
  )
    add({ op: OP.model, model: recipe.model })
  if (wanted.has(PART.prompt) && recipe.prompt.trim())
    add({ op: OP.prompt, mode: 'replace', text: recipe.prompt })
  if (wanted.has(PART.negative) && recipe.negative.trim())
    add({ op: OP.negative, mode: 'replace', text: recipe.negative })
  if (wanted.has(PART.specs)) {
    if (lora) {
      add({ op: OP.loraParam, key: 'width', value: recipe.width })
      add({ op: OP.loraParam, key: 'height', value: recipe.height })
    } else
      add({
        op: OP.specs,
        aspectRatio:
          recipe.aspectRatio ??
          resolveClosestStudioAspectRatio(recipe.width, recipe.height),
      })
  }
  if (wanted.has(PART.options)) {
    if (lora) {
      for (const [key, value] of Object.entries(recipe.options))
        if (ASSISTANT_NEXT_LORA_PARAM_KEYS[key.toLowerCase()])
          add({ op: OP.loraParam, key, value })
    } else {
      const onBench = new Set(
        (snapshot.capabilities ?? []).map((capability) => capability.key),
      )
      for (const [key, value] of Object.entries(recipe.options))
        if (onBench.has(key)) add({ op: OP.option, key, value })
    }
  }
  if (wanted.has(PART.references) && recipe.references.length > 0) {
    if (lora) notes.push('references: not on this bench')
    else {
      for (const tag of recipe.references)
        if (tag) add({ op: OP.addReference, picture: tag })
      const uploads = recipe.references.filter((tag) => !tag).length
      if (uploads)
        notes.push(
          `references: ${uploads} uploaded picture(s) that are not in the creator's library, so they cannot be mounted again`,
        )
    }
  }
  if (wanted.has(PART.loras) && recipe.loras.length > 0) {
    if (lora)
      for (const entry of recipe.loras)
        add({ op: OP.addLora, lora: entry.name, weight: entry.weight })
    else
      notes.push(
        `LoRAs (${recipe.loras.map((entry) => `${entry.name} @ ${entry.weight}`).join(', ')}): they only go on the LoRA bench`,
      )
  }
  // 首页那份小配方只有几格（第 9g 步）：没有的那几样照实说，⛔ 一条条报「不是这里的控件」。
  const ops = opsOf(context)
  const kept = changes.filter((next) =>
    ops.includes(next.op as AssistantNextEditOp),
  )
  const dropped = [
    ...new Set(
      changes
        .filter((next) => !ops.includes(next.op as AssistantNextEditOp))
        .map((next) => next.op),
    ),
  ]
  if (dropped.length)
    notes.push(
      `${dropped.join(', ')}: not in this draft (open the image bench for them)`,
    )
  return { ok: true, tag: recipe.tag, changes: kept, notes }
}

/** 一条改动交给这台的执行函数（编号先换好）。 */
async function* applyChange(
  context: V3Context,
  given: EditChange,
): AsyncGenerator<AssistantOperatorEvent, BenchResult> {
  if (given.op === OP.addLora) {
    if (context.face !== ASSISTANT_V3_FACE_IDS.lora)
      return {
        output: `"add_lora" is not a control on this bench. LoRAs go on the LoRA bench.`,
        error: true,
      }
    return outcomeOf(yield* mountLoraByName(context, given))
  }
  if (isLibraryOp(given.op))
    return outcomeOf(yield* runLibraryChange(context, given))
  const change = await withResolvedNames(context, given)
  const mutation = toV3Mutation(
    context.face as BenchFace,
    change,
    opsOf(context),
  )
  if (mutation.tool === null) return { output: mutation.error, error: true }
  const tool =
    mutation.tool === 'write'
      ? ASSISTANT_V3_TOOL_IDS.write
      : ASSISTANT_V3_TOOL_IDS.edit
  return outcomeOf(
    context.face === ASSISTANT_V3_FACE_IDS.lora
      ? yield* executeAssistantV3LoraMutation(context, tool, mutation.input)
      : context.face === ASSISTANT_V3_FACE_IDS.cards
        ? yield* executeAssistantV3CardsMutation(context, mutation.input)
        : yield* executeAssistantV3ImageMutation(context, tool, mutation.input),
  )
}

/**
 * edit：按顺序一条一条落，每条当场就有结果；一条不成不拦后面的（各自说清哪一条怎么了）。
 * 停在卡上（角色页的提议卡、LoRA 台的搭配卡等）就不再往下。
 */
export async function* runEdit(
  context: V3Context,
  changes: readonly EditChange[],
): AsyncGenerator<AssistantOperatorEvent, BenchResult> {
  if (context.face === ASSISTANT_V3_FACE_IDS.canvas)
    return yield* runCanvasEdit(context, changes)
  const lines: string[] = []
  let failed = 0
  let total = 0
  for (const [index, change] of changes.entries()) {
    const label = `${index + 1}. ${change.op}`
    if (change.op !== OP.applyRecipe) {
      total += 1
      const result = yield* applyChange(context, change)
      if (result.error) failed += 1
      lines.push(
        `${label} — ${result.error ? 'not done: ' : ''}${result.output}`,
      )
      if (result.stop)
        return { output: lines.join('\n'), error: false, stop: true }
      continue
    }
    if (!opsOf(context).includes(OP.applyRecipe)) {
      total += 1
      failed += 1
      lines.push(
        `${label} — not done: there is no recipe to apply on this page.`,
      )
      continue
    }
    const recipe = await recipeChanges(context, change)
    if (!recipe.ok) {
      total += 1
      failed += 1
      lines.push(`${label} — not done: ${recipe.error}`)
      continue
    }
    lines.push(`${label} ${recipe.tag}:`)
    for (const part of recipe.changes) {
      total += 1
      const result = yield* applyChange(context, part)
      if (result.error) failed += 1
      lines.push(
        `   · ${part.op} — ${result.error ? 'not done: ' : ''}${result.output}`,
      )
    }
    if (recipe.notes.length)
      lines.push(`   · not applied: ${recipe.notes.join('; ')}`)
    if (recipe.changes.length === 0 && recipe.notes.length === 0)
      lines.push('   · nothing to change: the bench already matches.')
  }
  return { output: lines.join('\n'), error: total > 0 && failed === total }
}

/**
 * 画布上的 edit：改库 / 设置 / 记忆照旧当场落；交接当场出卡；画布那几种合成一批交给循环
 * （同一步里几次 edit 再合成一批，浏览器一次落完再接着跑）。
 */
async function* runCanvasEdit(
  context: V3Context,
  changes: readonly EditChange[],
): AsyncGenerator<AssistantOperatorEvent, BenchResult> {
  const lines: string[] = []
  const ops: Parameters<typeof translateCanvasPieces>[1][number][] = []
  const writes: Parameters<typeof translateCanvasPieces>[2][number][] = []
  let failed = 0
  let total = 0
  for (const [index, change] of changes.entries()) {
    const label = `${index + 1}. ${change.op}`
    total += 1
    if (isLibraryOp(change.op)) {
      const result = outcomeOf(yield* runLibraryChange(context, change))
      if (result.error) failed += 1
      lines.push(
        `${label} — ${result.error ? 'not done: ' : ''}${result.output}`,
      )
      continue
    }
    const piece = toCanvasPiece(context, change)
    if (piece.kind === 'error') {
      failed += 1
      lines.push(`${label} — not done: ${piece.error}`)
      continue
    }
    if (piece.kind === 'edit') ops.push(piece.op)
    else writes.push(piece.entry)
    lines.push(`${label} — sent to the board (see BOARD below).`)
  }
  if (ops.length === 0 && writes.length === 0)
    return { output: lines.join('\n'), error: total > 0 && failed === total }
  const translated = translateCanvasPieces(context, ops, writes)
  if (!translated.ok) {
    const outcome = outcomeOf(
      yield* refused(
        context,
        ASSISTANT_OPERATOR_TOOL_IDS.canvasBatch,
        TITLE_TEXT[context.language].edit,
        translated.error,
      ),
    )
    lines.push(
      `BOARD — not done, nothing on the board changed: ${outcome.output}`,
    )
    return { output: lines.join('\n'), error: true }
  }
  return { output: lines.join('\n'), error: false, canvas: translated.batch }
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
  /** 认图要认的：眼前摆上来的之外，还有已在眼前的附图（不再附第二遍，但要认）。 */
  const toTag: AssistantV3PictureRef[] = []
  const benchNames: string[] = []
  let failed = 0
  for (const name of names) {
    // 角色页：打开那位的设定全文（look / identity / … / tags）。
    const profilePart =
      context.face === ASSISTANT_V3_FACE_IDS.cards
        ? renderAssistantV3CardsItem(name, context.request.snapshot)
        : null
    if (profilePart) {
      parts.push(profilePart)
      continue
    }
    const handle = parseWorkspaceHandle(name)
    // 附图的名字本身就长得像编号（`图_1588·摘要`）：台上认得的先给台上。
    const attached = attachedNames.some(
      (attachedName) =>
        attachedName.trim().toLowerCase() === name.trim().toLowerCase(),
    )
    if (!handle || attached) {
      benchNames.push(name)
      // 附着的库图（`图_1610`）：图已在眼前，配方照样读出来（只要文字，⛔ 不再附第二遍）。
      if (handle?.kind === 'picture') {
        const recipe = await openWorkspaceHandle(
          ownerOf(context),
          handle,
        ).catch(() => null)
        if (recipe) {
          parts.push(recipe.text)
          toTag.push(...recipe.pictures)
        }
      } else if (attached && input.tagger) {
        const asset = context.request.mentionedAssets?.find(
          (item) =>
            (item.label ?? item.id).trim().toLowerCase() ===
            name.trim().toLowerCase(),
        )
        if (asset) toTag.push({ url: asset.url, label: name })
      }
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
  if (benchNames.length > 0 && context.face === ASSISTANT_V3_FACE_IDS.canvas) {
    // 画布：卡的全文（与镜头带、型号写法）读出来；有图 / 有片的卡、附图、#n 摆到眼前。
    const split = splitCanvasLook(context, benchNames)
    if (split.read.length) {
      const read = outcomeOf(
        yield* executeAssistantV3CanvasCall(
          context,
          ASSISTANT_V3_TOOL_IDS.read,
          { cards: split.read },
        ),
      )
      if (read.error) failed += 1
      parts.unshift(read.output)
    }
    if (split.see.length) {
      const seen = outcomeOf(
        yield* executeAssistantV3CanvasCall(
          context,
          ASSISTANT_V3_TOOL_IDS.look,
          { cards: split.see, question: input.question ?? '' },
        ),
      )
      pictures.push(...(seen.pictures ?? []))
      parts.push(seen.output)
    }
  } else if (benchNames.length > 0) {
    const call =
      context.face === ASSISTANT_V3_FACE_IDS.lora
        ? executeAssistantV3LoraCall
        : context.face === ASSISTANT_V3_FACE_IDS.cards
          ? executeAssistantV3CardsCall
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
  if (input.tagger)
    parts.push(
      await readTaggerFor(context.prepared.user.id, [...pictures, ...toTag]),
    )
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
  if (context.face === ASSISTANT_V3_FACE_IDS.home)
    return {
      output:
        'Nothing is generated on the home page. Open the bench the picture belongs on (open image / tags / video / lora / canvas), set it up there, then generate.',
      error: true,
    }
  if (context.face === ASSISTANT_V3_FACE_IDS.cards)
    return {
      output:
        'The character page does not generate. To make a picture for a character, open the image bench and set it up there.',
      error: true,
    }
  if (context.face === ASSISTANT_V3_FACE_IDS.canvas) {
    if (!input.cards?.length)
      return {
        output:
          'generate on the canvas needs cards: every card to generate, by handle.',
        error: true,
      }
    return outcomeOf(
      yield* executeAssistantV3CanvasCall(
        context,
        input.upscale
          ? ASSISTANT_V3_TOOL_IDS.upscale
          : ASSISTANT_V3_TOOL_IDS.generate,
        { cards: input.cards },
      ),
    )
  }
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
