import 'server-only'

import { tool } from 'ai'

import {
  ASSISTANT_OPERATOR_APPEND_SEPARATOR,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_LORA_EDIT_OP_IDS,
  ASSISTANT_V3_LORA_ITEM_IDS,
  ASSISTANT_V3_LORA_SEARCH_KIND,
  ASSISTANT_V3_LORA_WRITE_FIELD_IDS,
  ASSISTANT_V3_TOOL_IDS,
  ASSISTANT_V3_WRITE_MODE_IDS,
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
  type AssistantV3LoraWriteEntry,
} from '@/types/assistant-v3'
import type { AssistantLoraParameters } from '@/types/assistant-operator'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import {
  planCritiqueResult,
  toStepEvent,
} from '@/services/kernel/assistant-operator.service'
import {
  joinPhrases,
  nextStep,
  planGuarded,
  planSafely,
  rejectedStep,
  settlePlan,
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

/** 旧执行器的话里提到的旧工具名 → v3 的说法（旧内核删掉时一起删）。 */
const V3_WORDS: readonly [RegExp, string][] = [
  [/\bset_prompt\b/g, 'write (prompt)'],
  [/\bset_negative\b/g, 'write (negative)'],
  [/\banalyze_references\b/g, 'look (ref-N)'],
  [/\bcritique_result\b/g, 'look'],
  [/\bsearch_loras\b/g, 'search_library kind "lora"'],
  [/\bshow_lora_picks\b/g, 'edit show_picks'],
  [/\bplan_lora_setup\b/g, 'edit propose_setup'],
  [/\bset_lora_weight\b/g, 'edit set_weight'],
  [/\bset_lora_parameters\b/g, 'edit set_params'],
  [/\bunmount_lora\b/g, 'edit unmount'],
  [/\brequest_generation\b/g, 'generate'],
  [/@Image(\d+)/g, 'ref-$1'],
]

function inV3Words(outcome: V3Outcome): V3Outcome {
  if (outcome.kind !== 'result') return outcome
  return {
    ...outcome,
    output: V3_WORDS.reduce(
      (text, [pattern, word]) => text.replace(pattern, word),
      outcome.output,
    ),
  }
}

function joinOutcomes(outcomes: readonly V3Outcome[]): V3Outcome {
  const stop = outcomes.find((outcome) => outcome.kind === 'stop')
  if (stop) return stop
  const results = outcomes.flatMap((outcome) =>
    outcome.kind === 'result' ? [outcome] : [],
  )
  const failed = results.find((outcome) => outcome.error)
  return {
    kind: 'result',
    output: results.map((outcome) => outcome.output).join('\n'),
    error: Boolean(failed),
    ...(failed?.failureKey ? { failureKey: failed.failureKey } : {}),
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

async function* runOldTool(
  context: V3Context,
  tool: AssistantOperatorTool,
  title: string,
  args: unknown,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  return inV3Words(
    yield* settlePlan(
      context,
      tool,
      title,
      await planSafely(context, tool, args),
    ),
  )
}

function* refused(
  context: V3Context,
  tool: AssistantOperatorTool,
  title: string,
  error: string,
): Generator<AssistantOperatorEvent, V3Outcome> {
  return yield* rejectedStep(
    context,
    tool,
    title,
    REJECT.noSuchControl,
    error,
    true,
  )
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
    case ASSISTANT_V3_LORA_EDIT_OP_IDS.unmountReference: {
      const index =
        Number(
          op.ref
            .trim()
            .toLowerCase()
            .replace(ASSISTANT_V3_LORA_ITEM_IDS.referencePrefix, ''),
        ) - 1
      const title = `${text.unmount} ${op.ref}`
      if (
        !Number.isInteger(index) ||
        !context.request.snapshot.references?.items[index]
      )
        return yield* refused(
          context,
          TOOL.unmountReference,
          title,
          `There is no reference "${op.ref}" on the bench.`,
        )
      return yield* runOldTool(context, TOOL.unmountReference, title, {
        slotIndex: index,
      })
    }
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

/**
 * 写进去的整段。⚠ 追加也在这里拼好整段再写：旧执行器带着 `overwrite` 时把追加读成
 * 整段替换（2026-10-09 回放 L3：提示词被换成「, Tianliang, 明日方舟」）。
 */
function writtenText(
  current: string,
  entry: AssistantV3LoraWriteEntry,
): { ok: true; value: string } | { ok: false; error: string } {
  if (entry.mode !== ASSISTANT_V3_WRITE_MODE_IDS.edit) {
    const text = entry.text?.trim()
    if (!text) return { ok: false, error: `mode "${entry.mode}" needs text.` }
    return {
      ok: true,
      value:
        entry.mode === ASSISTANT_V3_WRITE_MODE_IDS.append && current.trim()
          ? `${current.trim()}${ASSISTANT_OPERATOR_APPEND_SEPARATOR}${text.replace(/^[,\s]+/, '')}`
          : text,
    }
  }
  const edits = (entry.edits ?? []).slice(0, ASSISTANT_V3_LIMITS.maxWriteEdits)
  if (edits.length === 0)
    return {
      ok: false,
      error: 'mode "edit" needs at least one {find, replace}.',
    }
  const spans: { start: number; end: number; replace: string }[] = []
  for (const edit of edits) {
    const start = current.indexOf(edit.find)
    if (!edit.find || start < 0)
      return {
        ok: false,
        error: `"${edit.find}" does not occur in the ${entry.field}. Read it and copy the words exactly.`,
      }
    if (current.indexOf(edit.find, start + 1) >= 0)
      return {
        ok: false,
        error: `"${edit.find}" occurs more than once in the ${entry.field}; take a few more words around it.`,
      }
    const end = start + edit.find.length
    if (spans.some((span) => start < span.end && span.start < end))
      return { ok: false, error: `"${edit.find}" overlaps another find.` }
    spans.push({ start, end, replace: edit.replace })
  }
  const value = spans
    .sort((left, right) => right.start - left.start)
    .reduce(
      (text, span) =>
        `${text.slice(0, span.start)}${span.replace}${text.slice(span.end)}`,
      current,
    )
  return { ok: true, value }
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
  const text = TITLE_TEXT[context.language]
  const run = context.prepared.run
  for (const entry of AssistantV3LoraWriteInputSchema.parse(input).writes.slice(
    0,
    ASSISTANT_V3_LIMITS.maxWrites,
  )) {
    const isPrompt = entry.field === ASSISTANT_V3_LORA_WRITE_FIELD_IDS.prompt
    const tool = isPrompt ? TOOL.setPrompt : TOOL.setNegative
    const title = `${text.write}${isPrompt ? text.prompt : text.negative}`
    // ⚠ 读 run.state：同一轮里前一条写过的，后一条要接着它找句换句。
    const current = isPrompt
      ? run.state.prompt
      : (run.state.negativePrompt ?? '')
    const written = writtenText(current, entry)
    if (!written.ok) {
      outcomes.push(yield* refused(context, tool, title, written.error))
      continue
    }
    outcomes.push(
      yield* runOldTool(context, tool, title, {
        value: written.value,
        overwrite: true,
      }),
    )
  }
  return joinOutcomes(outcomes)
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
      const outcomes: V3Outcome[] = []
      const referenceIndices: number[] = []
      const mentioned = context.request.mentionedAssets ?? []
      for (const image of parsed.images.slice(
        0,
        ASSISTANT_V3_LIMITS.maxLookCards,
      )) {
        const key = image.trim().toLowerCase()
        if (key === ASSISTANT_V3_LORA_ITEM_IDS.sample) {
          outcomes.push({
            kind: 'result',
            output: snapshot.viewingRecipe
              ? 'The open example is attached to the board message of this turn: look at it there.'
              : 'No example picture is open on the left.',
            error: !snapshot.viewingRecipe,
          })
          continue
        }
        if (key.startsWith(ASSISTANT_V3_LORA_ITEM_IDS.referencePrefix)) {
          const index =
            Number(
              key.slice(ASSISTANT_V3_LORA_ITEM_IDS.referencePrefix.length),
            ) - 1
          if (Number.isInteger(index) && snapshot.references?.items[index]) {
            referenceIndices.push(index)
            continue
          }
        }
        const asset = mentioned.find(
          (candidate) =>
            candidate.label?.trim().toLowerCase() === key ||
            candidate.id === image,
        )
        if (!asset) {
          outcomes.push({
            kind: 'result',
            output: `Could not see "${image}": it is not a picture attached to this message, "sample" or a mounted reference. If it is a result, ask the creator to @ it.`,
            error: true,
            failureKey: 'look:unknown',
          })
          continue
        }
        const plan = await planGuarded(context, TOOL.critiqueResult, () =>
          planCritiqueResult(
            context.prepared.run,
            { goal: parsed.question, targetIds: [asset.id] },
            context.prepared.user.id,
          ),
        )
        outcomes.push(
          inV3Words(
            yield* settlePlan(
              context,
              TOOL.critiqueResult,
              `${text.look}「${asset.label ?? image}」`,
              plan,
            ),
          ),
        )
      }
      if (referenceIndices.length)
        outcomes.push(
          yield* runOldTool(
            context,
            TOOL.analyzeReferences,
            `${text.look} ${referenceIndices.map((index) => `ref-${index + 1}`).join('、')}`,
            { imageIndices: [...new Set(referenceIndices)] },
          ),
        )
      return joinOutcomes(outcomes)
    }
    case ASSISTANT_V3_TOOL_IDS.generate: {
      const parsed = AssistantV3LoraGenerateInputSchema.parse(input)
      return yield* runOldTool(
        context,
        TOOL.requestGeneration,
        text.generate,
        parsed.label ? { label: parsed.label } : {},
      )
    }
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
