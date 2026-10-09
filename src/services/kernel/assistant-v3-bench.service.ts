import 'server-only'

import {
  ASSISTANT_OPERATOR_APPEND_SEPARATOR,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_LORA_ITEM_IDS,
  ASSISTANT_V3_LORA_WRITE_FIELD_IDS,
  ASSISTANT_V3_WRITE_MODE_IDS,
} from '@/constants/assistant-v3'
import {
  AssistantV3LoraGenerateInputSchema,
  AssistantV3LoraWriteInputSchema,
  type AssistantV3LoraWriteEntry,
} from '@/types/assistant-v3'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import { planCritiqueResult } from '@/services/kernel/assistant-operator.service'
import {
  planGuarded,
  planSafely,
  rejectedStep,
  sayAboveCard,
  settlePlan,
  TITLE_TEXT,
  type V3Context,
  type V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'

/**
 * v3 两张「工作台」脸（LoRA 台、图片台）共用的那一层：改动随步落、当场就有结果。
 * 写提示词、看图、出确认卡在两台上是同一件事；各台只管自己的板子与旋钮。
 */

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
  [/\bset_specs\b/g, 'edit set_specs'],
  [/\bset_count\b/g, 'edit set_count'],
  [/\bset_capability\b/g, 'edit set_option'],
  [/\bmount_reference\b/g, 'edit mount_reference'],
  [/\bimport_user_url\b/g, 'edit import_url'],
  [/\bsearch_web_images\b/g, 'search_library kind "web_images"'],
  [/\bsearch_assets\b/g, 'search_library'],
  [/\brequest_generation\b/g, 'generate'],
  [/@Image(\d+)/g, 'ref-$1'],
]

export function inV3Words(outcome: V3Outcome): V3Outcome {
  if (outcome.kind !== 'result') return outcome
  return {
    ...outcome,
    output: V3_WORDS.reduce(
      (text, [pattern, word]) => text.replace(pattern, word),
      outcome.output,
    ),
  }
}

export function joinOutcomes(outcomes: readonly V3Outcome[]): V3Outcome {
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

export async function* runOldTool(
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

export function* refused(
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

/** `ref-2` → 第几张参考图（从 0 起）；对不上回 `null`。 */
export function referenceIndexOf(
  context: V3Context,
  ref: string,
): number | null {
  const key = ref.trim().toLowerCase()
  if (!key.startsWith(ASSISTANT_V3_LORA_ITEM_IDS.referencePrefix)) return null
  const index =
    Number(key.slice(ASSISTANT_V3_LORA_ITEM_IDS.referencePrefix.length)) - 1
  return Number.isInteger(index) &&
    context.request.snapshot.references?.items[index]
    ? index
    : null
}

/** 卸下一张参考图。⚠ 旧执行器的 `slotIndex` 是 @ImageN 的 N（从 1 起）。 */
export async function* unmountReference(
  context: V3Context,
  ref: string,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const title = `${TITLE_TEXT[context.language].unmount} ${ref}`
  const index = referenceIndexOf(context, ref)
  if (index === null)
    return yield* refused(
      context,
      TOOL.unmountReference,
      title,
      `There is no reference "${ref}" on the bench.`,
    )
  return yield* runOldTool(context, TOOL.unmountReference, title, {
    slotIndex: index + 1,
  })
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

/**
 * write：逐条交给旧执行器，随步落。
 * ⭐ 写提示词不再问「你写过了，覆盖吗」：创作者叫助手改，就是要改；每一步都能撤销。
 */
export async function* executeBenchWrite(
  context: V3Context,
  input: unknown,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const outcomes: V3Outcome[] = []
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

/**
 * look：这条消息带的图（按名字）与挂着的参考图（`ref-N`）。
 * `sample` 由 LoRA 台先挑走（它跟着板子一起附上了）。
 */
export async function* executeBenchLook(
  context: V3Context,
  images: readonly string[],
  question: string,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  const outcomes: V3Outcome[] = []
  const referenceIndices: number[] = []
  const mentioned = context.request.mentionedAssets ?? []
  for (const image of images.slice(0, ASSISTANT_V3_LIMITS.maxLookCards)) {
    const key = image.trim().toLowerCase()
    const index = referenceIndexOf(context, key)
    if (index !== null) {
      referenceIndices.push(index)
      continue
    }
    const asset = mentioned.find(
      (candidate) =>
        candidate.label?.trim().toLowerCase() === key || candidate.id === image,
    )
    if (!asset) {
      outcomes.push({
        kind: 'result',
        output: `Could not see "${image}": it is not a picture attached to this message or a mounted reference. If it is a result, ask the creator to @ it.`,
        error: true,
        failureKey: 'look:unknown',
      })
      continue
    }
    const plan = await planGuarded(context, TOOL.critiqueResult, () =>
      planCritiqueResult(
        context.prepared.run,
        { goal: question, targetIds: [asset.id] },
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

/** generate：台上现在这一套的确认卡，卡上方先说 `say`。 */
export async function* executeBenchGenerate(
  context: V3Context,
  input: unknown,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const parsed = AssistantV3LoraGenerateInputSchema.parse(input)
  yield* sayAboveCard(context, parsed.say)
  return yield* runOldTool(
    context,
    TOOL.requestGeneration,
    TITLE_TEXT[context.language].generate,
    parsed.label ? { label: parsed.label } : {},
  )
}
