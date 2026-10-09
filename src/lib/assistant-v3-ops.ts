import {
  ASSISTANT_V3_EDIT_OP_IDS,
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_WRITE_FIELD_IDS,
  ASSISTANT_V3_WRITE_MODE_IDS,
} from '@/constants/assistant-v3'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { AssistantOperatorCanvasNode } from '@/types/assistant-operator'
import type {
  AssistantV3EditOpInput,
  AssistantV3ParamsInput,
  AssistantV3WriteEntry,
  AssistantV3WriteInput,
} from '@/types/assistant-v3'
import {
  NodeAssistantOpV4Schema,
  type NodeAssistantOpV4,
} from '@/types/node-assistant-ops'
import { withoutReferenceRoleLegend } from '@/lib/studio-reference-mentions'
import type { AssistantV3Handles } from '@/lib/assistant-v3-board'

/**
 * v3 的 `edit` / `write` → 画布执行器认的 v4 op。纯函数：只查快照、不碰 IO。
 *
 * ⚠ 临时名（`add.ref`）原样写进 v4 op 的 target：前端落这一批时按 ref 换真 id，
 *   同一批里后面的建卡、设参数、写提示词都指得着它（`context.refs`）。
 * ⚠ 连线按「从哪张到哪张、哪个槽」找线，⛔ 不收 edgeId（I56：模型抄错过）。
 */

export type AssistantV3Translation =
  | { ok: true; ops: NodeAssistantOpV4[] }
  | { ok: false; error: string }

export interface AssistantV3TranslateContext {
  readonly nodes: readonly AssistantOperatorCanvasNode[]
  readonly handles: AssistantV3Handles
}

function unknownCard(handle: string, handles: AssistantV3Handles): string {
  const nearest = handles.nearest(handle).map((id) => handles.handleOf(id))
  return `no card "${handle}" on the board${nearest.length ? ` — did you mean ${nearest.join(', ')}?` : ''}`
}

function paramsPatch(
  params: AssistantV3ParamsInput,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== null),
  ) as Record<string, string | number | boolean>
}

