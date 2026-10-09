import 'server-only'

import { tool } from 'ai'

import {
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_FACE_IDS,
  ASSISTANT_V3_IMAGE_EDIT_OP_IDS,
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_TOOL_IDS,
  ASSISTANT_V3_WEB_IMAGES_SEARCH_KIND,
} from '@/constants/assistant-v3'
import { renderAssistantV3ImageItem } from '@/lib/assistant-v3-image-board'
import {
  AssistantV3AskInputSchema,
  AssistantV3ImageEditInputSchema,
  AssistantV3ImageLookInputSchema,
  AssistantV3ImageReadInputSchema,
  AssistantV3ImageSearchLibraryInputSchema,
  AssistantV3LoraGenerateInputSchema,
  AssistantV3LoraWriteInputSchema,
  AssistantV3SearchWebInputSchema,
  AssistantV3VideoEditInputSchema,
  type AssistantV3ImageEditOpInput,
  type AssistantV3VideoEditOpInput,
} from '@/types/assistant-v3'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import { toStepEvent } from '@/services/kernel/assistant-operator.service'
import {
  executeBenchGenerate,
  executeBenchLook,
  executeBenchWrite,
  joinOutcomes,
  refused,
  runOldTool,
  unmountReference,
} from '@/services/kernel/assistant-v3-bench.service'
import {
  joinPhrases,
  nextStep,
  TITLE_TEXT,
  type V3Context,
  type V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'

/**
 * v3 的图片台（S6 第二张脸）：工具名与画布、LoRA 台同一套，动的是一张表单，改动随步落。
 *
 * ⭐ 写提示词不走旧内核的「参考图证据简报」那道闸（`run.v3` 让规划器跳过）：v3 的
 *   模型自己用 look 看参考图再写。旧闸在真实对话里把人卡住（09-16「有问题你直接反问
 *   我，不要一直卡住」）。
 */

/** 没有清晰度档的模型那一格的值（旧执行器 `planSetSpecs` 收到就写 auto）。 */
const SPECS_TIERLESS_RESOLUTION = 'auto'

export function assistantV3ImageTools(strict: boolean) {
  return {
    [ASSISTANT_V3_TOOL_IDS.read]: tool({
      description:
        'Read in full what the board shows clipped: "prompt", "negative" or a reference ("ref-1").',
      inputSchema: AssistantV3ImageReadInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.look]: tool({
      description:
        'Look at pictures with one specific question: pictures attached to the message (by name) or mounted references ("ref-1").',
      inputSchema: AssistantV3ImageLookInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.edit]: tool({
      description:
        'Change the bench: model, specs, pictures per run, model options, mount or unmount references, import a link. All ops of one request in ONE call.',
      inputSchema: AssistantV3ImageEditInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.write]: tool({
      description:
        'Write the prompt or the negative prompt. mode "edit" replaces exact {find, replace} pairs and touches nothing else; "replace" rewrites the whole field; "append" adds to the end.',
      inputSchema: AssistantV3LoraWriteInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.generate]: tool({
      description:
        'Put a generation confirm card in front of the creator for what is on the bench now. It spends nothing until they press it.',
      inputSchema: AssistantV3LoraGenerateInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.searchWeb]: tool({
      description:
        'Look something up on the web: a work, a character, a technique, a model. Give a goal and the names it turns on.',
      inputSchema: AssistantV3SearchWebInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.searchLibrary]: tool({
      description:
        'kind "image" / "video" / "audio": search the creator\'s own assets (results carry asset ids for mount_reference). kind "web_images": find pictures on the web — they appear in the panel and the creator picks which to use.',
      inputSchema: AssistantV3ImageSearchLibraryInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.ask]: tool({
      description:
        'Ask the creator when you cannot go on without their choice. Every option needs a one-line description of what it means.',
      inputSchema: AssistantV3AskInputSchema,
      strict,
    }),
  }
}

/** 视频台：图片台同一套工具，edit 换成视频那一份（时长、首尾帧、参考声音、原声）。 */
export function assistantV3VideoTools(strict: boolean) {
  return {
    ...assistantV3ImageTools(strict),
    [ASSISTANT_V3_TOOL_IDS.edit]: tool({
      description:
        'Change the bench: model, clip specs, model options, first/last frame or reference pictures, voice clips, the soundtrack switch, import a link. All ops of one request in ONE call.',
      inputSchema: AssistantV3VideoEditInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.searchLibrary]: tool({
      description:
        'kind "image" / "video" / "audio": search the creator\'s own assets (results carry asset ids for mount_reference and mount_audio). kind "web_images": find pictures on the web — they appear in the panel and the creator picks which to use.',
      inputSchema: AssistantV3ImageSearchLibraryInputSchema,
      strict,
    }),
  }
}

const FRAME_SLOTS: readonly string[] = ['first', 'last']

/** 创作者在话里提到了清晰度没有（数字档位或这几个词）。 */
const RESOLUTION_WORDS =
  /\d{3,4}\s*p|\b[248]k\b|清晰度|分辨率|高清|画质|解像度|resolution/i

function creatorSaid(context: V3Context, words: RegExp): boolean {
  return context.request.messages.some(
    (message) => message.role === 'user' && words.test(message.content),
  )
}

async function* runVideoEditOp(
  context: V3Context,
  op: AssistantV3VideoEditOpInput,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  switch (op.op) {
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSpecs: {
      // ⭐ 清晰度是花钱的那一格：创作者没提就不动（2026-10-10 回放 V1：没人要，模型两次都
      //   自己挑了 1080p；提示词里写了也不听）。
      const askedResolution = creatorSaid(context, RESOLUTION_WORDS)
      const resolution = askedResolution ? op.resolution : null
      const dropped = Boolean(op.resolution) && !askedResolution
      if (op.duration === null && !op.aspectRatio && !resolution)
        return {
          kind: 'result',
          output: dropped
            ? 'Resolution stays as it is: the creator did not ask to change it. Nothing else to set.'
            : 'set_specs needs at least one of duration, aspectRatio, resolution.',
          error: !dropped,
        }
      const outcome = yield* runOldTool(
        context,
        TOOL.setVideoSpecs,
        text.specs,
        {
          ...(op.duration !== null ? { durationSeconds: op.duration } : {}),
          ...(op.aspectRatio ? { aspectRatio: op.aspectRatio } : {}),
          ...(resolution ? { resolution } : {}),
        },
      )
      return dropped && outcome.kind === 'result'
        ? {
            ...outcome,
            output: `${outcome.output}\nResolution left as it is: the creator did not ask to change it (higher tiers cost more).`,
          }
        : outcome
    }
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.mountReference: {
      const key = op.asset.trim().toLowerCase()
      const attached = (context.request.mentionedAssets ?? []).find(
        (asset) =>
          asset.label?.trim().toLowerCase() === key || asset.id === op.asset,
      )
      return yield* runOldTool(
        context,
        TOOL.mountReference,
        `${text.mountReference}「${attached?.label ?? op.asset}」`,
        {
          assetId: attached?.id ?? op.asset.trim(),
          ...(op.slot ? { slot: op.slot } : {}),
        },
      )
    }
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.unmountReference: {
      const slot = op.ref.trim().toLowerCase()
      if (FRAME_SLOTS.includes(slot))
        return yield* runOldTool(
          context,
          TOOL.unmountReference,
          `${text.unmount} ${slot}`,
          { slot },
        )
      return yield* unmountReference(context, op.ref)
    }
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.mountAudio:
      return yield* runOldTool(
        context,
        TOOL.mountAudioReference,
        `${text.mountReference}${op.owner ? `「${op.owner}」` : ''}`,
        {
          assetId: op.asset.trim(),
          ...(op.owner?.trim() ? { ownerName: op.owner.trim() } : {}),
        },
      )
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSound:
      return yield* runOldTool(context, TOOL.setSound, text.option, {
        enabled: op.enabled,
      })
    default:
      // 换模型 / 选项 / 导入链接：与图片台同形，交给同一条路。
      return yield* runEditOp(context, op)
  }
}

async function* runEditOp(
  context: V3Context,
  op: AssistantV3ImageEditOpInput,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  const snapshot = context.request.snapshot
  switch (op.op) {
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setModel: {
      const wanted = op.model.trim().toLowerCase()
      const matches = (option: { id: string; label?: string }) =>
        option.id.toLowerCase() === wanted ||
        option.label?.toLowerCase() === wanted
      const match = snapshot.availableModels.find(matches)
      const title = `${text.imageModel} ${match?.label ?? op.model}`
      if (!match) {
        const elsewhere = snapshot.otherWorkbenchModels?.find(matches)
        return yield* refused(
          context,
          TOOL.setModel,
          title,
          elsewhere
            ? `${elsewhere.label} lives on another workbench and cannot be picked here. Say so to the creator.`
            : `"${op.model}" is not one of the models on the board.`,
        )
      }
      const channelKey = op.channel?.trim().toLowerCase()
      const channel = channelKey
        ? match.channels?.find(
            (entry) =>
              entry.id.toLowerCase() === channelKey ||
              entry.label.toLowerCase() === channelKey,
          )
        : undefined
      if (channelKey && !channel)
        return yield* refused(
          context,
          TOOL.setModel,
          title,
          `${match.label} has no channel "${op.channel}".`,
        )
      return yield* runOldTool(context, TOOL.setModel, title, {
        modelId: match.id,
        ...(channel ? { channelId: channel.id } : {}),
      })
    }
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSpecs: {
      // 旧执行器要求比例与清晰度一起给：没说的那一格沿用台上现在的值；这个模型
      // 本来没有清晰度档（Seedream Lite、NAI）时写 auto，与旧执行器同一口径。
      const specs = snapshot.specs
      const aspectRatio = op.aspectRatio ?? specs?.aspectRatio ?? null
      const resolution =
        op.resolution ??
        specs?.resolution ??
        (specs && specs.resolutionOptions.length === 0
          ? SPECS_TIERLESS_RESOLUTION
          : null)
      if (!aspectRatio || !resolution)
        return yield* refused(
          context,
          TOOL.setSpecs,
          text.specs,
          specs
            ? `Give both aspectRatio and resolution: this bench has none set yet (aspect ratios ${specs.aspectRatioOptions.join(', ')}; resolutions ${specs.resolutionOptions.join(', ')}).`
            : 'This model has no size controls.',
        )
      return yield* runOldTool(context, TOOL.setSpecs, text.specs, {
        aspectRatio,
        resolution,
        ...(op.quality ? { quality: op.quality } : {}),
        ...(op.background ? { background: op.background } : {}),
      })
    }
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setCount:
      return yield* runOldTool(
        context,
        TOOL.setCount,
        `${text.count} ${op.count}`,
        { count: op.count },
      )
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setOption:
      return yield* runOldTool(
        context,
        TOOL.setCapability,
        `${text.option} ${op.key}`,
        { key: op.key, value: op.value },
      )
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.mountReference: {
      const key = op.asset.trim().toLowerCase()
      const attached = (context.request.mentionedAssets ?? []).find(
        (asset) =>
          asset.label?.trim().toLowerCase() === key || asset.id === op.asset,
      )
      return yield* runOldTool(
        context,
        TOOL.mountReference,
        `${text.mountReference}「${attached?.label ?? op.asset}」`,
        { assetId: attached?.id ?? op.asset.trim() },
      )
    }
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.unmountReference:
      return yield* unmountReference(context, op.ref)
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.importUrl:
      return yield* runOldTool(context, TOOL.importUserUrl, text.importUrl, {
        url: op.url.trim(),
      })
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setPeople:
      return yield* runOldTool(context, TOOL.setTagCharacters, text.people, {
        positioning: op.positioning,
        characters: op.people.map((person) => ({
          prompt: person.prompt,
          ...(person.negative !== null
            ? { negativePrompt: person.negative }
            : {}),
          ...(person.x !== null ? { x: person.x } : {}),
          ...(person.y !== null ? { y: person.y } : {}),
          ...(person.interactions !== null
            ? { interactions: person.interactions }
            : {}),
          ...(person.dialogue !== null ? { dialogue: person.dialogue } : {}),
        })),
      })
    case ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSceneTexts:
      return yield* runOldTool(context, TOOL.setSceneTexts, text.sceneTexts, {
        items: op.items,
      })
  }
}

/** edit / write：逐条交给旧执行器，随步落。 */
export async function* executeAssistantV3ImageMutation(
  context: V3Context,
  name: typeof ASSISTANT_V3_TOOL_IDS.edit | typeof ASSISTANT_V3_TOOL_IDS.write,
  input: unknown,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  if (name === ASSISTANT_V3_TOOL_IDS.write)
    return yield* executeBenchWrite(context, input)
  const video = context.face === ASSISTANT_V3_FACE_IDS.video
  const ops = video
    ? AssistantV3VideoEditInputSchema.parse(input).ops
    : AssistantV3ImageEditInputSchema.parse(input).ops
  if (ops.length > ASSISTANT_V3_LIMITS.maxEditOps)
    return {
      kind: 'result',
      output: `That is ${ops.length} changes at once; at most ${ASSISTANT_V3_LIMITS.maxEditOps}. Split it.`,
      error: true,
      failureKey: 'edit:tooMany',
    }
  const outcomes: V3Outcome[] = []
  for (const op of ops) {
    const outcome = video
      ? yield* runVideoEditOp(context, op as AssistantV3VideoEditOpInput)
      : yield* runEditOp(context, op as AssistantV3ImageEditOpInput)
    outcomes.push(outcome)
    if (outcome.kind === 'stop') break
  }
  return joinOutcomes(outcomes)
}

/** read / look / generate / search_library 在图片台上的样子。别的工具与画布共用。 */
export async function* executeAssistantV3ImageCall(
  context: V3Context,
  name:
    | typeof ASSISTANT_V3_TOOL_IDS.read
    | typeof ASSISTANT_V3_TOOL_IDS.look
    | typeof ASSISTANT_V3_TOOL_IDS.generate
    | typeof ASSISTANT_V3_TOOL_IDS.searchLibrary,
  input: unknown,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  switch (name) {
    case ASSISTANT_V3_TOOL_IDS.read: {
      const items = AssistantV3ImageReadInputSchema.parse(input).items.slice(
        0,
        ASSISTANT_V3_LIMITS.maxReadCards,
      )
      const title = joinPhrases(
        context,
        items.map((item) => `${text.read} ${item}`),
      )
      const rendered = items.map((item) => ({
        item,
        text: renderAssistantV3ImageItem(item, context.request.snapshot),
      }))
      const unknown = rendered.filter((entry) => entry.text === null)
      if (items.length === 0 || unknown.length)
        return yield* refused(
          context,
          TOOL.readState,
          title,
          items.length === 0
            ? 'items is empty'
            : `Nothing called ${unknown.map((entry) => `"${entry.item}"`).join(', ')} on the bench. Use "prompt", "negative" or "ref-N".`,
        )
      const step = nextStep(context, TOOL.readState, title)
      yield toStepEvent({
        ...step,
        status: STATUS.done,
        payload: { items },
        result: {
          digest: items
            .join(' · ')
            .slice(0, ASSISTANT_OPERATOR_LIMITS.maxMessageChars),
        },
      })
      return {
        kind: 'result',
        output: rendered.map((entry) => entry.text).join('\n'),
        error: false,
      }
    }
    case ASSISTANT_V3_TOOL_IDS.look: {
      const parsed = AssistantV3ImageLookInputSchema.parse(input)
      return yield* executeBenchLook(context, parsed.images, parsed.question)
    }
    case ASSISTANT_V3_TOOL_IDS.generate:
      return yield* executeBenchGenerate(context, input)
    case ASSISTANT_V3_TOOL_IDS.searchLibrary: {
      const parsed = AssistantV3ImageSearchLibraryInputSchema.parse(input)
      if (parsed.kind === ASSISTANT_V3_WEB_IMAGES_SEARCH_KIND)
        return yield* runOldTool(
          context,
          TOOL.searchWebImages,
          `${text.searchImages} ${parsed.query}`,
          {
            query: parsed.query,
            ...(parsed.subject?.trim()
              ? { subject: parsed.subject.trim(), preferOfficial: true }
              : {}),
          },
        )
      return yield* runOldTool(
        context,
        TOOL.searchAssets,
        `${text.searchLibrary} ${parsed.query}`,
        { query: parsed.query, kind: parsed.kind },
      )
    }
  }
}
