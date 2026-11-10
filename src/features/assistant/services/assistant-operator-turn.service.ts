import 'server-only'

import {
  type AssistantOperatorRequest,
  type AssistantOperatorWorkingMemoryArtifact,
  AssistantOperatorStepSchema,
  type AssistantOperatorEvent,
  type AssistantOperatorStep,
  type AssistantOperatorTurn,
  type AssistantOperatorPlanQuestion,
} from '@/types/assistant-operator'
import { isAssistantQuestionTurn } from '@/lib/assistant-operator-intent'
import {
  overwriteAnswerId,
  ASSISTANT_WORKING_MEMORY as MEMORY_LIMITS,
  ASSISTANT_OPERATOR_TIME_BUDGET,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_TIME_BUDGET_ERROR_CODE,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_ROUND_SUMMARY_LIMITS as ROUND_LIMITS,
  ASSISTANT_PROJECT_RULE_LIMITS as RULE_LIMITS,
  ASSISTANT_PLAN_CARD_LIMITS as PLAN_LIMITS,
} from '@/constants/assistant-operator'
import {
  type AssistantRouteModel,
  ASSISTANT_PERSONA_LIMITS as PERSONA_LIMITS,
  ASSISTANT_PERSONA_DEFAULTS,
} from '@/constants/assistant-persona'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { resolveAdapterType } from '@/constants/models'
import { assertAssistantMediaRoute } from '@/lib/assistant-media-gate'
import { ApiRequestError } from '@/lib/errors'
import { getAssistantPlanVisual } from '@/constants/assistant-plan-visuals'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'
import { ensureUser } from '@/services/user.service'
import { getAssistantPersonaByUserId } from '@/features/assistant/services/assistant-persona.service'
import { withSummarizedBackstory } from '@/services/kernel/character-backstory-summary.service'
import { listProjectSourceRules } from '@/services/project-rule.service'
import { listCreatorMemoriesForPrompt } from '@/features/assistant/services/assistant-memory.service'
import { buildSourceRuleFilter } from '@/services/research/research-source-rules.service'
import {
  listAssistantConversationRounds,
  assertAssistantConversationWorkspaceAccess,
  assertAssistantWorkspaceAccess,
} from '@/features/assistant/services/assistant-conversation.service'
import {
  assistantWorkspaceFromKey,
  assistantWorkspaceDomain,
} from '@/lib/assistant-workspace'
import { getPromptDialect } from '@/constants/prompt-dialects'
import {
  attachmentArtifacts,
  collectStepArtifacts,
} from '@/lib/studio-operator-artifacts'
import { logger } from '@/lib/logger'
import type { AssistantConversationRoundStored } from '@/types/assistant-conversation'
import type {
  AssistantPromptPersona,
  AssistantPromptWorldEntry,
} from '@/types/assistant-persona'
import type { ContextCard } from '@/types/context-cards'
import {
  pushLedgerLine,
  type OperatorRun,
  toWorkingState,
  clamp,
} from '@/features/assistant/services/assistant-operator-run.service'
import {
  describeOneAnswer,
  NO_PLAN_ANSWER,
  latestUserMessage,
} from '@/features/assistant/services/assistant-operator-prompt.service'
import {
  collectRoundAnswers,
  optionalContext,
} from '@/features/assistant/services/assistant-operator-planning.service'
import {
  memoryScopeForDomain,
  memoryAsRule,
} from '@/features/assistant/services/assistant-operator-memory.service'

