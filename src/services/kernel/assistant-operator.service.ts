import 'server-only'

import {
  ASSISTANT_OPERATOR_APPEND_SEPARATOR,
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_SEARCH_KINDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_HINTS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
  ASSISTANT_OPERATOR_TOOLS,
  ASSISTANT_OPERATOR_WRITE_MODES,
  type AssistantOperatorConfirmField,
  type AssistantOperatorRejectReason,
  type AssistantOperatorSearchKind,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { ASSISTANT_DOMAIN_BRIEFS } from '@/constants/assistant-protocol'
import { resolveAssistantModelId } from '@/constants/node-studio'
import {
  buildAssistantConversation,
  completeAssistantTextWithContextRetry,
} from '@/services/kernel/assistant-completion.service'
import {
  resolveLlmTextRoute,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'
import { getPublicGenerationPage } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'
import {
  ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS,
  AssistantOperatorStepSchema,
  AssistantOperatorTurnSchema,
  type AssistantOperatorEvent,
  type AssistantOperatorRequest,
  type AssistantOperatorSearchResultAsset,
  type AssistantOperatorSnapshot,
  type AssistantOperatorTurn,
} from '@/types/assistant-operator'
import type { OutputType, PromptAssistantResponseLanguage } from '@/types'

/**
 * 工作台助手的**工具环**（P1，`docs/plans/studio-assistant-operator-2026-08-30.md` §2）。
 *
 * ── 一句话形状 ─────────────────────────────────────────────────
 * 一轮 = 最多 `maxSteps` 次「问模型要一个工具调用 → 跑它 → 把结果讲给模型听」。
 * 每一步吐两个 `step` 事件（`running` / `done`），客户端边看边把 op 应用到表单。
 *
 * ── ⛔ 钱闸（本文件的宪法）────────────────────────────────────────
 * **这里没有任何一条路径能创建 generation。** 它只 import 了两个服务：
 * `user.service`（认 clerkId）与 `generation.service` 的**只读**分页查询。
 * `prime_generate` 也只是吐一个 op 让生成键亮起来 —— 扣扳机的永远是用户（拍板 2）。
 * 有 `assistant-operator.money-gate.test.ts` 逐条锁住这份 import 名单：想在这里
 * 加一条会花钱的路，先过那道测试，而它是设计上过不去的。
 *
 * ── 为什么服务端不存任何状态 ──────────────────────────────────────
 * 拍板 13「插话即转向」的实现就是「客户端 abort + 带新消息重发」。要让它成立，
 * 服务端就不能有会话态 —— 断在半路的一轮不能留下任何痕迹。于是：
 *   · `set_*` / `mount_reference` **不落库**，只吐 op，写入发生在客户端；
 *   · 「刚才做过什么」由客户端在下一次请求里用 `priorSteps` 带回来；
 *   · 就地确认（拍板 3）复用同一条通道：吐 `confirm_request` → 这条流结束 →
 *     客户端带 `confirmations` 重发。**多一条挂起通道就多一份会话态**，
 *     那正是打断语义要躲开的东西。
 */

// ─── 运行态（只活在一轮之内）────────────────────────────────────

/**
 * 工作台快照的**工作副本**。
 *
 * ⚠ 必须是可变副本，不能一直读请求里那份原始快照：第二条 `set_prompt` 的
 * `inverse` 要能撤回到**第一条写完之后**的值，而不是这一轮开始时的值。用原始快照
 * 算逆操作，连改两次再撤一次就会把中间那次的结果一起吞掉。
 */
interface OperatorWorkingState {
  prompt: string
  negativePrompt: string | undefined
  hasNegativeControl: boolean
  modelId: string | null
  modelLabel: string | null
  hasModelControl: boolean
  aspectRatio: string | null
  resolution: string | null
  hasSpecsControl: boolean
  count: number | null
  hasCountControl: boolean
  referenceCount: number
  referenceLimit: number
  hasReferenceControl: boolean
}

function toWorkingState(
  snapshot: AssistantOperatorSnapshot,
): OperatorWorkingState {
  return {
    prompt: snapshot.prompt,
    negativePrompt: snapshot.negativePrompt,
    // ⚠ 字段缺席 = 没有这个控件，不是「有但空着」（2026-08-22 真机实证）。
    hasNegativeControl: snapshot.negativePrompt !== undefined,
    modelId: snapshot.model?.id ?? null,
    modelLabel: snapshot.model?.label ?? null,
    hasModelControl: snapshot.model !== undefined,
    aspectRatio: snapshot.specs?.aspectRatio ?? null,
    resolution: snapshot.specs?.resolution ?? null,
    hasSpecsControl: snapshot.specs !== undefined,
    count: snapshot.count?.value ?? null,
    hasCountControl: snapshot.count !== undefined,
    referenceCount: snapshot.references?.items.length ?? 0,
    referenceLimit: snapshot.references?.limit ?? 0,
    hasReferenceControl: snapshot.references !== undefined,
  }
}

interface OperatorRun {
  request: AssistantOperatorRequest
  state: OperatorWorkingState
  /**
   * 本轮 `search_assets` 真的返回过的素材。
   *
   * ⛔ `mount_reference` 只认这张表里的 id —— 模型给不出 URL，也不许它给。
   * 论据与画布 `attach_asset` 同源：让模型写地址就是让它编一个不存在的地址。
   */
  searchIndex: Map<string, AssistantOperatorSearchResultAsset>
  /** 讲给模型听的「刚才发生了什么」。 */
  observations: string[]
  /** 本轮里助手自己写过的字段 —— 覆写自己的东西不需要再问用户一次。 */
  assistantWrittenFields: Set<AssistantOperatorConfirmField>
  stepSeq: number
}

// ─── 工具计划（纯函数，不碰 IO）──────────────────────────────────

type ToolPlan =
  | { kind: 'rejected'; reason: AssistantOperatorRejectReason; detail?: string }
  | {
      kind: 'confirm'
      field: AssistantOperatorConfirmField
      have: string
      proposed: string
    }
  | {
      kind: 'read'
      payload: unknown
      run(): Promise<{ result: unknown; observation: string }>
    }
  | {
      kind: 'mutate'
      payload: unknown
      inverse: unknown
      observation: string
      apply(): void
    }

function reject(
  reason: AssistantOperatorRejectReason,
  detail?: string,
): ToolPlan {
  return { kind: 'rejected', reason, ...(detail ? { detail } : {}) }
}

function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

// ─── 状态渲染（`read_state` 的产出，也是每轮喂给模型的那段）────────

/**
 * 把工作副本渲染成给模型看的一段。
 *
 * 三条规矩与 `lib/assistant-workbench-state.ts` 逐条相同 —— 空态要说出来、不冒充
 * 自己不知道的事、有上限。多的那条是**可选值必须一起给**：不给列表，模型只会编一个
 * （画布 `[[setup]]` 真机上编出过一个工作区里根本不存在的「Animagine XL」）。
 */
function renderState(run: OperatorRun): string {
  const { state, request } = run
  const lines: string[] = []

  lines.push(
    `- Positive prompt: ${
      state.prompt
        ? `"${clamp(state.prompt, LIMITS.maxConfirmHaveChars)}"`
        : '(empty)'
    }`,
  )
  lines.push(
    state.hasNegativeControl
      ? `- Negative prompt: ${
          state.negativePrompt
            ? `"${clamp(state.negativePrompt, LIMITS.maxConfirmHaveChars)}"`
            : '(empty)'
        }`
      : '- Negative prompt: THIS WORKBENCH HAS NO NEGATIVE PROMPT FIELD — set_negative will be refused here.',
  )

  if (!state.hasModelControl) {
    lines.push('- Model: this workbench does not pick a model.')
  } else if (!state.modelId) {
    lines.push('- Model: NOT SELECTED YET')
  } else {
    lines.push(
      `- Model: ${state.modelLabel ?? state.modelId} (id: ${state.modelId})`,
    )
  }

  const models = request.snapshot.availableModels.slice(
    0,
    LIMITS.maxAvailableModels,
  )
  lines.push(
    models.length > 0
      ? `- Models you can switch to (copy the id verbatim): ${models
          .map((model) =>
            model.label === model.id
              ? model.id
              : `${model.id} — ${model.label}`,
          )
          .join(' | ')}`
      : '- Models you can switch to: none listed — do not call set_model.',
  )

  if (!state.hasSpecsControl) {
    lines.push(
      '- Output specs: this workbench has no aspect-ratio / resolution controls.',
    )
  } else {
    const specs = request.snapshot.specs
    lines.push(
      `- Aspect ratio: ${state.aspectRatio ?? '(not set)'} — options: ${
        specs?.aspectRatioOptions.join(', ') || '(none)'
      }`,
    )
    lines.push(
      `- Resolution: ${state.resolution ?? '(not set)'} — options: ${
        specs?.resolutionOptions.join(', ') || '(none)'
      }`,
    )
    lines.push(
      '  (set_specs always carries BOTH of these — one without the other is not a real aspect ratio in this app.)',
    )
  }

  if (!state.hasCountControl) {
    lines.push('- Outputs per send: this workbench has no count control.')
  } else {
    lines.push(
      `- Outputs per send: ${state.count} — options: ${
        request.snapshot.count?.options.join(', ') ?? ''
      }`,
    )
  }

  lines.push(
    state.hasReferenceControl
      ? `- Reference images mounted: ${state.referenceCount}/${state.referenceLimit}`
      : '- Reference images: this workbench takes no reference images.',
  )

  return lines.join('\n')
}

// ─── 工具规划 ───────────────────────────────────────────────────

function planReadState(run: OperatorRun): ToolPlan {
  return {
    kind: 'read',
    payload: {},
    run: async () => {
      const digest = renderState(run)
      return { result: { digest }, observation: `Workbench state:\n${digest}` }
    },
  }
}

/**
 * 库里的 `outputType` → 操作员的检索类型。
 *
 * ⚠ 有意用 `Partial`：`AUDIO` / `MODEL_3D` **没有对应值**，因为工作台上没有把它们
 * 挂成参考的槽（见 `ASSISTANT_OPERATOR_SEARCH_KINDS` 头注）。查不到映射的记录会被
 * 直接过滤掉，而不是硬塞成 image —— 塞进去的表现是给用户一条挂不上去的候选。
 */
const SEARCH_KIND_BY_OUTPUT_TYPE: Partial<
  Record<OutputType, AssistantOperatorSearchKind>
> = {
  IMAGE: 'image',
  VIDEO: 'video',
}

function planSearchAssets(
  run: OperatorRun,
  args: { query: string; kind?: AssistantOperatorSearchKind; limit?: number },
  userId: string,
): ToolPlan {
  const limit = Math.min(
    args.limit ?? LIMITS.maxSearchResults,
    LIMITS.maxSearchResults,
  )
  const kind = args.kind ?? null

  return {
    kind: 'read',
    payload: { query: args.query, kind, limit },
    run: async () => {
      const page = await getPublicGenerationPage({
        // ⭐ 唯一真的查库的地方，且**只查这个用户自己的**（`userId` 一给，
        //    `buildGalleryWhere` 就不再要求 isPublic）。复用现有分页查询，不新写。
        userId,
        search: args.query,
        type: kind ? [kind] : [...ASSISTANT_OPERATOR_SEARCH_KINDS],
        limit,
        sort: 'newest',
      })

      const assets = page.generations
        // 没出完 / 失败的那些没有 url，挂不上去，别端给模型；类型不在可挂表里的
        // 同理（正常查不到，但这条 filter 让「查到了也挂不上」不可能发生）。
        .flatMap((generation) => {
          const kind = SEARCH_KIND_BY_OUTPUT_TYPE[generation.outputType]
          return generation.url && kind
            ? [{ generation, url: generation.url, kind }]
            : []
        })
        .slice(0, limit)
        .map(({ generation, url, kind }) => ({
          assetId: generation.id,
          url,
          ...(generation.thumbnailUrl
            ? { thumbnailUrl: generation.thumbnailUrl }
            : {}),
          kind,
          ...(generation.prompt
            ? {
                prompt: clamp(
                  generation.prompt,
                  LIMITS.maxPriorStepSummaryChars,
                ),
              }
            : {}),
          ...(generation.model ? { model: generation.model } : {}),
          createdAt: generation.createdAt.toISOString(),
        }))

      for (const asset of assets) run.searchIndex.set(asset.assetId, asset)

      const observation =
        assets.length === 0
          ? // 空结果说出来 —— 静默的空结果会让模型接着编一个 id 出来挂。
            `search_assets("${args.query}") found NOTHING in the creator's library. Do not invent an asset id; say so or try a different word.`
          : `search_assets("${args.query}") → ${assets.length} asset(s):\n${assets
              .map(
                (asset, index) =>
                  `  ${index + 1}. assetId=${asset.assetId} · ${asset.kind}${
                    asset.prompt ? ` · "${asset.prompt}"` : ''
                  }`,
              )
              .join('\n')}`

      return {
        result: { totalFound: page.total, assets },
        observation,
      }
    },
  }
}

function planMountReference(
  run: OperatorRun,
  args: { assetId: string },
): ToolPlan {
  if (!run.state.hasReferenceControl) return reject(REJECT.noSuchControl)

  const asset = run.searchIndex.get(args.assetId)
  if (!asset) {
    return reject(
      REJECT.unknownAsset,
      'Only asset ids returned by search_assets in this run can be mounted.',
    )
  }
  if (run.state.referenceCount >= run.state.referenceLimit) {
    return reject(REJECT.referencesFull)
  }

  return {
    kind: 'mutate',
    payload: {
      assetId: asset.assetId,
      url: asset.url,
      ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
      kind: asset.kind,
      ...(asset.model ? { label: asset.model } : {}),
    },
    inverse: { assetId: asset.assetId },
    observation: `Mounted ${asset.assetId} as a reference (${
      run.state.referenceCount + 1
    }/${run.state.referenceLimit}).`,
    apply: () => {
      run.state.referenceCount += 1
    },
  }
}

function planSetModel(run: OperatorRun, args: { modelId: string }): ToolPlan {
  if (!run.state.hasModelControl) return reject(REJECT.noSuchControl)

  const match = run.request.snapshot.availableModels.find(
    (model) => model.id === args.modelId,
  )
  if (!match) {
    return reject(
      REJECT.unknownModel,
      `"${clamp(args.modelId, LIMITS.maxLabelChars)}" is not in availableModels.`,
    )
  }

  const previousId = run.state.modelId
  return {
    kind: 'mutate',
    payload: { modelId: match.id, modelLabel: match.label },
    inverse: { modelId: previousId },
    observation: `Model is now ${match.label} (${match.id}).`,
    apply: () => {
      run.state.modelId = match.id
      run.state.modelLabel = match.label
    },
  }
}

/**
 * 写文本框的共用一条（正面 / 负面）。
 *
 * ⭐ 就地确认闸在这里（拍板 3）：目标字段里已经有**用户手写**的内容、而这一轮
 * 助手还没写过它、用户也还没就这个字段表过态 → 返回 `confirm`，流就停在这儿。
 * 「助手自己刚写的」不再问 —— 覆盖自己的草稿不需要用户点三次头。
 */
function planSetText(
  run: OperatorRun,
  field: AssistantOperatorConfirmField,
  args: { value: string; mode?: string },
): ToolPlan {
  const isPrompt = field === ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt
  if (!isPrompt && !run.state.hasNegativeControl) {
    return reject(REJECT.noSuchControl)
  }
  if (!args.value.trim()) return reject(REJECT.emptyValue)

  const current = isPrompt ? run.state.prompt : (run.state.negativePrompt ?? '')
  const decision = run.request.confirmations?.find(
    (entry) => entry.field === field,
  )?.choice

  if (current.trim() && !run.assistantWrittenFields.has(field)) {
    if (!decision) {
      return {
        kind: 'confirm',
        field,
        have: clamp(current, LIMITS.maxConfirmHaveChars),
        proposed: clamp(args.value, LIMITS.maxConfirmHaveChars),
      }
    }
    if (decision === ASSISTANT_OPERATOR_CONFIRM_CHOICES.keep) {
      return reject(
        REJECT.userDeclined,
        'The creator chose to keep what they wrote.',
      )
    }
  }

  const appendRequested =
    args.mode === ASSISTANT_OPERATOR_WRITE_MODES.append ||
    decision === ASSISTANT_OPERATOR_CONFIRM_CHOICES.append
  // 空框追加什么都追加不到，退回整段写入 —— 免得 inverse 里存一个假的「原文」。
  const mode =
    appendRequested && current.trim()
      ? ASSISTANT_OPERATOR_WRITE_MODES.append
      : ASSISTANT_OPERATOR_WRITE_MODES.replace

  const next =
    mode === ASSISTANT_OPERATOR_WRITE_MODES.append
      ? `${current}${ASSISTANT_OPERATOR_APPEND_SEPARATOR}${args.value}`
      : args.value

  return {
    kind: 'mutate',
    payload: { value: args.value, mode },
    // ⚠ 逆操作永远是改前的完整原文，两种 mode 撤法因此完全一样。
    inverse: { value: current },
    observation: `${isPrompt ? 'Positive' : 'Negative'} prompt (${mode}) is now: "${clamp(
      next,
      LIMITS.maxPriorStepSummaryChars,
    )}"`,
    apply: () => {
      if (isPrompt) run.state.prompt = next
      else run.state.negativePrompt = next
      run.assistantWrittenFields.add(field)
    },
  }
}

function planSetSpecs(
  run: OperatorRun,
  args: { aspectRatio: string; resolution: string },
): ToolPlan {
  if (!run.state.hasSpecsControl) return reject(REJECT.noSuchControl)

  const specs = run.request.snapshot.specs
  if (!specs?.aspectRatioOptions.includes(args.aspectRatio)) {
    return reject(REJECT.unknownValue, `aspectRatio "${args.aspectRatio}"`)
  }
  if (!specs.resolutionOptions.includes(args.resolution)) {
    return reject(REJECT.unknownValue, `resolution "${args.resolution}"`)
  }

  const previous = {
    aspectRatio: run.state.aspectRatio,
    resolution: run.state.resolution,
  }
  return {
    kind: 'mutate',
    // ⚠ 台账 AE/BG/BS：两个字段必须同时下发，缺一个就不是真比例。
    payload: { aspectRatio: args.aspectRatio, resolution: args.resolution },
    inverse: previous,
    observation: `Specs are now ${args.aspectRatio} · ${args.resolution}.`,
    apply: () => {
      run.state.aspectRatio = args.aspectRatio
      run.state.resolution = args.resolution
    },
  }
}

function planSetCount(run: OperatorRun, args: { count: number }): ToolPlan {
  if (!run.state.hasCountControl) return reject(REJECT.noSuchControl)

  const options = run.request.snapshot.count?.options ?? []
  if (!options.includes(args.count)) {
    return reject(
      REJECT.unknownValue,
      `count ${args.count} — options are ${options.join(', ')}`,
    )
  }

  const previous = run.state.count
  if (previous === null) return reject(REJECT.noSuchControl)

  return {
    kind: 'mutate',
    payload: { count: args.count },
    inverse: { count: previous },
    observation: `One send now produces ${args.count}.`,
    apply: () => {
      run.state.count = args.count
    },
  }
}

/**
 * ⛔ 这条**不生成任何东西**。它吐一个 op 让客户端把生成键置成 primed 态并算价，
 * 点的人永远是用户（拍板 2）。服务端在这一步一次外部调用都不发。
 */
function planPrimeGenerate(run: OperatorRun): ToolPlan {
  if (run.state.hasModelControl && !run.state.modelId) {
    return reject(REJECT.noModelSelected)
  }
  if (!run.state.prompt.trim()) return reject(REJECT.emptyPrompt)

  return {
    kind: 'mutate',
    payload: { primed: true },
    inverse: { primed: false },
    observation:
      'The generate button is armed with the current form. The creator presses it themselves — you cannot.',
    apply: () => {},
  }
}

function planTool(
  run: OperatorRun,
  tool: AssistantOperatorTool,
  rawArgs: unknown,
  userId: string,
): ToolPlan {
  const parsed = ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[tool].safeParse(rawArgs)
  if (!parsed.success) {
    return reject(
      REJECT.malformedArgs,
      parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; '),
    )
  }

  // ⚠ `switch` 上的穷举：工具表加一条而这里没接，编译期就红（见文件末尾的
  //    `assertNever`）。别改成 if/else 链。
  switch (tool) {
    case TOOL.readState:
      return planReadState(run)
    case TOOL.searchAssets:
      return planSearchAssets(
        run,
        parsed.data as {
          query: string
          kind?: AssistantOperatorSearchKind
          limit?: number
        },
        userId,
      )
    case TOOL.mountReference:
      return planMountReference(run, parsed.data as { assetId: string })
    case TOOL.setModel:
      return planSetModel(run, parsed.data as { modelId: string })
    case TOOL.setPrompt:
      return planSetText(
        run,
        ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
        parsed.data as { value: string; mode?: string },
      )
    case TOOL.setNegative:
      return planSetText(
        run,
        ASSISTANT_OPERATOR_CONFIRM_FIELDS.negative,
        parsed.data as { value: string; mode?: string },
      )
    case TOOL.setSpecs:
      return planSetSpecs(
        run,
        parsed.data as { aspectRatio: string; resolution: string },
      )
    case TOOL.setCount:
      return planSetCount(run, parsed.data as { count: number })
    case TOOL.primeGenerate:
      return planPrimeGenerate(run)
    default:
      return assertNever(tool)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled assistant operator tool: ${String(value)}`)
}

// ─── 提示词 ─────────────────────────────────────────────────────

const RESPONSE_LANGUAGE_LABELS: Record<
  PromptAssistantResponseLanguage,
  string
> = {
  english: 'English',
  japanese: 'Japanese',
  chinese: 'Simplified Chinese',
}

function buildOperatorSystemPrompt(request: AssistantOperatorRequest): string {
  const brief = ASSISTANT_DOMAIN_BRIEFS[request.domain]
  const language =
    RESPONSE_LANGUAGE_LABELS[request.responseLanguage ?? 'english']
  const tools = ASSISTANT_OPERATOR_TOOLS.map(
    (tool) => `  - ${tool}: ${ASSISTANT_OPERATOR_TOOL_HINTS[tool]}`,
  ).join('\n')

  return `You are PixelVault's workbench operator. ${brief.persona}

You do not tell the creator which buttons to press — you press them. Every turn you either call ONE tool or finish.

HARD RULES — these are structural, not stylistic:
- You CANNOT generate anything. No tool of yours spends the creator's credits. The most you can do is prime_generate, which arms the button; the creator presses it. Never claim you generated, rendered, or started anything.
- You may only touch knobs that exist on this workbench. The state block tells you which ones exist; a field described as absent has no control behind it, and calling its tool will be refused.
- Never invent a model id or an asset id. Model ids come from the state block, asset ids come from search_assets results. A made-up id is refused and wastes a step.
- set_specs always carries aspectRatio AND resolution together.
- If the creator already hand-wrote a prompt, writing over it needs their say-so — call the tool anyway and the app will ask them; do not ask in prose.
- Reply in ${language}.

TOOLS:
${tools}

OUTPUT — every turn is ONE strict-JSON object and nothing else. No prose outside it, no code fence:
{"plan":["short step","short step"],"message":"what you are telling the creator","tool":{"name":"set_prompt","title":"one short line for the log","reason":"why, in one line","args":{"value":"..."}},"finished":false}

- "plan" only on your FIRST turn, at most ${LIMITS.maxPlanItems} short items. Omit it afterwards.
- "message" is optional; use it to say something worth saying, not to narrate every step.
- Omit "tool" (or set "finished":true) when the work is done. Do that as soon as the form is ready — an extra step costs the creator time.
- One tool per turn. You get at most ${LIMITS.maxSteps} steps for the whole request.
- After each tool you will be told what actually happened. If a call was refused, read the reason and adapt — do not repeat the same call.`
}

function buildOperatorUserPrompt(run: OperatorRun, maxLength?: number): string {
  const sections: string[] = []

  sections.push(`CURRENT WORKBENCH STATE (the creator is looking at this right now):
${renderState(run)}`)

  if (run.request.priorSteps?.length) {
    sections.push(`WHAT YOU ALREADY DID EARLIER IN THIS THREAD:
${run.request.priorSteps
  .map((step) => `- [${step.status}] ${step.tool}: ${step.summary}`)
  .join('\n')}`)
  }

  if (run.request.confirmations?.length) {
    sections.push(`THE CREATOR ANSWERED YOUR OVERWRITE QUESTION:
${run.request.confirmations
  .map((entry) => `- ${entry.field}: ${entry.choice}`)
  .join('\n')}`)
  }

  if (run.observations.length > 0) {
    sections.push(`WHAT HAPPENED SO FAR THIS TURN:
${run.observations.join('\n')}`)
  }

  const prefix = `${sections.join('\n\n')}\n\nCONVERSATION:\n`
  const suffix = '\n\nReply with ONE JSON object.'
  const conversationBudget =
    maxLength === undefined
      ? undefined
      : Math.max(1, maxLength - prefix.length - suffix.length)

  return `${prefix}${buildAssistantConversation(
    run.request.messages,
    conversationBudget,
  )}${suffix}`
}

const OPERATOR_CONTEXT_COMPACTION_TARGET_LENGTH = 24_000

/**
 * 剥掉围栏再解析。`responseFormat:'json_object'` 只在部分 provider 上是硬保证，
 * 剩下那些照样会给你包一层 ```json —— 这十行是那一档的代价。
 */
function parseTurnJson(raw: string): AssistantOperatorTurn | null {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidates = [
    fenced?.[1]?.trim(),
    trimmed,
    trimmed.match(/\{[\s\S]*\}/)?.[0],
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const parsed = AssistantOperatorTurnSchema.safeParse(
        JSON.parse(candidate) as unknown,
      )
      if (parsed.success) return parsed.data
    } catch {
      // 下一个候选
    }
  }
  return null
}

// ─── 工具环 ─────────────────────────────────────────────────────

export interface AssistantOperatorRunOptions {
  /**
   * 客户端断开时触发（拍板 13 的插话 / ⏹）。
   *
   * ⚠ 它只能拦住**还没开始**的下一步：`llmTextCompletion` 这条链不吃 signal，
   * 在飞的那次补全会跑完然后被丢弃（它是 await 出来的，不是悬空 promise）。
   * 要真正掐断在飞请求得让 `LlmTextInput` 收 signal —— 那是另一片的事，别在这里
   * 顺手给这条链造第二套超时机制。
   */
  signal?: AbortSignal
}

export async function* runAssistantOperator(
  clerkId: string,
  request: AssistantOperatorRequest,
  options: AssistantOperatorRunOptions = {},
): AsyncIterable<AssistantOperatorEvent> {
  const user = await ensureUser(clerkId)
  const route: ResolvedLlmTextRoute = await resolveLlmTextRoute(
    user.id,
    request.apiKeyId,
  )
  const modelId = resolveAssistantModelId(route.adapterType, request.llmModelId)

  const run: OperatorRun = {
    request,
    state: toWorkingState(request.snapshot),
    searchIndex: new Map(),
    observations: [],
    assistantWrittenFields: new Set(),
    stepSeq: 0,
  }

  const systemPrompt = buildOperatorSystemPrompt(request)
  let planEmitted = false
  let consecutiveParseFailures = 0
  let completed = false

  try {
    for (let index = 0; index < LIMITS.maxSteps; index += 1) {
      if (options.signal?.aborted) {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.stopped,
          reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
        }
        completed = true
        return
      }

      const raw = await completeAssistantTextWithContextRetry({
        systemPrompt,
        buildUserPrompt: (maxLength) => buildOperatorUserPrompt(run, maxLength),
        route,
        contextCompactionTargetLength:
          OPERATOR_CONTEXT_COMPACTION_TARGET_LENGTH,
        modelId,
        responseFormat: 'json_object',
      })

      // ⚠ abort 可能发生在这次 await 期间：结果已经拿到但客户端早就走了。
      //    这里再查一次，免得往一条没人读的流里继续吐事件。
      if (options.signal?.aborted) {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.stopped,
          reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
        }
        completed = true
        return
      }

      const turn = parseTurnJson(raw)
      if (!turn) {
        consecutiveParseFailures += 1
        // 连着两次读不出来就不是抖动了 —— 大声报错，别把剩下的步数烧在同一个坑里。
        if (consecutiveParseFailures >= 2) {
          throw new Error('The assistant model did not return usable JSON.')
        }
        run.observations.push(
          'Your last reply was not a single valid JSON object. Reply with ONE JSON object and nothing else.',
        )
        continue
      }
      consecutiveParseFailures = 0

      if (turn.plan?.length && !planEmitted) {
        planEmitted = true
        yield { type: ASSISTANT_OPERATOR_EVENTS.plan, steps: turn.plan }
      }
      if (turn.message?.trim()) {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.message,
          text: turn.message.trim(),
        }
      }

      if (!turn.tool || turn.finished) {
        yield { type: ASSISTANT_OPERATOR_EVENTS.done }
        completed = true
        return
      }

      const { name, title, reason, args } = turn.tool
      const plan = planTool(run, name, args, user.id)
      run.stepSeq += 1
      const base = {
        id: `step-${run.stepSeq}`,
        // 模型没写标题就用工具名兜底 —— 少一个装饰字段不值得作废一整步。
        title: title ?? name,
        ...(reason ? { reason } : {}),
      }

      if (plan.kind === 'confirm') {
        // 拍板 3：就地确认。流停在这里，客户端带 `confirmations` 重发续跑 ——
        // 与打断复用同一条机制，服务端因此不需要任何挂起态。
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.confirmRequest,
          field: plan.field,
          have: plan.have,
          proposed: plan.proposed,
        }
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.stopped,
          reason: ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm,
        }
        completed = true
        return
      }

      if (plan.kind === 'rejected') {
        yield toStepEvent({
          ...base,
          tool: name,
          status: STATUS.error,
          error: {
            reason: plan.reason,
            ...(plan.detail ? { detail: plan.detail } : {}),
          },
        })
        run.observations.push(
          `${name} was REFUSED (${plan.reason})${
            plan.detail ? `: ${plan.detail}` : ''
          }. Do not retry it unchanged.`,
        )
        continue
      }

      if (plan.kind === 'read') {
        yield toStepEvent({
          ...base,
          tool: name,
          status: STATUS.running,
          payload: plan.payload,
          result: null,
        })
        const { result, observation } = await plan.run()
        yield toStepEvent({
          ...base,
          tool: name,
          status: STATUS.done,
          payload: plan.payload,
          result,
        })
        run.observations.push(observation)
        continue
      }

      const applied = {
        ...base,
        tool: name,
        payload: plan.payload,
        inverse: plan.inverse,
      }
      yield toStepEvent({ ...applied, status: STATUS.running })
      plan.apply()
      yield toStepEvent({ ...applied, status: STATUS.done })
      run.observations.push(plan.observation)
    }

    yield {
      type: ASSISTANT_OPERATOR_EVENTS.stopped,
      reason: ASSISTANT_OPERATOR_STOP_REASONS.maxSteps,
    }
    completed = true
  } finally {
    // 生成器被 `return()` 掉（客户端 cancel 了流）时也会走到这里 —— 本轮没有任何
    // 服务端状态要回滚，唯一要做的是留一行日志，别让「跑了一半的轮次」查不出来。
    if (!completed) {
      logger.info('assistant operator run ended early', {
        userId: clerkId,
        steps: run.stepSeq,
        aborted: options.signal?.aborted ?? false,
      })
    }
  }
}

/**
 * ⭐ 出流之前**用契约自己校验一遍**。
 *
 * 不是防御性编程：改动型 step 少一个 `inverse` 时，这里当场抛，而不是把一条撤不掉
 * 的 step 发给客户端 —— 后者的表现是「点了撤销没反应」，一种最难查的失败。
 * 服务端与客户端因此共用同一份判据。
 */
function toStepEvent(raw: unknown): AssistantOperatorEvent {
  return {
    type: ASSISTANT_OPERATOR_EVENTS.step,
    step: AssistantOperatorStepSchema.parse(raw),
  }
}
