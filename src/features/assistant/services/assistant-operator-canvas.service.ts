import 'server-only'

import { createHash } from 'node:crypto'
import { editDistance } from '@/lib/edit-distance'
import type {
  AssistantOperatorCanvasSnapshot,
  AssistantOperatorCanvasNode,
} from '@/types/assistant-operator'
import {
  hasCompleteReferenceVisualEvidence,
  analyzeOperatorReferences,
  ReferenceAnalysisValidationError,
  buildOperatorReferenceBrief,
} from '@/features/assistant/services/assistant-reference-analysis.service'
import { referenceProfileStore } from '@/features/assistant/services/assistant-reference-profile-cache.service'
import type { ReferenceAnalysis } from '@/types/assistant-reference-analysis'
import {
  withReferenceRoleLegend,
  referenceRoleLegendCount,
} from '@/lib/studio-reference-mentions'
import {
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
  ASSISTANT_PLAN_CARD_LIMITS as PLAN_LIMITS,
} from '@/constants/assistant-operator'
import {
  NODE_ASSISTANT_OP_V4_IDS,
  NODE_ASSISTANT_OP_V4_SPECS,
  NODE_ASSISTANT_OP_V4_TIER_IDS,
} from '@/constants/node-assistant-ops'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import { NODE_SCRIPT_PROJECTION_MODE_IDS } from '@/constants/node-script'
import { resolveAdapterType } from '@/constants/models'
import { ApiRequestError } from '@/lib/errors'
import { buildCanvasGenerationRequest } from '@/lib/studio-operator-canvas-snapshot'
import { getPromptDialect } from '@/constants/prompt-dialects'
import { logger } from '@/lib/logger'
import type { PromptAssistantResponseLanguage } from '@/types'
import {
  type OperatorRun,
  type ToolPlan,
  reject,
  clamp,
  operatorStepKey,
  canvasNodeIds,
} from '@/features/assistant/services/assistant-operator-run.service'
import {
  RESPONSE_LANGUAGE_LABELS,
  resolveResponseLanguage,
  planReferenceEvidenceGap,
  creatorChoseFollowRequest,
  buildPromptConflictQuestion,
  collectSettledAnswers,
  latestUserMessage,
} from '@/features/assistant/services/assistant-operator-prompt.service'
import {
  referenceCreatorContext,
  runSeesImages,
  cannotSeeRejection,
  REFERENCE_CREATOR_NOTE_CHARS,
  completeReferenceAnalysisText,
} from '@/features/assistant/services/assistant-operator-planning.service'

/**
 * 助手执行器里的 **画布三条**：改画布（含剪辑台）、批量、生成镜头，以及动大的之前那张确认卡。
 * 11-10 从 `assistant-operator.service.ts` 原样搬出（M4），行为不变。
 * ⚠ 执行器的文件都叫 `assistant-operator-*.service.ts`：钱闸测试按这个前缀收源码。
 */

// ─── 画布三条（进度表 22「一张脸」）──────────────────────────────
//
// ── 为什么服务端这一层只校验 id，不校验「这条线连不连得上」 ──────────
// 连不连得上要算槽的容量与类型，而那份判据已经存在且只在客户端算得准
// （`features/canvas/lib/node-assistant-op-plan.ts` 的 `planNodeAssistantOpsV4`，它在一份模拟图
// 上逐条推进）。服务端手上只有一份**分层过的**快照 —— 折叠的镜里连节点都没有，
// 用它去判容量只会得出一个比客户端宽的答案，而两个答案不一致的表现是「助手说
// 连好了，画布上那条线没出现」。
// ⚠ 所以两道闸各守各的：这里守「这个 id 在你看得见的画布上存在吗」（与
//   `mount_reference` 只认 `searchIndex` 逐字同源），客户端守「这条 op 做得成吗」
//   并把拒绝理由渲染出来。⛔ 别在这里抄第二份连线规则。

/**
 * 剪辑类 op 的准入（v2 第 2 片）：时间线还没有就只能先建；加段只认快照里列出的卡；
 * 改 / 挪 / 删只认时间线上真有的段与字幕。⚠ 错了退回一句**能照着改**的话，
 * ⛔ 不在客户端执行器那一侧才发现（那时这一轮已经算「做了」）。
 */