/**
 * 工作台助手的**工具环**（词表见 `src/constants/assistant-operator.ts`）。
 *
 * ── 一句话形状 ─────────────────────────────────────────────────
 * 一轮 = 最多 `maxSteps` 次「问模型要一个工具调用 → 跑它 → 把结果讲给模型听」。
 * 每一步吐两个 `step` 事件（`running` / `done`），客户端边看边把 op 应用到表单。
 *
 * ── ⛔ 钱闸（这一族文件的宪法）──────────────────────────────────────
 * **这里没有任何一条路径能创建 generation。** 它只接只读检索、视觉补全与
 * 表单操作规划服务；素材文件夹视觉检查也只读取既有 URL，不写库、不下载。
 * `prime_generate` 也只是吐一个 op 让生成键亮起来 —— 扣扳机的永远是用户（拍板 2）。
 * 有 `assistant-operator.money-gate.test.ts` 逐条锁住这份 import 名单：想在这里
 * 加一条会花钱的路，先过那道测试，而它是设计上过不去的。
 *
 * ── 为什么服务端不存任何状态 ──────────────────────────────────────
 * 拍板 13「插话即转向」的实现就是「客户端 abort + 带新消息重发」。要让它成立，
 * 服务端就不能有会话态 —— 断在半路的一轮不能留下任何痕迹。于是：
 *   · `set_*` / `mount_reference` **不落库**，只吐 op，写入发生在客户端；
 *   · 「刚才做过什么」由客户端在下一次请求里用 `priorSteps` 带回来；
 *   · 就地确认（拍板 3）复用同一条通道：吐一帧问题卡 → 这条流结束 →
 *     客户端带 `confirmations` 重发。**多一条挂起通道就多一份会话态**，
 *     那正是打断语义要躲开的东西。
 *
 * ── 这一族文件 ─────────────────────────────────────────────────
 * 11-10 起执行器按职责拆成 `assistant-operator-*.service.ts`（M1–M5），原来的
 * `assistant-operator.service.ts` 已删；本文件是开轮准备、时间预算与出流那一层。
 * ⚠ 钱闸测试按这个前缀收整族源码：新模块必须沿用这个前缀。
 */

// ─── 工具环 ─────────────────────────────────────────────────────

export interface AssistantOperatorRunOptions {
  /**
   * 客户端断开时触发（拍板 13 的插话 / ⏹）。
   */
  signal?: AbortSignal
  /** 覆盖 `ASSISTANT_OPERATOR_TIME_BUDGET`。⚠ 只给测试用，路由不传。 */
  timeBudget?: { softMs: number; hardMs: number }
  /** 读当前时间。⚠ 同上，只给测试用。 */
  now?: () => number
  /** 压过 persona 的文本模型（见 `PrepareOperatorTurnOptions.routeModel`）。路由不传。 */
  routeModel?: AssistantRouteModel
  /**
   * 这一轮的号由路由定（回合托管，11-11）：路由要拿它写事件日志、在 `open` 帧里交给前端。
   * 接力那一跳以存下的轮状态为准；缺席 = 内核自己生成。
   */
  turnId?: string
}

/** 工具环本体收到的那一份：signal 已经并进了时间预算的硬线。 */
export interface OperatorTurnOptions {
  signal: AbortSignal
  /** 这一次请求是不是已经过了软线（只有画布看它）。 */
  pastSoftBudget: () => boolean
}

/**
 * 聊天这一轮的人设（附录L 第二片）：世界书只留这一轮提到的那几条（`pickWorldNotes`）。
 * ⚠ 卡上的开场白只给模型当口吻参考：对话里从不显示它（owner 10-27：你先开口她才说话）。
 */
function withChatTurn(
  persona: AssistantPromptPersona,
  request: AssistantOperatorRequest,
): AssistantPromptPersona {
  const roleplay = persona.roleplay
  if (!roleplay) return persona
  return {
    ...persona,
    roleplay: {
      ...roleplay,
      world: pickWorldNotes(roleplay.world ?? [], request),
    },
  }
}

/**
 * 世界书这一轮挑哪几条（附录L 第二片 C，「关键词触发、只当资料」）：常驻的一直在；其余看最近
 * `worldScanMessages` 条对白（含你这一句）里有没有出现它的关键词（不分大小写）。
 * ⚠ 代码只做「提到了没有」，正文怎么用交给模型；条数与长度在清洗那一步封顶。
 */
function pickWorldNotes(
  world: readonly AssistantPromptWorldEntry[],
  request: AssistantOperatorRequest,
): AssistantPromptWorldEntry[] {
  if (world.length === 0) return []
  const recent = request.messages
    .slice(-PERSONA_LIMITS.worldScanMessages)
    .map((message) => message.content)
    .join('\n')
    .toLowerCase()
  return world.filter(
    (entry) =>
      entry.constant ||
      entry.keys.some((key) => recent.includes(key.toLowerCase())),
  )
}