export function translateAssistantV3Edit(
  ops: readonly AssistantV3EditOpInput[],
  context: AssistantV3TranslateContext,
): AssistantV3Translation {
  if (ops.length === 0) return { ok: false, error: 'ops is empty' }
  if (ops.length > ASSISTANT_V3_LIMITS.maxEditOps)
    return {
      ok: false,
      error: `at most ${ASSISTANT_V3_LIMITS.maxEditOps} ops per edit — split it`,
    }
  const byId = new Map(context.nodes.map((node) => [node.id, node]))
  const refs = new Map<string, AssistantV3EditOpInput>()
  const out: unknown[] = []
  const fail = (index: number, message: string): AssistantV3Translation => ({
    ok: false,
    error: `ops[${index}] (${ops[index].op}): ${message}. Nothing in this edit landed.`,
  })

  for (const [index, op] of ops.entries()) {
    /** 句柄 / 真 id / 本批前面声明过的临时名 → v4 target。 */
    const resolve = (
      handle: string,
    ): { target: string; node: AssistantOperatorCanvasNode | null } | null => {
      const ref = handle.trim()
      if (refs.has(ref)) return { target: ref, node: null }
      const id = context.handles.idOf(ref)
      if (!id) return null
      return { target: id, node: byId.get(id) ?? null }
    }

    switch (op.op) {
      case ASSISTANT_V3_EDIT_OP_IDS.add: {
        const ref = op.ref.trim()
        if (!ref || ref.length > ASSISTANT_V3_LIMITS.maxRefChars)
          return fail(
            index,
            `ref must be 1–${ASSISTANT_V3_LIMITS.maxRefChars} characters`,
          )
        if (refs.has(ref) || context.handles.idOf(ref))
          return fail(index, `ref "${ref}" is already taken — pick another`)
        refs.set(ref, op)
        out.push({
          op: NODE_ASSISTANT_OP_V4_IDS.addNode,
          kind: op.kind,
          subtype: op.subtype,
          ref,
          name: op.name,
          ...(op.shot === null ? {} : { shotNo: op.shot }),
        })
        if (op.model)
          out.push({
            op: NODE_ASSISTANT_OP_V4_IDS.setModel,
            target: ref,
            modelId: op.model,
          })
        if (op.params) {
          const patch = paramsPatch(op.params)
          if (Object.keys(patch).length > 0)
            out.push({
              op: NODE_ASSISTANT_OP_V4_IDS.setParams,
              target: ref,
              params: patch,
            })
        }
        if (op.text?.trim()) {
          if (op.text.length > ASSISTANT_V3_LIMITS.maxTextChars)
            return fail(
              index,
              `text is longer than ${ASSISTANT_V3_LIMITS.maxTextChars} characters`,
            )
          out.push(
            op.kind === NODE_MEDIA_KIND_IDS.text
              ? {
                  op: NODE_ASSISTANT_OP_V4_IDS.setText,
                  target: ref,
                  body: op.text,
                  mode: 'replace',
                }
              : {
                  op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
                  target: ref,
                  prompt: op.text,
                  mode: 'replace',
                },
          )
        }
        break
      }
      case ASSISTANT_V3_EDIT_OP_IDS.set: {
        const card = resolve(op.card)
        if (!card) return fail(index, unknownCard(op.card, context.handles))
        if (op.name === null && op.model === null && op.params === null)
          return fail(index, 'set needs at least one of name, model, params')
        if (op.name !== null) {
          const isShot =
            card.node?.kind === NODE_MEDIA_KIND_IDS.video &&
            card.node.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
          out.push({
            op: NODE_ASSISTANT_OP_V4_IDS.setField,
            target: card.target,
            field: isShot ? 'label' : 'name',
            value: op.name,
          })
        }
        if (op.model !== null)
          out.push({
            op: NODE_ASSISTANT_OP_V4_IDS.setModel,
            target: card.target,
            modelId: op.model,
          })
        if (op.params !== null) {
          const patch = paramsPatch(op.params)
          if (Object.keys(patch).length === 0)
            return fail(
              index,
              'params has no value set — leave params null instead',
            )
          out.push({
            op: NODE_ASSISTANT_OP_V4_IDS.setParams,
            target: card.target,
            params: patch,
          })
        }
        break
      }
      case ASSISTANT_V3_EDIT_OP_IDS.connect: {
        const from = resolve(op.from)
        if (!from) return fail(index, unknownCard(op.from, context.handles))
        const to = resolve(op.to)
        if (!to) return fail(index, unknownCard(op.to, context.handles))
        out.push({
          op: NODE_ASSISTANT_OP_V4_IDS.connect,
          source: from.target,
          target: to.target,
          slot: op.slot,
          ...(op.role === null ? {} : { role: op.role }),
        })
        break
      }
      case ASSISTANT_V3_EDIT_OP_IDS.disconnect: {
        const from = resolve(op.from)
        if (!from) return fail(index, unknownCard(op.from, context.handles))
        const to = resolve(op.to)
        if (!to) return fail(index, unknownCard(op.to, context.handles))
        if (!to.node || !from.node)
          return fail(index, 'a card created in this edit has no lines yet')
        const lines = (to.node.inputs ?? []).filter(
          (input) =>
            input.from === from.target &&
            (op.slot === null || input.slot === op.slot),
        )
        if (lines.length === 0) {
          const into = (to.node.inputs ?? [])
            .map(
              (input) =>
                `${input.slot} ← ${context.handles.handleOf(input.from)}`,
            )
            .join(', ')
          return fail(
            index,
            `no line from ${op.from} into ${op.to}${op.slot ? ` on ${op.slot}` : ''} — lines into ${op.to}: ${into || 'none'}`,
          )
        }
        for (const line of lines)
          out.push({
            op: NODE_ASSISTANT_OP_V4_IDS.disconnect,
            edgeId: line.edgeId,
          })
        break
      }
      case ASSISTANT_V3_EDIT_OP_IDS.delete: {
        const card = resolve(op.card)
        if (!card || !card.node)
          return fail(index, unknownCard(op.card, context.handles))
        out.push({ op: NODE_ASSISTANT_OP_V4_IDS.delete, target: card.target })
        break
      }
      case ASSISTANT_V3_EDIT_OP_IDS.moveToShot: {
        const card = resolve(op.card)
        if (!card) return fail(index, unknownCard(op.card, context.handles))
        out.push({
          op: NODE_ASSISTANT_OP_V4_IDS.moveToShot,
          target: card.target,
          shotNo: op.shot,
        })
        break
      }
      case ASSISTANT_V3_EDIT_OP_IDS.reorderShot: {
        out.push({
          op: NODE_ASSISTANT_OP_V4_IDS.reorderShot,
          from: op.from,
          to: op.to,
        })
        break
      }
      case ASSISTANT_V3_EDIT_OP_IDS.projectScript: {
        const script = resolve(op.script)
        if (!script || !script.node)
          return fail(index, unknownCard(op.script, context.handles))
        out.push({
          op: NODE_ASSISTANT_OP_V4_IDS.projectScript,
          scriptNodeId: script.target,
          mode: op.mode,
        })
        break
      }
    }
  }

  const parsed: NodeAssistantOpV4[] = []
  for (const raw of out) {
    const result = NodeAssistantOpV4Schema.safeParse(raw)
    if (!result.success) {
      const issue = result.error.issues[0]
      return {
        ok: false,
        error: `${(raw as { op: string }).op}: ${issue?.path.join('.') || 'value'} ${issue?.message ?? 'is invalid'}. Nothing in this edit landed.`,
      }
    }
    parsed.push(result.data)
  }
  return { ok: true, ops: parsed }
}