function checkEditDeskOp(
  canvas: AssistantOperatorCanvasSnapshot,
  op: NodeAssistantOpV4,
): string | null {
  const ids = NODE_ASSISTANT_OP_V4_IDS
  if (op.op === ids.editSetTimeline) return null
  const isEditOp =
    op.op === ids.editAddClip ||
    op.op === ids.editUpdateClip ||
    op.op === ids.editMoveClip ||
    op.op === ids.editRemoveClip ||
    op.op === ids.editAddText ||
    op.op === ids.editUpdateText ||
    op.op === ids.editRemoveText
  if (!isEditOp) return null
  const timeline = canvas.editDesk?.timeline
  if (!timeline) {
    return 'This project has no timeline yet. Start one with edit_set_timeline (empty tracks), then add clips.'
  }
  if (op.op === ids.editAddClip) {
    const assets = canvas.editDesk?.assets ?? []
    if (!assets.some((asset) => asset.nodeId === op.clip.sourceNodeId)) {
      return `${op.clip.sourceNodeId} is not a card that can go on the timeline. Pick a nodeId from editDesk.assets.`
    }
    return null
  }
  if (
    op.op === ids.editUpdateClip ||
    op.op === ids.editMoveClip ||
    op.op === ids.editRemoveClip
  ) {
    const found = timeline.clips.some(
      (clip) => clip.clipId === op.clipId && clip.track === op.track,
    )
    return found
      ? null
      : `No clip ${op.clipId} on the ${op.track} track. Use a clipId and track from editDesk.timeline.clips.`
  }
  if (op.op === ids.editUpdateText || op.op === ids.editRemoveText) {
    return timeline.texts.some((text) => text.textId === op.clipId)
      ? null
      : `No caption ${op.clipId} on the timeline. Use a textId from editDesk.timeline.texts.`
  }
  return null
}

function canvasOpTargets(op: NodeAssistantOpV4): readonly string[] {
  switch (op.op) {
    case NODE_ASSISTANT_OP_V4_IDS.connect:
      return [op.source, op.target]
    case NODE_ASSISTANT_OP_V4_IDS.attachAsset:
      return [op.target, op.sourceNodeId]
    // 投影指的是剧本卡本身；它拆出来的那几面镜还没有 id。
    case NODE_ASSISTANT_OP_V4_IDS.projectScript:
      return [op.scriptNodeId]
    case NODE_ASSISTANT_OP_V4_IDS.addNode:
    case NODE_ASSISTANT_OP_V4_IDS.reorderShot:
      // 新建的那个还没有 id；换序动的是镜号不是节点。
      return []
    default:
      return 'target' in op && typeof op.target === 'string' ? [op.target] : []
  }
}