/**
 * 用户这一轮点过的那几下 → 「决定」栏的原话（§7.5 ①「问」组）。
 *
 * ⚠ 题面与选项文案由**客户端自带**（`describePlanAnswers`，2026-09-12 起）：
 * 问题卡是上一条流吐的，服务端零会话态，合成 id 在这里反查不回去。客户端没带
 * （老客户端）才退回 id —— 那时这一行只负责**不丢事实**。
 */
function seedLedgerDecisions(request: AssistantOperatorRequest): string[] {
  const lines: string[] = []
  /**
   * ⚠ 覆盖三选那一支**只记一次**：它同时以 `confirmations`（下面那段）和一条
   * 对话消息（`overwrite:<field>` 那个合成 id）到达，两条说的是同一次选择。
   */
  const coveredByConfirmations = new Set(
    (request.confirmations ?? []).map((entry) =>
      overwriteAnswerId(entry.field),
    ),
  )
  for (const answer of collectRoundAnswers(request)) {
    if (coveredByConfirmations.has(answer.questionId)) continue
    const said = describeOneAnswer(answer)
    // ⚠ 一道没答的题不是一条「决定」—— ⛔ 别把「(no answer)」记成结论。
    if (said.endsWith(NO_PLAN_ANSWER)) continue
    pushLedgerLine(lines, `问题卡 ${said.replace(/^- /, '')}`)
  }
  for (const confirmation of request.confirmations ?? []) {
    pushLedgerLine(
      lines,
      `覆盖确认 ${confirmation.field}：${confirmation.choice}`,
    )
  }
  return lines
}

/**
 * 开跑那一刻手上已经有的几件（§7.6）。
 *
 * ⚠ 来源只有 `mentionedAssets` —— 用户这一轮 `@` / 📎 递上来的那几张（同一条 chip
 * 管线）。出图后不自检（D12），所以没有「助手自己备的那一枪」这条来源。
 * ⛔ 这里**不去查库**补更多东西：这一段是「他刚递给你什么」，不是一次检索。
 */
function initialMemoryArtifacts(
  request: AssistantOperatorRequest,
): AssistantOperatorWorkingMemoryArtifact[] {
  return attachmentArtifacts(request.mentionedAssets ?? []).slice(
    0,
    MEMORY_LIMITS.maxArtifacts,
  )
}

/**
 * 一步跑完之后，把它产出的东西加进准入索引（§7.6）。
 *
 * ⚠ 只认**已经有结论**的那一帧（`collectStepArtifacts` 自己判 `done`）：
 * `running` 那一帧还没有 `result`，从它身上取只会得到一份空索引。
 * ⚠ 封顶之后**不再加**（⛔ 不挤掉旧的）：先见到的那几件是这一轮的来路，
 * 而截头会让助手记不住这一轮是从什么开始的（与客户端那份判据逐字同源）。
 */
export function rememberStepArtifacts(
  run: OperatorRun,
  rawStep: unknown,
): void {
  const parsed = AssistantOperatorStepSchema.safeParse(rawStep)
  if (!parsed.success) return
  for (const artifact of collectStepArtifacts(parsed.data)) {
    if (run.workingMemoryIndex.size >= MEMORY_LIMITS.maxArtifacts * 2) return
    run.workingMemoryIndex.set(artifact.id, artifact)
    if (artifact.url) run.workingMemoryIndex.set(artifact.url, artifact)
  }
}

/**
 * 工具环外面套一层**时间预算**（`ASSISTANT_OPERATOR_TIME_BUDGET`，2026-10-07 画布两天 7 次被
 * Vercel 300 秒杀掉）。
 *
 * ⭐ 硬线是一个并进 signal 的定时 abort：工具环对它的反应与对 ⏹ 一模一样（停在原地、
 * 吐 `stopped: aborted`），这一层把那一帧换成 `time_budget`，并把被掐掉的那一步收成
 * `timeBudget` —— 不然时间线上会留一行永远在转的 `running`。
 * ⚠ 这一次请求**一步都没跑完**就到了硬线时抛超时错：接着跑只会在同一步上再超时一次，
 *   而画布的自动接力按「跑完几步」计数，一步不前进它就会无限接下去。
 */
