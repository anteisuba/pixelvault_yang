import 'server-only'

import {
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_LORA_EDIT_OP_IDS,
  ASSISTANT_V3_LORA_ITEM_IDS,
  ASSISTANT_V3_LORA_SEARCH_KIND,
  ASSISTANT_V3_TOOL_IDS,
  ASSISTANT_V3_MEMORIES_SEARCH_KIND,
  isAssistantV3WebSearchKind,
} from '@/constants/assistant-v3'
import {
  normalizeCivitaiRunnerSampling,
  RUNNER_SAMPLERS,
  RUNNER_SCHEDULERS,
} from '@/constants/runner-sampling'
import { renderAssistantV3LoraItem } from '@/lib/assistant-v3-lora-board'
import {
  AssistantV3LoraEditInputSchema,
  AssistantV3LoraLookInputSchema,
  AssistantV3LoraReadInputSchema,
  AssistantV3LoraSearchLibraryInputSchema,
  type AssistantV3LoraEditOpInput,
} from '@/types/assistant-v3'
import type { AssistantLoraParameters } from '@/types/assistant-operator'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import { searchMemoriesStep } from '@/services/kernel/assistant-v3-memories.service'
import { toStepEvent } from '@/services/kernel/assistant-operator.service'
import {
  executeBenchGenerate,
  executeBenchLook,
  executeBenchWrite,
  joinOutcomes,
  refused,
  runOldTool,
  runWebFind,
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
          REJECT.notOnBench,
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
          REJECT.notOnBench,
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
      // `sample` = 左边打开着的示例图（它已经跟着板子附上了，look 只指给模型看）。
      return yield* executeBenchLook(
        context,
        parsed.images,
        parsed.question,
        (name) =>
          name.trim().toLowerCase() !== ASSISTANT_V3_LORA_ITEM_IDS.sample
            ? null
            : snapshot.viewingRecipe
              ? [
                  {
                    url: snapshot.viewingRecipe.recipe.imageUrl,
                    label: ASSISTANT_V3_LORA_ITEM_IDS.sample,
                  },
                ]
              : 'No example picture is open on the left.',
      )
    }
    case ASSISTANT_V3_TOOL_IDS.generate:
      return yield* executeBenchGenerate(context, input)
    case ASSISTANT_V3_TOOL_IDS.searchLibrary: {
      const parsed = AssistantV3LoraSearchLibraryInputSchema.parse(input)
      if (parsed.kind === ASSISTANT_V3_MEMORIES_SEARCH_KIND)
        return yield* searchMemoriesStep(context, parsed.query)
      if (parsed.kind === ASSISTANT_V3_LORA_SEARCH_KIND)
        return yield* runOldTool(
          context,
          TOOL.searchLoras,
          `${text.searchLora} ${parsed.query}`,
          { query: parsed.query },
        )
      if (isAssistantV3WebSearchKind(parsed.kind))
        return yield* runWebFind(
          context,
          parsed.kind,
          parsed.query,
          parsed.subject,
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
