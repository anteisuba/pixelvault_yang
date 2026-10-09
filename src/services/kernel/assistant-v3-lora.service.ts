import 'server-only'

import { tool } from 'ai'

import {
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_LORA_EDIT_OP_IDS,
  ASSISTANT_V3_LORA_ITEM_IDS,
  ASSISTANT_V3_LORA_SEARCH_KIND,
  ASSISTANT_V3_TOOL_IDS,
} from '@/constants/assistant-v3'
import {
  normalizeCivitaiRunnerSampling,
  RUNNER_SAMPLERS,
  RUNNER_SCHEDULERS,
} from '@/constants/runner-sampling'
import { renderAssistantV3LoraItem } from '@/lib/assistant-v3-lora-board'
import {
  AssistantV3AskInputSchema,
  AssistantV3LoraEditInputSchema,
  AssistantV3LoraGenerateInputSchema,
  AssistantV3LoraLookInputSchema,
  AssistantV3LoraReadInputSchema,
  AssistantV3LoraSearchLibraryInputSchema,
  AssistantV3LoraWriteInputSchema,
  AssistantV3SearchWebInputSchema,
  type AssistantV3LoraEditOpInput,
} from '@/types/assistant-v3'
import type { AssistantLoraParameters } from '@/types/assistant-operator'
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
  sayAboveCard,
  TITLE_TEXT,
  type V3Context,
  type V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'

/**
 * v3 的 LoRA 台（S6 第一张脸）：工具名与画布同一套，动的是一张表单。
 *
 * ── 与画布的分别 ─────────────────────────────────────────────
 * · 改动随步落（旧执行器的 `mutate` 步，前端照旧按步写表单），当场就有结果，⛔ 不接力；
 * · 新挂 LoRA 只走搭配卡（`propose_setup`）或库页圈选（`show_picks`），挂载由创作者点
 *   （owner 2026-09-29，lora-assistant §13）；
 * · 写提示词不再问「你写过了，覆盖吗」：创作者叫助手改，就是要改；每一步都能撤销
 *   （真实对话里那一问次次都选覆盖）。
 */