export async function* runWithOperatorTimeBudget(
  options: AssistantOperatorRunOptions,
  turn: (options: OperatorTurnOptions) => AsyncIterable<AssistantOperatorEvent>,
): AsyncIterable<AssistantOperatorEvent> {
  const budget = options.timeBudget ?? ASSISTANT_OPERATOR_TIME_BUDGET
  const now = options.now ?? Date.now
  const startedAt = now()
  const hardStop = new AbortController()
  const timer = setTimeout(() => hardStop.abort(), budget.hardMs)
  const signal = options.signal
    ? AbortSignal.any([options.signal, hardStop.signal])
    : hardStop.signal
  const timedOut = () => hardStop.signal.aborted && !options.signal?.aborted
  let running: AssistantOperatorStep | null = null
  let concluded = 0
  let terminal = false
  try {
    for await (const event of turn({
      signal,
      pastSoftBudget: () => now() - startedAt >= budget.softMs,
    })) {
      if (
        event.type === ASSISTANT_OPERATOR_EVENTS.stopped &&
        event.reason === ASSISTANT_OPERATOR_STOP_REASONS.aborted &&
        timedOut()
      ) {
        break
      }
      if (event.type === ASSISTANT_OPERATOR_EVENTS.step) {
        if (event.step.status === STATUS.running) {
          running = event.step
        } else {
          concluded += 1
          if (running?.id === event.step.id) running = null
        }
      }
      if (
        event.type === ASSISTANT_OPERATOR_EVENTS.done ||
        event.type === ASSISTANT_OPERATOR_EVENTS.stopped ||
        event.type === ASSISTANT_OPERATOR_EVENTS.error
      ) {
        terminal = true
      }
      yield event
    }
  } catch (error) {
    if (!timedOut()) throw error
  } finally {
    clearTimeout(timer)
  }
  if (terminal || !timedOut()) return
  if (concluded === 0) {
    // 是**我们**的时限到了，不是厂商超时（owner 11-05）：单独的码 → 「等了将近 13 分钟没给出结果」。
    throw new ApiRequestError(
      ASSISTANT_OPERATOR_TIME_BUDGET_ERROR_CODE,
      504,
      'errors.assistant.timeBudgetExhausted',
      `One assistant step ran past ${budget.hardMs}ms without finishing (our time budget, not a provider timeout).`,
    )
  }
  if (running) {
    yield toStepEvent({
      id: running.id,
      tool: running.tool,
      verb: running.verb,
      title: running.title,
      status: STATUS.error,
      error: { reason: REJECT.timeBudget },
    })
  }
  yield {
    type: ASSISTANT_OPERATOR_EVENTS.stopped,
    reason: ASSISTANT_OPERATOR_STOP_REASONS.timeBudget,
  }
}

/**
 * 开跑前的准备：工作区鉴权、人设与规则、记忆、路由与工作副本。
 * ⚠ 新内核（v3）与旧循环共用这一份，⛔ 别在两处各抄一遍：抄了就是两套鉴权。
 */
/**
 * 上几轮的结论记录（§7.6）：开跑前读一次。⚠ 没有 `conversationId`（这条线程还没落过库 /
 * 老客户端）时就是空的 —— 那一轮照常跑，只是没有跨轮记忆可注入。
 */
function loadPriorRounds(
  clerkId: string,
  userId: string,
  request: AssistantOperatorRequest,
): Promise<readonly AssistantConversationRoundStored[]> {
  return optionalContext('priorRounds', clerkId, [], () =>
    request.conversationId
      ? listAssistantConversationRounds(userId, request.conversationId, {
          limit: ROUND_LIMITS.maxRoundsInPrompt,
          workspaceKey: request.workspaceKey,
        })
      : Promise.resolve([]),
  )
}