/**
 * `write` → 一条 `set_prompt` / `set_text`。
 *
 * ⭐ `edit` 写法：拿卡上全文（去掉 app 维护的参考图例）逐条找句换句，再整段落下。
 *   每条 `find` 必须恰好出现一次 —— 出现多次时换错地方比不换更糟。
 */
export function translateAssistantV3Write(
  input: AssistantV3WriteInput,
  context: AssistantV3TranslateContext,
): AssistantV3Translation {
  if (input.writes.length === 0) return { ok: false, error: 'writes is empty' }
  if (input.writes.length > ASSISTANT_V3_LIMITS.maxWrites)
    return {
      ok: false,
      error: `at most ${ASSISTANT_V3_LIMITS.maxWrites} cards per write — split it`,
    }
  const ops: NodeAssistantOpV4[] = []
  for (const [index, entry] of input.writes.entries()) {
    const one = translateWriteEntry(entry, context)
    if (!one.ok)
      return {
        ok: false,
        error: `writes[${index}] (${entry.card}): ${one.error} Nothing in this write landed.`,
      }
    ops.push(...one.ops)
  }
  return { ok: true, ops }
}

function translateWriteEntry(
  input: AssistantV3WriteEntry,
  context: AssistantV3TranslateContext,
): AssistantV3Translation {
  const id = context.handles.idOf(input.card)
  const node = id
    ? (context.nodes.find((candidate) => candidate.id === id) ?? null)
    : null
  if (!id || !node)
    return { ok: false, error: unknownCard(input.card, context.handles) }
  const isText = node.kind === NODE_MEDIA_KIND_IDS.text
  if (input.field === ASSISTANT_V3_WRITE_FIELD_IDS.text && !isText)
    return {
      ok: false,
      error: `${input.card} is a ${node.kind} card — write its prompt (field "prompt"), not "text"`,
    }
  if (input.field === ASSISTANT_V3_WRITE_FIELD_IDS.prompt && isText)
    return {
      ok: false,
      error: `${input.card} is a text card — write its body with field "text"`,
    }

  let text: string
  let mode: 'replace' | 'append'
  if (input.mode === ASSISTANT_V3_WRITE_MODE_IDS.edit) {
    if (!input.edits?.length)
      return { ok: false, error: 'mode "edit" needs edits: [{find, replace}]' }
    if (input.edits.length > ASSISTANT_V3_LIMITS.maxWriteEdits)
      return {
        ok: false,
        error: `at most ${ASSISTANT_V3_LIMITS.maxWriteEdits} edits per write`,
      }
    if (node.textTruncated)
      return {
        ok: false,
        error: `${input.card} is longer than the board can carry — edit it by hand or append`,
      }
    let current = withoutReferenceRoleLegend(node.text ?? '')
    for (const [index, edit] of input.edits.entries()) {
      if (!edit.find)
        return { ok: false, error: `edits[${index}].find is empty` }
      const count = current.split(edit.find).length - 1
      if (count !== 1)
        return {
          ok: false,
          error: `edits[${index}].find occurs ${count} times in ${input.card} — ${
            count === 0
              ? 'copy it exactly from the card (read it first if it was clipped)'
              : 'make it longer so it matches exactly one place'
          }.`,
        }
      current = current.replace(edit.find, () => edit.replace)
    }
    text = current
    mode = 'replace'
  } else {
    if (!input.text?.trim())
      return { ok: false, error: `mode "${input.mode}" needs text` }
    text = input.text
    mode = input.mode
  }
  if (text.length > ASSISTANT_V3_LIMITS.maxTextChars)
    return {
      ok: false,
      error: `text is ${text.length} characters; at most ${ASSISTANT_V3_LIMITS.maxTextChars}`,
    }
  const raw = isText
    ? { op: NODE_ASSISTANT_OP_V4_IDS.setText, target: id, body: text, mode }
    : { op: NODE_ASSISTANT_OP_V4_IDS.setPrompt, target: id, prompt: text, mode }
  const parsed = NodeAssistantOpV4Schema.safeParse(raw)
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'the text cannot be written',
    }
  return { ok: true, ops: [parsed.data] }
}