export function assistantV3LoraTools(strict: boolean) {
  return {
    [ASSISTANT_V3_TOOL_IDS.read]: tool({
      description:
        'Read in full what the board shows clipped: "prompt", "negative", "sample" (the example open on the left, with its recipe), a LoRA handle (author prompt and source picture prompts) or a reference.',
      inputSchema: AssistantV3LoraReadInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.look]: tool({
      description:
        'Look at a picture with one specific question: a picture attached to the message (by its name), or a mounted reference ("ref-1"). The open example is already attached to the board message.',
      inputSchema: AssistantV3LoraLookInputSchema,
      strict,
    }),
    [ASSISTANT_V3_TOOL_IDS.edit]: tool({
      description:
        'Change the bench: base model, sampling parameters, a LoRA weight, unmount a LoRA or a reference, put a setup card in front of the creator, or ring LoRAs in the library. All ops of one request in ONE call.',
      inputSchema: AssistantV3LoraEditInputSchema,
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
        'kind "lora": search LoRAs — it opens the creator\'s library page and runs the search there, and returns candidates with candidateIds. Other kinds search the creator\'s own assets.',
      inputSchema: AssistantV3LoraSearchLibraryInputSchema,
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

function loraIdOf(
  context: V3Context,
  handle: string,
): { ok: true; id: string } | { ok: false; error: string } {
  const id = context.handles.idOf(handle)
  if (id) return { ok: true, id }
  const nearest = context.handles
    .nearest(handle)
    .map((other) => context.handles.handleOf(other))
  return {
    ok: false,
    error: `No mounted LoRA "${handle}"${nearest.length ? ` — did you mean ${nearest.join(', ')}?` : ''}.`,
  }
}

function loraName(context: V3Context, id: string): string {
  return (
    context.request.snapshot.loras?.items.find((item) => item.id === id)
      ?.name ?? id
  )
}

/** set_params → 旧执行器的那份参数（采样器认 Civitai 的叫法）。 */
function loraParameters(
  op: Extract<
    AssistantV3LoraEditOpInput,
    { op: typeof ASSISTANT_V3_LORA_EDIT_OP_IDS.setParams }
  >,
):
  | { ok: true; parameters: AssistantLoraParameters }
  | { ok: false; error: string } {
  const exact = <T extends string>(
    list: readonly T[],
    value: string | null,
  ): T | undefined =>
    value
      ? list.find((entry) => entry === value.trim().toLowerCase())
      : undefined
  const civitai = normalizeCivitaiRunnerSampling(
    op.sampler ?? undefined,
    op.scheduler ?? undefined,
  )
  const sampler = exact(RUNNER_SAMPLERS, op.sampler) ?? civitai.sampler
  const scheduler = exact(RUNNER_SCHEDULERS, op.scheduler) ?? civitai.scheduler
  if (op.sampler && !sampler)
    return {
      ok: false,
      error: `Sampler "${op.sampler}" is not one this base runs. Pick one of: ${RUNNER_SAMPLERS.join(', ')}.`,
    }
  if (op.scheduler && !scheduler)
    return {
      ok: false,
      error: `Scheduler "${op.scheduler}" is not one this base runs. Pick one of: ${RUNNER_SCHEDULERS.join(', ')}.`,
    }
  return {
    ok: true,
    parameters: {
      ...(op.steps !== null ? { steps: op.steps } : {}),
      ...(op.cfg !== null ? { guidanceScale: op.cfg } : {}),
      ...(op.seed !== null ? { runnerSeed: op.seed.trim() } : {}),
      ...(op.width !== null ? { runnerWidth: op.width } : {}),
      ...(op.height !== null ? { runnerHeight: op.height } : {}),
      ...(sampler ? { runnerSampler: sampler } : {}),
      // 只说了「Euler a Karras」这种连着写的：调度器跟着采样器一起认出来。
      ...(scheduler ? { runnerScheduler: scheduler } : {}),
    },
  }
}

async function* runEditOp(
  context: V3Context,
  op: AssistantV3LoraEditOpInput,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  switch (op.op) {
    case ASSISTANT_V3_LORA_EDIT_OP_IDS.setModel: {
      const wanted = op.model.trim().toLowerCase()
      const match = context.request.snapshot.availableModels.find(
        (option) =>
          option.id.toLowerCase() === wanted ||
          option.label.toLowerCase() === wanted,
      )
      const title = `${text.model} ${match?.label ?? op.model}`
      if (!match)
        return yield* refused(
          context,
          TOOL.setModel,
          title,
          `"${op.model}" is not one of the base models on the board.`,
        )
      return yield* runOldTool(context, TOOL.setModel, title, {
        modelId: match.id,
      })
    }
    case ASSISTANT_V3_LORA_EDIT_OP_IDS.setParams: {
      const mapped = loraParameters(op)
      if (!mapped.ok)
        return yield* refused(
          context,
          TOOL.setLoraParameters,
          text.params,
          mapped.error,
        )
      return yield* runOldTool(
        context,
        TOOL.setLoraParameters,
        text.params,
        mapped.parameters,
      )
    }
    case ASSISTANT_V3_LORA_EDIT_OP_IDS.setWeight: {
      const lora = loraIdOf(context, op.lora)
      const title = `${text.weight}「${lora.ok ? loraName(context, lora.id) : op.lora}」`
      if (!lora.ok)
        return yield* refused(context, TOOL.setLoraWeight, title, lora.error)
      return yield* runOldTool(context, TOOL.setLoraWeight, title, {
        loraId: lora.id,
        weight: op.weight,
      })
    }
    case ASSISTANT_V3_LORA_EDIT_OP_IDS.unmount: {
      const lora = loraIdOf(context, op.lora)
      const title = `${text.unmount}「${lora.ok ? loraName(context, lora.id) : op.lora}」`
      if (!lora.ok)
        return yield* refused(context, TOOL.unmountLora, title, lora.error)
      return yield* runOldTool(context, TOOL.unmountLora, title, {
        loraId: lora.id,
      })
    }
    case ASSISTANT_V3_LORA_EDIT_OP_IDS.unmountReference:
      return yield* unmountReference(context, op.ref)
    case ASSISTANT_V3_LORA_EDIT_OP_IDS.proposeSetup: {
      const unmounts: { loraId: string }[] = []
      const weights: { loraId: string; weight: number }[] = []
      for (const handle of op.unmounts) {
        const lora = loraIdOf(context, handle)
        if (!lora.ok)
          return yield* refused(
            context,
            TOOL.planLoraSetup,
            text.setup,
            lora.error,
          )
        unmounts.push({ loraId: lora.id })
      }
      for (const entry of op.weights) {
        const lora = loraIdOf(context, entry.lora)
        if (!lora.ok)
          return yield* refused(
            context,
            TOOL.planLoraSetup,
            text.setup,
            lora.error,
          )
        weights.push({ loraId: lora.id, weight: entry.weight })
      }
      yield* sayAboveCard(context, op.say)
      return yield* runOldTool(context, TOOL.planLoraSetup, text.setup, {
        question: op.question,
        ...(op.mounts.length
          ? {
              mounts: op.mounts.map((mount) => ({
                candidateId: mount.candidate,
                ...(mount.weight !== null ? { weight: mount.weight } : {}),
              })),
            }
          : {}),
        ...(unmounts.length ? { unmounts } : {}),
        ...(weights.length ? { weights } : {}),
      })
    }
    case ASSISTANT_V3_LORA_EDIT_OP_IDS.showPicks:
      return yield* runOldTool(context, TOOL.showLoraPicks, text.picks, {
        candidateIds: op.candidates,
      })
  }
}

/** edit / write：逐条交给旧执行器，随步落。停在搭配卡上就不再往下。 */
export async function* executeAssistantV3LoraMutation(
  context: V3Context,
  name: typeof ASSISTANT_V3_TOOL_IDS.edit | typeof ASSISTANT_V3_TOOL_IDS.write,
  input: unknown,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const outcomes: V3Outcome[] = []
  if (name === ASSISTANT_V3_TOOL_IDS.edit) {
    const ops = AssistantV3LoraEditInputSchema.parse(input).ops
    if (ops.length > ASSISTANT_V3_LIMITS.maxEditOps)
      return {
        kind: 'result',
        output: `That is ${ops.length} changes at once; at most ${ASSISTANT_V3_LIMITS.maxEditOps}. Split it.`,
        error: true,
        failureKey: 'edit:tooMany',
      }
    for (const op of ops) {
      const outcome = yield* runEditOp(context, op)
      outcomes.push(outcome)
      if (outcome.kind === 'stop') break
    }
    return joinOutcomes(outcomes)
  }
  return yield* executeBenchWrite(context, input)
}

/** read / look / generate / search_library 在 LoRA 台上的样子。别的工具与画布共用。 */
export async function* executeAssistantV3LoraCall(
  context: V3Context,
  name:
    | typeof ASSISTANT_V3_TOOL_IDS.read
    | typeof ASSISTANT_V3_TOOL_IDS.look
    | typeof ASSISTANT_V3_TOOL_IDS.generate
    | typeof ASSISTANT_V3_TOOL_IDS.searchLibrary,
  input: unknown,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  const snapshot = context.request.snapshot
  switch (name) {
    case ASSISTANT_V3_TOOL_IDS.read: {
      const items = AssistantV3LoraReadInputSchema.parse(input).items.slice(
        0,
        ASSISTANT_V3_LIMITS.maxReadCards,
      )
      const title = joinPhrases(
        context,
        items.map((item) => `${text.read} ${item}`),
      )
      const rendered = items.map((item) => ({
        item,
        text: renderAssistantV3LoraItem(item, snapshot, context.handles),
      }))
      const unknown = rendered.filter((entry) => entry.text === null)
      if (items.length === 0 || unknown.length)
        return yield* refused(
          context,
          TOOL.readState,
          title,
          items.length === 0
            ? 'items is empty'
            : `Nothing called ${unknown.map((entry) => `"${entry.item}"`).join(', ')} on the bench. Use "prompt", "negative", "sample", a LoRA handle or "ref-N".`,
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
      const parsed = AssistantV3LoraLookInputSchema.parse(input)
      const wantsSample = parsed.images.some(
        (image) =>
          image.trim().toLowerCase() === ASSISTANT_V3_LORA_ITEM_IDS.sample,
      )
      const others = parsed.images.filter(
        (image) =>
          image.trim().toLowerCase() !== ASSISTANT_V3_LORA_ITEM_IDS.sample,
      )
      const sample: V3Outcome[] = wantsSample
        ? [
            {
              kind: 'result',
              output: snapshot.viewingRecipe
                ? 'The open example is attached to the board message of this turn: look at it there.'
                : 'No example picture is open on the left.',
              error: !snapshot.viewingRecipe,
            },
          ]
        : []
      return joinOutcomes([
        ...sample,
        ...(others.length
          ? [yield* executeBenchLook(context, others, parsed.question)]
          : []),
      ])
    }
    case ASSISTANT_V3_TOOL_IDS.generate:
      return yield* executeBenchGenerate(context, input)
    case ASSISTANT_V3_TOOL_IDS.searchLibrary: {
      const parsed = AssistantV3LoraSearchLibraryInputSchema.parse(input)
      if (parsed.kind === ASSISTANT_V3_LORA_SEARCH_KIND)
        return yield* runOldTool(
          context,
          TOOL.searchLoras,
          `${text.searchLora} ${parsed.query}`,
          { query: parsed.query },
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