export interface PrepareOperatorTurnOptions {
  /**
   * ⛔ 不读上几轮的结论记录（v3，P2）：v3 的提示不注入它，读它的 `referenceCreatorContext`
   * 在 `skipReferenceReview` 下不走 —— 读了没人用。
   */
  readonly skipPriorRounds?: boolean
  /**
   * 首页带着一份小配方（第 9g 步）：会话在首页（`workspaceKey` = home），这一轮照图片台跑
   * （`request.domain` = image）。工作区与域的对照按首页核。
   */
  readonly homeDraft?: boolean
  /**
   * 这一轮用哪个文本模型，压过 persona 里那份：只给服务端自己的调用方（配音间底部那颗写词模型，
   * 用户 10-25 换新内核后照留），⛔ 不从请求体收（理由见下面 `resolveAssistantRoute` 那段头注）。
   */
  readonly routeModel?: AssistantRouteModel
}

export async function prepareOperatorTurn(
  clerkId: string,
  initialRequest: AssistantOperatorRequest,
  signal: AbortSignal,
  options: PrepareOperatorTurnOptions = {},
) {
  let request = initialRequest
  const user = await ensureUser(clerkId)
  const workspace = assistantWorkspaceFromKey(request.workspaceKey)
  if (
    !workspace ||
    assistantWorkspaceDomain(workspace.workspace) !==
      (options.homeDraft ? ASSISTANT_PROTOCOL_DOMAIN_IDS.home : request.domain)
  ) {
    throw new ApiRequestError(
      'ASSISTANT_WORKSPACE_INVALID',
      400,
      'errors.assistantConversation.notFound',
      'Assistant workspace does not match its domain',
    )
  }
  // ⭐ 和下面那批只读查询一起等（10-27 实测串着多等一次往返）；不通过照旧整轮抛。
  const workspaceAccess = request.conversationId
    ? assertAssistantConversationWorkspaceAccess(
        user.id,
        request.conversationId,
        request.workspaceKey,
      )
    : assertAssistantWorkspaceAccess(user.id, request.workspaceKey)
  if (
    workspace.workspace === 'image-natural' ||
    workspace.workspace === 'image-tags'
  ) {
    const dialect = workspace.workspace === 'image-tags' ? 'tags' : 'natural'
    request = {
      ...request,
      snapshot: {
        ...request.snapshot,
        availableModels: request.snapshot.availableModels.filter(
          (model) =>
            getPromptDialect(
              resolveAdapterType(model.catalogId ?? model.id) ?? undefined,
            ) === dialect,
        ),
      },
    }
  }

  /**
   * persona 与规则**在开跑前一次性读出来**（§8.5 / §10）。
   *
   * ⚠ 不在每一步重读：系统提示每一步都要重发，但它每一步都是同一份 —— 重读只是
   * 给每一步多加一次库查询。⚠ 也不从客户端收：这两样直连系统提示。
   * ⭐ 它排在路由解析**之前**（v2 §4.5）：文本模型选哪一档现在住在
   * `persona.routeModel`，路由要等它读回来才知道该找哪把 key。
   *
   * ⚠ **这几件全部是可选增强**（owner 2026-09-20 真机第 1 条，见 `optionalContext`
   * 头注）：少了其中任何一件，这一轮仍然答得出话 —— 少的只是「助手记得的那几行」。
   * 任何一件把整轮炸掉，用户看到的都是一句没有原因的「出错了」。
   * ⛔ 记忆与创作偏好不在这里读（11-10）：新内核自己读记忆（`nextMemories`），这里读了也没人用。
   */
  const [persona, rules, sourceRules, priorRounds] = await Promise.all([
    optionalContext(
      'persona',
      clerkId,
      { ...ASSISTANT_PERSONA_DEFAULTS },
      /**
       * 角色经历超长时换成存好的总结（第一次用便宜档算一次存到卡上，经历改了才
       * 重算；失败照旧截断）—— owner 2026-10-15。
       */
      async () =>
        withChatTurn(
          await withSummarizedBackstory(
            user.id,
            await getAssistantPersonaByUserId(user.id, request.chatCharacterId),
          ),
          request,
        ),
    ),
    /**
     * ⭐ **你写的那几条**（助手设置 B：规矩并进记忆，你写的优先）—— 进规则段、
     * 带 id 可引用，⛔ 不占助手记的那份预算。
     */
    optionalContext('creatorMemories', clerkId, [], async () =>
      (
        await listCreatorMemoriesForPrompt(
          user.id,
          memoryScopeForDomain(request.domain),
          RULE_LIMITS.maxInPrompt,
          workspace.projectId ?? null,
          /**
           * 和角色聊天：只读你写的全局规矩（服务里按卡收）。⚠ 人设与它并行读，这里先信请求里的
           * 会话角色 —— 只读这个用户自己的行，卡不对也只是少读几条域规矩。
           */
          request.chatCharacterId ?? null,
        )
      ).map(memoryAsRule),
    ),
    /**
     * ⭐ **来源白 / 黑名单单独读一次**（v2 §9.3）。
     *
     * ⚠ ⛔ 不并进上面那条：那一条按 `maxInPrompt` 截最近 12 条，而名单一条都不
     * 能少 —— 被截掉的那一条在用户眼里仍然是「我设过的闸」，静默失效的表现是
     * 助手照常去打那个站，而用户永远不会知道。
     */
    optionalContext('projectSourceRules', clerkId, [], () =>
      listProjectSourceRules(user.id, { scope: request.domain }),
    ),
    /**
     * ⭐ **之前几轮记住的事**（§7.6）—— 与 persona / 规则 / 卡同一档：开跑前读
     * 一次，⛔ 不在每一步重读（系统提示每一步都重发，但它每一步都是同一份）。
     */
    options.skipPriorRounds
      ? Promise.resolve([])
      : loadPriorRounds(clerkId, user.id, request),
    workspaceAccess,
  ])
  // 常挂上下文卡不再注入：owner 2026-09-25「上下文卡整体去掉」，入口早已删除。
  const contextCards: ContextCard[] = []

  /**
   * ⭐ **这一轮用哪个脑子，唯一真值是 persona**（v2 §4.5，commit #8）。
   *
   * ⛔ 请求体里那两个临时字段（`apiKeyId` / `llmModelId`）已经删掉：模型偏好是
   * 用户级的一份设置，让客户端每轮上送等于给同一件事开两个真值口 ——
   * 「界面显示 A、实际打 B」那类事故（2026-08-19）正是这么来的。
   *
   * ⛔ 选中的厂商**没绑 key** 时整轮不跑（`resolveAssistantRoute` 抛
   * `AssistantModelKeyMissingError`，owner 2026-10-15）—— ⛔ 回落到自动那条优先级、拿别家的
   * key 顶上。选择照旧留在库里，前端就地配 key，配上就生效。
   */
  /**
   * ⭐ 一家、一把 key、一个型号（owner 2026-10-15「全跟助手」）：选定的模型就是它，「自动」
   * 按 `ASSISTANT_PROVIDER_ORDER` 取第一家配了 key 的默认档（chip 上写同一个）。这一轮
   * 往后的每一次调用 —— 主步、查证改写、看图、归纳、结账 —— 都用这一份。「自动」下纯问答轮
   * 换同一家的快档（OpenAI Sol → Luna）省 token，⛔ 不换家。
   */
  const questionTurn = isAssistantQuestionTurn(latestUserMessage(request))
  const { route, apiKeyId, modelId } = await resolveAssistantRoute(user.id, {
    routeModel: options.routeModel ?? persona.routeModel,
    questionTurn,
  })
  const mediaAttachments = request.mediaAttachments ?? []
  assertAssistantMediaRoute(mediaAttachments, route.adapterType)
  const videoData = mediaAttachments
    .filter((item) => item.kind === 'video')
    .map((item) => item.url)
  const audioData = mediaAttachments
    .filter((item) => item.kind === 'audio')
    .map((item) => item.url)

  const run: OperatorRun = {
    signal,
    userId: user.id,
    priorRounds,
    referenceAnalysis: null,
    inspectedCanvasReferences: null,
    canvasBrief: null,
    referencePromptWritten: false,
    skipReferenceReview: false,
    tagCheckRetried: false,
    negativeFolded: false,
    request,
    persona,
    /**
     * 进了系统提示的那几条一开始就在索引里 —— 引用它们不必先调一次工具。
     * 来源名单也放进来：`add_project_rule` 查重靠它（它们的 id 不进提示，模型引不到）。
     */
    ruleIndex: new Map(
      [...rules, ...sourceRules].map((rule) => [rule.id, rule]),
    ),
    /**
     * ⭐ **名单在开跑前就并好**（§9.3）：库里那份 + 这一轮临时指的那几个。
     * ⛔ 临时那份不写库 —— 用户为一个问题临时指了几个源，不该变成他此后每一轮
     * 的规矩。
     */
    sourceRules: buildSourceRuleFilter(sourceRules),
    // 进了系统提示的那几张卡一开始就在索引里 —— 引用它们不必先调一次工具。
    contextCardIndex: new Map(contextCards.map((card) => [card.id, card])),
    state: toWorkingState(request.snapshot),
    route,
    apiKeyId,
    modelId,
    webImageIndex: new Map(),
    webImageVision: new Map(),
    evidenceCiteSeq: 1,
    webFindSeq: 1,
    researchSnippets: new Map(),
    researchRounds: 0,
    evidenceRefs: [],
    searchIndex: new Map(),
    folderIndex: new Map(),
    loraIndex: new Map(),
    loraSearchQuery: null,
    observations: [],
    assistantWrittenFields: new Set(),
    executedStepKeys: new Set(),
    stepSeq: 0,
    /**
     * 跨轮记忆的准入索引（切片 X）—— **id 与地址两样都进表**：模型指认时用的是
     * 名字（→ 服务端按 id 找），而 `import_user_url` 认的是地址。
     * ⚠ 只收最近 `maxRounds` 轮，与系统提示里印出来的那几行**同一份数据** ——
     * 印出来的与认得的不是同一批，是「它说了个名字却被拒」的成因。
     */
    workingMemoryIndex: new Map(
      initialMemoryArtifacts(request).flatMap((artifact) => [
        [artifact.id, artifact] as const,
        ...(artifact.url ? [[artifact.url, artifact] as const] : []),
      ]),
    ),
    evidenceRecalls: 0,
    /**
     * ⭐ 「决定」栏**开局就装着用户刚点的那几下**（§7.5 ②）。
     *
     * ⚠ spec 把它写成「补写进上一条记录」，实现落在这里是因为**一轮只在 `done`
     * 那一刻结账**：问题卡出现之后这条流是以 `stopped` 结束的，上一条记录压根
     * 还没写出来 —— 用户点的那一下与它回答的那道题本来就属于同一轮。所以这里
     * 不需要「回头补写」那条路径，也就不该长出一条。
     */
    roundLedger: {
      facts: [],
      decisions: seedLedgerDecisions(request),
      todos: [],
      evidence: [],
    },
    ledgerSteps: 0,
    roundClosed: false,
  }

  return {
    request,
    user,
    persona,
    rules,
    route,
    questionTurn,
    modelId,
    videoData,
    audioData,
    run,
    /** 开跑前没读上几轮的结论记录（`skipPriorRounds`）—— 交给旧内核时要补读。 */
    priorRoundsSkipped: options.skipPriorRounds === true,
  }
}