async function checkCanvasReferencePrompt(
  run: OperatorRun,
  node: AssistantOperatorCanvasNode,
): Promise<ToolPlan | null> {
  // v3：⛔ 写词 / 出图前不另看参考图，模型自己 look（见 `skipReferenceReview`）。
  if (run.skipReferenceReview) return null
  if (node.kind !== 'image' || node.referenceUrls?.length === 0) return null
  if (
    node.reviewContextComplete !== true ||
    !node.referenceUrls ||
    node.referencePromptContext === undefined
  ) {
    return reject(
      REJECT.noSuchControl,
      'The target generation-input snapshot is incomplete or exceeds the review limit. Keep its prompt unchanged and report that the reference check cannot complete. Do not infer inputs from other nodes or a truncated preview; refreshing alone cannot fix an oversized snapshot.',
    )
  }
  const urls = node.referenceUrls
  const context = `${referenceCreatorContext(run, node.text ?? '')}\nTARGET NODE: ${node.name} (${node.id})\nACTUAL TARGET REFERENCE URL ORDER: ${JSON.stringify(urls)}\nCONNECTED INPUT CONTEXT (image-name mapping and text-slot constraints, also part of the generated prompt):\n${node.referencePromptContext}\nOnly these target inputs are evidence for this write. Other attachments and nodes are not implicit references. Distinguish accepted face details from rejected body details for the exact image versions in prior rounds.`
  const cache = new Map(
    [
      ...(run.request.referenceProfiles ?? []),
      ...(run.referenceAnalysis?.profiles ?? []),
    ].map((profile) => [profile.url, profile]),
  )
  const needsVision = urls.some(
    (url) => !hasCompleteReferenceVisualEvidence(cache.get(url)),
  )
  if (needsVision && !runSeesImages(run))
    return cannotSeeRejection("the target node's references")
  let analysis: ReferenceAnalysis
  try {
    analysis = await analyzeOperatorReferences({
      urls,
      cached: [...cache.values()],
      creatorNote: run.request.messages
        .filter((message) => message.role === 'user')
        .map((message) => message.content)
        .join('\n')
        .slice(-REFERENCE_CREATOR_NOTE_CHARS),
      language:
        RESPONSE_LANGUAGE_LABELS[
          resolveResponseLanguage(run.request, run.persona)
        ],
      store: referenceProfileStore(
        run.userId,
        RESPONSE_LANGUAGE_LABELS[
          resolveResponseLanguage(run.request, run.persona)
        ],
      ),
      complete: (system, input, images, jsonSchema) =>
        completeReferenceAnalysisText(
          run,
          'referenceAnalysis',
          system,
          input,
          images,
          run.route,
          run.modelId,
          jsonSchema,
        ),
    })
  } catch (error) {
    logger.warn('assistant target reference inspection failed', {
      stage:
        error instanceof ReferenceAnalysisValidationError
          ? 'vision_validation'
          : 'vision_request',
      nodeId: node.id,
      adapter: run.route.adapterType,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    if (!(error instanceof ReferenceAnalysisValidationError)) throw error
    return reject(
      REJECT.referenceAnalysisFailed,
      `Target reference analysis failed (${error.reason}). Preserve the existing prompt; this is a technical failure, not a request to change the creator's intent.`,
    )
  }
  if (needsVision)
    run.inspectedCanvasReferences = { profiles: analysis.profiles, brief: null }
  for (const profile of analysis.profiles) cache.set(profile.url, profile)
  run.referenceAnalysis = { profiles: [...cache.values()], brief: null }
  try {
    analysis.brief = await buildOperatorReferenceBrief({
      profiles: analysis.profiles,
      context,
      language:
        RESPONSE_LANGUAGE_LABELS[
          resolveResponseLanguage(run.request, run.persona)
        ],
      complete: (system, input, images, jsonSchema) =>
        completeReferenceAnalysisText(
          run,
          'referenceBrief',
          system,
          input,
          images,
          run.route,
          run.modelId,
          jsonSchema,
        ),
    })
  } catch (error) {
    logger.warn('assistant target reference brief failed', {
      stage:
        error instanceof ReferenceAnalysisValidationError
          ? 'brief_validation'
          : 'brief_request',
      nodeId: node.id,
      adapter: run.route.adapterType,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    if (
      !(error instanceof ReferenceAnalysisValidationError) &&
      !(error instanceof ApiRequestError)
    )
      throw error
    return reject(
      REJECT.referenceBriefFailed,
      'The target reference evidence check did not complete. Preserve its prompt and connections; do not treat a missing check as permission to invent unsupported features.',
    )
  }
  run.canvasBrief = { target: node.id, brief: analysis.brief }
  const scope = { target: node.id, references: urls }
  const gap = planReferenceEvidenceGap(run, analysis.brief.evidenceGaps, scope)
  if (gap) return gap
  const uncertainty = analysis.brief.uncertainties.find(
    (issue) => !creatorChoseFollowRequest(run, issue, scope),
  )
  if (uncertainty) {
    return {
      kind: 'ask',
      question: buildPromptConflictQuestion(
        run,
        resolveResponseLanguage(run.request, run.persona),
        uncertainty,
        scope,
      ),
      todo: uncertainty,
    }
  }
  return null
}

const NO_BATCH_REFS: ReadonlySet<string> = new Set()

/**
 * 这条改动画布上**已经是这样了** —— 返回一句说明，否则 `null`。
 *
 * 2026-10-08 真机：画布到了 34 张卡、四五万 token 时，模型在长长的状态里读漏了卡上的
 * `model`，把「给四张卡设模型」整批成功落了四次（每次落地都换一个请求，同类失败闸
 * 只数失败、不数这种成功的空转）。⭐ 判据只看快照里的事实，⛔ 不猜意图。
 */
export function canvasNoOpReason(
  canvas: AssistantOperatorCanvasSnapshot,
  op: NodeAssistantOpV4,
): string | null {
  const nodeOf = (id: string) =>
    canvas.shots
      .flatMap((shot) => (shot.expanded ? shot.nodes : []))
      .find((node) => node.id === id)
  if (op.op === NODE_ASSISTANT_OP_V4_IDS.setModel) {
    const node = nodeOf(op.target)
    return node?.model === op.modelId
      ? `${node.name} already uses ${op.modelId}`
      : null
  }
  if (op.op === NODE_ASSISTANT_OP_V4_IDS.connect) {
    const node = nodeOf(op.target)
    return node?.inputs?.some(
      (input) => input.from === op.source && input.slot === op.slot,
    )
      ? `${node.name} already has ${op.source} in its ${op.slot} slot`
      : null
  }
  if (op.op === NODE_ASSISTANT_OP_V4_IDS.setParams) {
    const node = nodeOf(op.target)
    const values = node?.parameters?.values as
      | Record<string, unknown>
      | undefined
    if (!node || !values) return null
    return Object.entries(op.params).every(
      ([key, value]) => value === undefined || values[key] === value,
    )
      ? `${node.name} already has those settings`
      : null
  }
  return null
}

export const CANVAS_NO_OP_DETAIL =
  'Already on the board, nothing changed: {list}. Do not send these again — read the board once more if unsure, then continue with what is still missing or finish.'

/**
 * **一批 op 一次落图**（owner 2026-10-08：每条 `canvas_apply` 一个来回，建一张卡要五趟）。
 *
 * 逐条过 `planCanvasApply` 的全部检查（确认档的问句、参数值域、写词前的参考要点与图例），
 * ⛔ 不另写一套；一条被拒整批不落，模型改那一条再发。批里新建的卡只有别名没有 id，
 * 写词和设参数要等这批落地、下一步从新画布上拿到真 id —— 服务端这一刻看不见它的参考图。
 */
export async function planCanvasBatch(
  run: OperatorRun,
  ops: readonly NodeAssistantOpV4[],
  userId: string,
): Promise<ToolPlan> {
  const refs = new Set(
    ops.flatMap((op) =>
      op.op === NODE_ASSISTANT_OP_V4_IDS.addNode && op.ref ? [op.ref] : [],
    ),
  )
  const payload: NodeAssistantOpV4[] = []
  const alreadyThere: string[] = []
  const canvas = run.state.canvas
  for (const [index, op] of ops.entries()) {
    const noOp = canvas ? canvasNoOpReason(canvas, op) : null
    if (noOp) {
      alreadyThere.push(noOp)
      continue
    }
    /**
     * 同批新建的卡（`ref`）还不在工作副本上，规划器校验不了它的提示词与参数档位：
     * 原样交给前端 —— 前端落这一批时按 ref 换真 id（`context.refs`），参数照合并。
     * ⚠ 从前这里整批拒，建一张卡要三次往返（2026-10-09 回放 T03 / T18）。
     */
    if (
      (op.op === NODE_ASSISTANT_OP_V4_IDS.setPrompt ||
        op.op === NODE_ASSISTANT_OP_V4_IDS.setParams) &&
      refs.has(op.target)
    ) {
      payload.push(op)
      continue
    }
    const plan = await planCanvasApply(run, op, userId, refs)
    if (plan.kind === 'mutate') {
      payload.push(plan.payload as NodeAssistantOpV4)
      continue
    }
    if (plan.kind === 'rejected') {
      return {
        ...plan,
        detail: clamp(
          `ops[${index}] (${op.op}): ${plan.detail ?? plan.reason}. Nothing in this batch landed.`,
          LIMITS.maxReasonChars,
        ),
      }
    }
    return plan
  }
  if (payload.length === 0) {
    return {
      kind: 'rejected',
      reason: REJECT.repeatedStep,
      detail: clamp(
        CANVAS_NO_OP_DETAIL.replace('{list}', alreadyThere.join('; ')),
        LIMITS.maxReasonChars,
      ),
      quiet: true,
    }
  }
  const first = payload.flatMap((op) => canvasOpTargets(op))[0]
  return {
    kind: 'mutate',
    payload: { ops: payload },
    inverse: { op: 'batch', nodeRef: first ?? 'batch' },
    observation: `Queued ${payload.length} operations on the board as one batch (${payload.map((op) => op.op).join(', ')}). They land on the creator's canvas now; the fresh board arrives with the next step — cards created here get their real ids there.${alreadyThere.length ? ` Skipped ${alreadyThere.length} already on the board: ${alreadyThere.join('; ')}.` : ''}`,
    apply: () => {},
  }
}

/**
 * **`confirm` 档的画布 op 先问一句**（node-canvas-v2 §13.2：`delete` / `project_script`，
 * 一句话能删掉或长出一整排卡）。
 *
 * ⭐ 走问题块（`ask`，规划期反问那一条）：吐一帧、停流，答完带 `planAnswers` 重发，
 *   模型再发一次同一条 op 才落。⛔ 不新增卡类型。
 * ⚠ 题 id 按**这一条 op** 算（同参才同题）：点头删 A 不等于点头删 B。
 * ⚠ 哪几条要问只读 spec 表的 `tier`；下面那张文案表按它派生键，档位表加一条而
 *   文案漏写时编译期就红。
 */
type CanvasConfirmTierOpId = {
  [K in keyof typeof NODE_ASSISTANT_OP_V4_SPECS]: (typeof NODE_ASSISTANT_OP_V4_SPECS)[K]['tier'] extends typeof NODE_ASSISTANT_OP_V4_TIER_IDS.confirm
    ? K
    : never
}[keyof typeof NODE_ASSISTANT_OP_V4_SPECS]

type CanvasConfirmTierOp = Extract<
  NodeAssistantOpV4,
  { op: CanvasConfirmTierOpId }
>

const CANVAS_CONFIRM_QUESTION_ID = 'canvas-confirm'

const CANVAS_CONFIRM_APPLY_ID = 'apply'

const CANVAS_CONFIRM_KEEP_ID = 'keep'

type CanvasConfirmOption = { label: string; description: string }

const CANVAS_CONFIRM_ASK_TEXTS: Record<
  PromptAssistantResponseLanguage,
  Record<
    CanvasConfirmTierOpId,
    {
      header: string
      /** `reproject`：剧本投过了，这一下是按改过的剧本更新已有的镜头卡。 */
      question: (name: string, reproject: boolean) => string
      apply: CanvasConfirmOption
      keep: CanvasConfirmOption
    }
  >
> = {
  english: {
    delete: {
      header: 'Delete card',
      question: (name) => `Delete “${name}”? Its wires go with it.`,
      apply: {
        label: 'Delete it',
        description: 'Removes the card and its wires; you can still undo it.',
      },
      keep: {
        label: 'Keep it',
        description: 'The card stays; nothing on the board changes.',
      },
    },
    remove_output_version: {
      header: 'Remove version',
      question: (name) =>
        `Remove this version from “${name}”? Its other versions stay.`,
      apply: {
        label: 'Remove it',
        description: 'Only this version goes; you can still undo it.',
      },
      keep: {
        label: 'Keep it',
        description: 'Every version stays; nothing on the board changes.',
      },
    },
    project_script: {
      header: 'Project script',
      question: (name, reproject) =>
        reproject
          ? `Update the shot cards from the revised script “${name}”? Changed shots are marked and new shots get new cards.`
          : `Turn the script “${name}” into shots? A row of shot cards appears on the board.`,
      apply: {
        label: 'Project it',
        description: 'Adds or updates the shot cards; you can still undo it.',
      },
      keep: {
        label: 'Not now',
        description: 'Nothing changes on the board.',
      },
    },
  },
  japanese: {
    delete: {
      header: 'カードを削除',
      question: (name) =>
        `「${name}」を削除しますか？つながっている線も一緒に外れます。`,
      apply: {
        label: '削除する',
        description: 'カードと線を消します。あとで元に戻せます。',
      },
      keep: {
        label: '残す',
        description: 'カードはそのまま。ボードは何も変わりません。',
      },
    },
    remove_output_version: {
      header: 'この版を外す',
      question: (name) =>
        `「${name}」からこの版を外しますか？ほかの版はそのまま残ります。`,
      apply: {
        label: '外す',
        description: 'この版だけを外します。あとで元に戻せます。',
      },
      keep: {
        label: '残す',
        description: 'すべての版がそのまま。ボードは何も変わりません。',
      },
    },
    project_script: {
      header: '台本を展開',
      question: (name, reproject) =>
        reproject
          ? `改訂した台本「${name}」でショットカードを更新しますか？変わったショットに印が付き、新しいショットはカードが追加されます。`
          : `台本「${name}」をショットに展開しますか？ボードにショットカードが一列並びます。`,
      apply: {
        label: '展開する',
        description: 'ショットカードを追加・更新します。あとで元に戻せます。',
      },
      keep: {
        label: '今はしない',
        description: 'ボードは何も変わりません。',
      },
    },
  },
  chinese: {
    delete: {
      header: '删除卡片',
      question: (name) => `删掉「${name}」？连到它的线会一起断开。`,
      apply: {
        label: '删掉',
        description: '删掉这张卡和它的连线，之后还能撤销。',
      },
      keep: {
        label: '先留着',
        description: '这张卡不动，画布上什么都不变。',
      },
    },
    remove_output_version: {
      header: '去掉这一版',
      question: (name) => `把这一版从「${name}」里去掉？别的版本都留着。`,
      apply: {
        label: '去掉',
        description: '只拿掉这一版，之后还能撤销。',
      },
      keep: {
        label: '留着',
        description: '每一版都在，画布上什么都不变。',
      },
    },
    project_script: {
      header: '投影剧本',
      question: (name, reproject) =>
        reproject
          ? `按改过的剧本「${name}」更新镜头卡？变了的镜头会标出来，新增的镜头补成新卡。`
          : `把剧本「${name}」投成镜头？画布上会新建一排镜头卡。`,
      apply: {
        label: '投影',
        description: '按剧本新建或更新镜头卡，之后还能撤销。',
      },
      keep: {
        label: '先不投',
        description: '镜头卡保持原样，画布上什么都不变。',
      },
    },
  },
}

/**
 * 确认卡开着时创作者**打字**作答（面板把那句话当 `otherText` 送来，`optionIds` 为空）。
 *
 * 🔬 从前只认点按钮：打「删吧」= 没答，同一张卡再弹一次，删卡死循环。现在先认
 * 否定（「不要删」里也有「删」），再认肯定；两头都不像就按「没同意」处理并把原话
 * 交给模型 —— ⛔ 不再问第三遍。
 */
const CANVAS_CONFIRM_TYPED_DECLINE =
  /不要|不用|不对|不行|不好|不是|不可以|别|先不|算了|取消|保留|留着|不删|不投|\bno\b|\bnope\b|don'?t|do not|keep|cancel|stop|やめ|いいえ|残して|キャンセル/i

const CANVAS_CONFIRM_TYPED_APPLY =
  /删|刪|投|好|行|可以|确认|確認|是的|对|嗯|没问题|\byes\b|\byep\b|\bok(?:ay)?\b|\bsure\b|go ahead|do it|delete|remove|project|はい|お願い|削除|消して|どうぞ|いいよ/i

type CanvasConfirmTypedAnswer = 'apply' | 'keep' | 'other'

function readCanvasConfirmTypedAnswer(text: string): CanvasConfirmTypedAnswer {
  if (CANVAS_CONFIRM_TYPED_DECLINE.test(text)) return 'keep'
  if (CANVAS_CONFIRM_TYPED_APPLY.test(text)) return 'apply'
  return 'other'
}

/** 创作者自己说了要投影剧本（中 / 英 / 日）。 */
const CREATOR_ASKED_TO_PROJECT =
  /投影|投成镜头|拆成镜头|拆镜头|reproject|project (?:the |this )?script|into shots|ショットに展開|展開して/i

function isCanvasConfirmTierOp(
  op: NodeAssistantOpV4,
): op is CanvasConfirmTierOp {
  return (
    NODE_ASSISTANT_OP_V4_SPECS[op.op].tier ===
    NODE_ASSISTANT_OP_V4_TIER_IDS.confirm
  )
}

function planCanvasConfirm(
  run: OperatorRun,
  canvas: AssistantOperatorCanvasSnapshot,
  op: CanvasConfirmTierOp,
): ToolPlan | null {
  const id = `${CANVAS_CONFIRM_QUESTION_ID}-${createHash('sha256')
    .update(operatorStepKey(TOOL.canvasApply, op))
    .digest('hex')
    .slice(0, 24)}`
  const decision = collectSettledAnswers(run.request).findLast(
    (entry) => entry.questionId === id,
  )
  if (decision?.optionIds.includes(CANVAS_CONFIRM_APPLY_ID)) return null
  const typed =
    decision && decision.optionIds.length === 0 && decision.otherText
      ? readCanvasConfirmTypedAnswer(decision.otherText)
      : null
  if (typed === 'apply') return null
  /**
   * ⭐ 创作者这句话自己点了投影就不再问一遍（2026-10-08 马尔福画布：说了「重新投影」
   * 还弹卡，两轮都要多点一次；投错了照样能撤）。⚠ 只放投影：一句话里出现「删」
   * 不等于点名删这一张，删卡照旧问。
   */
  if (
    op.op === NODE_ASSISTANT_OP_V4_IDS.projectScript &&
    CREATOR_ASKED_TO_PROJECT.test(latestUserMessage(run.request))
  )
    return null
  const target = canvasOpTargets(op)[0] ?? op.op
  const name =
    canvas.shots
      .flatMap((shot) => (shot.expanded ? shot.nodes : []))
      .find((node) => node.id === target)?.name ?? target
  if (
    decision?.optionIds.includes(CANVAS_CONFIRM_KEEP_ID) ||
    typed === 'keep'
  ) {
    return reject(
      REJECT.userDeclined,
      `The creator chose to leave ${name} as it is. Do not run ${op.op} on it and do not ask again; carry on with the rest of the request.`,
    )
  }
  if (typed === 'other') {
    return reject(
      REJECT.userDeclined,
      `The creator answered the confirmation for ${op.op} on ${name} in their own words: "${clamp(decision?.otherText ?? '', PLAN_LIMITS.maxOtherTextChars)}". That is not a yes, so ${op.op} did not run. Do not ask the same confirmation again; follow what they said.`,
    )
  }
  const texts =
    CANVAS_CONFIRM_ASK_TEXTS[resolveResponseLanguage(run.request, run.persona)][
      op.op
    ]
  const question = clamp(
    texts.question(
      name,
      op.op === NODE_ASSISTANT_OP_V4_IDS.projectScript &&
        op.mode === NODE_SCRIPT_PROJECTION_MODE_IDS.reproject,
    ),
    PLAN_LIMITS.maxQuestionChars,
  )
  const option = (optionId: string, text: CanvasConfirmOption) => ({
    id: optionId,
    label: clamp(text.label, PLAN_LIMITS.maxOptionLabelChars),
    description: clamp(text.description, PLAN_LIMITS.maxOptionDescriptionChars),
  })
  return {
    kind: 'ask',
    question: {
      id,
      header: clamp(texts.header, PLAN_LIMITS.maxHeaderChars),
      question,
      multiSelect: false,
      allowOther: true,
      options: [
        option(CANVAS_CONFIRM_APPLY_ID, texts.apply),
        option(CANVAS_CONFIRM_KEEP_ID, texts.keep),
      ],
    },
    todo: question,
  }
}

/**
 * 抄错的 id 指回最近的那张卡（2026-10-08 马尔福画布：`video f00f…` 多了个空格、
 * `…9c6e…` 抄成 `…9c4c…`，各白跑一轮接力）。⚠ 只在差得很少（去掉空白后编辑距离
 * ≤ 2）时给，⛔ 不猜远的 —— 猜错一张卡比报不认识更糟。
 */
function nearestIdHint(
  candidates: readonly { id: string; label: string }[],
  wrong: string,
): string {
  const cleaned = wrong.replace(/\s+/g, '')
  let best: { id: string; label: string; distance: number } | null = null
  for (const candidate of candidates) {
    const distance = editDistance(cleaned, candidate.id)
    if (distance <= 2 && (!best || distance < best.distance))
      best = { ...candidate, distance }
  }
  return best ? ` Did you mean ${best.id} (${best.label})?` : ''
}

function nearestCardHint(
  canvas: AssistantOperatorCanvasSnapshot,
  wrong: string,
): string {
  return nearestIdHint(
    canvas.shots.flatMap((shot) =>
      shot.expanded
        ? shot.nodes.map((node) => ({ id: node.id, label: node.name }))
        : [],
    ),
    wrong,
  )
}

/**
 * 断线认的线 id 也会抄错（2026-10-09 马尔福画布：`e54636a84-…` 抄成 `e54636a4-…`，
 * 批里那条到客户端才失败，模型把落了的 23 条整批重写，再断一次又失败，整轮以
 * 「没有这个控件」收场）。线 id 就在快照每张卡的 `inputs` 里，规划时就能核对。
 */
function unknownLineDetail(
  canvas: AssistantOperatorCanvasSnapshot,
  edgeId: string,
): string | null {
  const nodes = canvas.shots.flatMap((shot) =>
    shot.expanded ? shot.nodes : [],
  )
  const nameOf = (id: string) =>
    nodes.find((node) => node.id === id)?.name ?? id
  const lines = nodes.flatMap((node) =>
    (node.inputs ?? []).map((input) => ({
      id: input.edgeId,
      label: `${nameOf(input.from)} → ${node.name} ${input.slot}`,
    })),
  )
  if (lines.some((line) => line.id === edgeId)) return null
  return `No line on the board has the id ${edgeId}.${nearestIdHint(lines, edgeId)} Use an edgeId from a card's inputs on the board you just read.`
}

export async function planCanvasApply(
  run: OperatorRun,
  op: NodeAssistantOpV4,
  userId: string,
  /** 同一批 `add_node.ref` 声明的别名 —— 批里后面的 op 可以指着它们。 */
  batchRefs: ReadonlySet<string> = NO_BATCH_REFS,
): Promise<ToolPlan> {
  const canvas = run.state.canvas
  if (!canvas) {
    return reject(
      REJECT.noSuchControl,
      'There is no board here. This tool only works on the node canvas.',
    )
  }
  const known = canvasNodeIds(canvas)
  const missing = canvasOpTargets(op).filter(
    (id) => !known.has(id) && !batchRefs.has(id),
  )
  if (missing.length > 0) {
    return reject(
      REJECT.noSuchControl,
      `No card on the board has the id ${missing.join(', ')}.${missing.map((id) => nearestCardHint(canvas, id)).join('')} Use an id from the board you just read; if the card is in a shot that was only listed by name, move the focus there and read the board again.`,
    )
  }

  if (op.op === NODE_ASSISTANT_OP_V4_IDS.disconnect) {
    const unknownLine = unknownLineDetail(canvas, op.edgeId)
    if (unknownLine) return reject(REJECT.noSuchControl, unknownLine)
  }

  const editProblem = checkEditDeskOp(canvas, op)
  if (editProblem) return reject(REJECT.noSuchControl, editProblem)

  if (isCanvasConfirmTierOp(op)) {
    const asked = planCanvasConfirm(run, canvas, op)
    if (asked) return asked
  }

  if (op.op === NODE_ASSISTANT_OP_V4_IDS.setParams) {
    const node = canvas.shots
      .flatMap((shot) => (shot.expanded ? shot.nodes : []))
      .find((candidate) => candidate.id === op.target)
    const parameters = node?.parameters
    if (!parameters) {
      return reject(
        REJECT.noSuchControl,
        'This node has no generation parameter controls in the current snapshot.',
      )
    }
    for (const [key, value] of Object.entries(op.params)) {
      if (value === undefined) continue
      const allowed = parameters.options[key as keyof typeof parameters.options]
      if (allowed === true && key === 'seed') continue
      if (!Array.isArray(allowed) || allowed.length === 0) {
        return reject(
          REJECT.noSuchControl,
          `The selected model on ${op.target} has no ${key} control.`,
        )
      }
      if (!(allowed as readonly unknown[]).includes(value)) {
        return reject(
          REJECT.unknownValue,
          `${key} must be one of ${JSON.stringify(allowed)} on ${op.target}; received ${JSON.stringify(value)}.`,
        )
      }
    }
  }

  /** 落到客户端的那条 op —— 写词时可能带上图例，其余原样。 */
  let payloadOp: NodeAssistantOpV4 = op
  if (op.op === NODE_ASSISTANT_OP_V4_IDS.setPrompt) {
    const node = canvas.shots
      .flatMap((shot) => (shot.expanded ? shot.nodes : []))
      .find((candidate) => candidate.id === op.target)
    if (node) {
      const blocked = await checkCanvasReferencePrompt(run, node)
      if (blocked) return blocked
      /**
       * 每张参考图管什么写在词末（与工作台同一段 `withReferenceRoleLegend`；标签方言
       * 读不懂 @Image，不加）。它同时是「这张卡的词是助手带着要点写的」的记号：出图
       * 提案前图例张数与参考图对得上，就不再算一遍要点（owner 2026-10-08）。
       */
      const brief =
        run.canvasBrief?.target === node.id ? run.canvasBrief.brief : null
      if (
        brief &&
        node.referenceUrls?.length &&
        getPromptDialect(resolveAdapterType(node.model ?? '') ?? undefined) ===
          'natural'
      ) {
        const written =
          op.mode === 'append' && node.text
            ? `${node.text}\n\n${op.prompt}`
            : op.prompt
        payloadOp = {
          ...op,
          mode: 'replace',
          prompt: withReferenceRoleLegend(
            written,
            brief.assignments,
            node.referenceUrls,
          ),
        }
      }
    }
  }

  if (
    op.op === NODE_ASSISTANT_OP_V4_IDS.setText &&
    op.mode === 'replace' &&
    canvas.shots
      .flatMap((shot) => (shot.expanded ? shot.nodes : []))
      .find((candidate) => candidate.id === op.target)?.textTruncated
  ) {
    return reject(
      REJECT.partialText,
      'You only read the start of this text node, so replacing it would erase the part you have not seen. Ask the creator to @-mention or select it so the next turn carries its full text, or write with mode "append".',
    )
  }

  const spec = NODE_ASSISTANT_OP_V4_SPECS[op.op]
  /**
   * ⚠ `inverse` 只是一张指路条：真正的撤销载荷（整份 data 快照 + 边表）在客户端
   * 的执行器那一侧扣着。⛔ 别在服务端造一份 —— 它手上没有那些字段。
   */
  const inverse = {
    op: spec.inverse ?? op.op,
    nodeRef: canvasOpTargets(op)[0] ?? op.op,
  }

  return {
    kind: 'mutate',
    payload: payloadOp,
    inverse,
    observation: `Queued ${op.op} on the board. The change lands on the creator's canvas; if the board refuses it you will see why next turn.`,
    // 后果全在客户端的图上 —— 服务端这一步没有本地状态要动。
    apply: () => {},
  }
}

/**
 * 画布那一枪（node-canvas-v2 §13.2.1）—— 与 `planRequestGeneration` 同一条纪律：
 * **一律出生成确认卡**，扳机在卡上（创作者自己按），扣的是那张画布卡
 * 自己的生成键（客户端 `canvas.generate`）。
 *
 * ⛔ 别规划成 `mutate`：改动型出流就是 `done`，客户端 `applyOperatorStep` 当场落地
 *   —— 2026-09-28 读码实证，那等于一张卡都没出就花了钱。
 * ⚠ 没有模型就没有卡可画（判据同 `planRequestGeneration`）：文字卡本来就不出图，
 *   媒体卡要先 `set_model`。
 * 载荷从目标节点的当前参数现取，与客户端确认卡共用同一份映射。
 */
export async function planCanvasGenerate(
  run: OperatorRun,
  args: { target: string },
): Promise<ToolPlan> {
  const canvas = run.state.canvas
  if (!canvas) {
    return reject(
      REJECT.noSuchControl,
      'There is no board here. This tool only works on the node canvas.',
    )
  }
  if (!canvasNodeIds(canvas).has(args.target)) {
    return reject(
      REJECT.noSuchControl,
      `No card on the board has the id ${args.target}.`,
    )
  }
  // ⚠ 准入名单只收展开的镜，所以过了上面那一条这里一定找得到。
  const node = canvas.shots
    .flatMap((shot) => (shot.expanded ? shot.nodes : []))
    .find((candidate) => candidate.id === args.target)
  const request = node ? buildCanvasGenerationRequest(node) : null
  if (!node || !request) {
    return reject(
      REJECT.noModelSelected,
      `The card ${args.target} has no model to run. Text cards never generate; for a media card set its model with canvas_apply set_model first.`,
    )
  }
  // 助手带着要点写过的卡（图例张数 = 参考图张数）不再算要点，直接出确认卡。
  const legendMatches =
    (node.referenceUrls?.length ?? 0) > 0 &&
    referenceRoleLegendCount(node.text ?? '') === node.referenceUrls?.length
  const blocked = legendMatches
    ? null
    : await checkCanvasReferencePrompt(run, node)
  if (blocked) return blocked
  return {
    kind: 'confirmGenerate',
    request,
  }
}