export type PreparedOperatorTurn = Awaited<
  ReturnType<typeof prepareOperatorTurn>
>

/**
 * 模型写的反问题 → 出帧用的那份（§9 校验纪律，2026-09-06 由 `pending` 改写）。
 *
 * 五条纪律，逐条对应一种模型常犯的错：
 *  ① **`visual` 不在词表就剥掉**并 `logger.warn` —— ⛔ 不作废整张卡，也 ⛔ 不猜一个
 *     近似图标。前端于是退化成纯文字，那是词表外唯一诚实的画法。
 *  ② **`assetUrl` 必须是 http(s)**：模型很爱写 `"the second reference"` 这种描述，
 *     那东西喂给 `<Image>` 就是一个碎图标。
 *  ③ **没有 `description` 的选项整条丢掉**：一个只有名字的选项正是这轮要消灭的
 *     形状 —— 用户看着两颗 chip 答不上来它俩差在哪。
 *  ④ **推荐项排第一，且一题最多一个**：多给的那些剥掉 `recommended`。用户多数
 *     时候要的是「你觉得呢」，把推荐藏在第三个等于没推荐。
 *  ⑤ **少于两个选项的题整道丢掉**：一个选项的「单选」不是问题，是通知，
 *     而通知已经有 `message` 那条路了。
 * ⚠ id 一律由服务端补：模型给的 id 会在重规划之间漂，而客户端的 `planAnswers`
 *   要按 id 认回来。
 * ⚠ `allowOther` 缺省 **true**（协议默认）：留一句「都不是」的出口是常态，
 *   关掉它要模型明写。
 */
export function normalizePlanQuestions(
  turn: Pick<AssistantOperatorTurn, 'questions'>,
  clerkId: string,
): AssistantOperatorPlanQuestion[] {
  const out: AssistantOperatorPlanQuestion[] = []
  for (const [index, item] of (turn.questions ?? []).entries()) {
    const options: AssistantOperatorPlanQuestion['options'] = []
    let recommendedTaken = false
    for (const [optionIndex, option] of item.options.entries()) {
      // ③ 说明是这张卡的全部要点 —— 没有它这个选项不值得出现。
      const description = option.description?.trim()
      if (!description) continue

      const visual = getAssistantPlanVisual(option.visual ?? undefined)
      if (option.visual && !visual) {
        logger.warn('assistant operator used an unknown plan visual', {
          userId: clerkId,
          visual: option.visual,
        })
      }
      const assetUrl = /^https?:\/\//.test(option.assetUrl ?? '')
        ? (option.assetUrl ?? undefined)
        : undefined
      // ④ 一题只留第一个推荐项。
      const recommended = option.recommended === true && !recommendedTaken
      if (recommended) recommendedTaken = true
      options.push({
        id: option.id?.trim() || `option-${index + 1}-${optionIndex + 1}`,
        label: clamp(option.label, PLAN_LIMITS.maxOptionLabelChars),
        description: clamp(description, PLAN_LIMITS.maxOptionDescriptionChars),
        ...(recommended ? { recommended: true } : {}),
        ...(visual ? { visual: visual.id } : {}),
        ...(assetUrl ? { assetUrl } : {}),
      })
    }
    if (options.length < PLAN_LIMITS.minOptions) continue

    // ④ 推荐项排第一 —— ⛔ 不是「模型写在哪就在哪」。
    options.sort(
      (a, b) => Number(b.recommended ?? false) - Number(a.recommended ?? false),
    )

    const question = clamp(item.question, PLAN_LIMITS.maxQuestionChars)
    out.push({
      id: item.id?.trim() || `question-${index + 1}`,
      // header 漏了就从问句头上截 —— ⛔ 不留空，收起态那一行要写得出东西。
      header: clamp(
        item.header?.trim() || question,
        PLAN_LIMITS.maxHeaderChars,
      ),
      question,
      multiSelect: item.multiSelect === true,
      allowOther: item.allowOther !== false,
      options: options.slice(0, PLAN_LIMITS.maxOptions),
    })
  }
  return out.slice(0, PLAN_LIMITS.maxQuestions)
}

/**
 * ⭐ 出流之前**用契约自己校验一遍**。
 *
 * 不是防御性编程：改动型 step 少一个 `inverse` 时，这里当场抛，而不是把一条撤不掉
 * 的 step 发给客户端 —— 后者的表现是「点了撤销没反应」，一种最难查的失败。
 * 服务端与客户端因此共用同一份判据。
 */
export function toStepEvent(raw: unknown): AssistantOperatorEvent {
  return {
    type: ASSISTANT_OPERATOR_EVENTS.step,
    step: AssistantOperatorStepSchema.parse(raw),
  }
}
