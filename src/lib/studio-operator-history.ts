/**
 * 线程 ↔ 可读历史的**纯函数层**（P4-B）。
 *
 * 三个方向，一个都不许多带东西：
 *  ① `toOperatorHistory`      线程条目 → 可读痕迹（**丢掉一切可操作态**）
 *  ② `toStoredOperatorMessages` / `fromStoredOperatorMessages`  痕迹 ↔ 库里的 messages
 *  ③ `historyToOperatorMessages` / `historyToPriorSteps`  痕迹 → 下一轮请求的语境
 *
 * ⭐ ① 的出口类型（`StudioOperatorHistoryEntry`）在结构上装不下 `inverse` /
 * `payload` / `primed`，所以「可操作态不复活」不是这里的自觉，是编译器的结论。
 * 详见 `types/studio-operator-history.ts` 的头注。
 *
 * ⚠ 写成纯函数而不是 hook 里的内联逻辑：这一层的每一条断言（零 base64、零
 * inverse、`running` 不落库、撤销痕迹留而按钮不留）都要能在单测里逐条钉住。
 */

import {
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOLS,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  type AssistantOperatorDomain,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_HISTORY } from '@/constants/studio-assistant-operator'
import {
  ASSISTANT_CONVERSATION_LIMITS,
  type AssistantConversationMessageStored,
} from '@/types/assistant-conversation'
import type {
  AssistantOperatorMessage,
  AssistantOperatorPriorStep,
  AssistantOperatorStep,
} from '@/types/assistant-operator'
import type { StudioOperatorThreadEntry } from '@/types/studio-assistant-operator'
import {
  StudioOperatorHistoryEntrySchema,
  type StudioOperatorHistoryEntry,
} from '@/types/studio-operator-history'

/**
 * 一条日志展开后的那行详情（查询词 / 命中数 / 写进去的值……）。
 *
 * ⚠ **日志条与历史序列化共用这一份**：抄成两份的下场是刷新前后同一步的详情
 * 不一样，而那种不一致没有任何人会去查。
 */
export function describeOperatorStepDetail(
  step: AssistantOperatorStep,
): string | null {
  if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) return null
  switch (step.tool) {
    case ASSISTANT_OPERATOR_TOOL_IDS.readState:
      return step.result?.digest ?? null
    case ASSISTANT_OPERATOR_TOOL_IDS.searchAssets: {
      const hits = step.result?.totalFound
      const listed = step.result?.assets.length ?? 0
      return [
        `"${step.payload.query}"`,
        hits === null || hits === undefined ? null : `· ${hits}`,
        `· ${listed}`,
      ]
        .filter(Boolean)
        .join(' ')
    }
    case ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders: {
      const folders = step.result?.folders ?? []
      return [`"${step.payload.query}"`, `· ${folders.length}`]
        .concat(
          folders.length > 0
            ? [`· ${folders.map((folder) => folder.path).join(', ')}`]
            : [],
        )
        .join(' ')
    }
    case ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder:
      return [
        step.result?.folder.path,
        `· ${step.result?.inspectedImages ?? 0}/${step.result?.totalImages ?? 0}`,
        `· ${step.result?.batchCount ?? 0} batch(es)`,
        step.result?.truncated ? '· partial' : '· complete',
      ]
        .filter(Boolean)
        .join(' ')
    case ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages: {
      // 详情里列**域名**：候选格子上只有图，看不出来自哪儿，而「这是从哪个站
      // 拿的」正是用户决定要不要收下它的依据。
      const domains = [
        ...new Set(
          (step.result?.images ?? []).map((image) => image.domain ?? 'web'),
        ),
      ]
      return [`"${step.payload.query}"`, `· ${step.result?.totalFound ?? 0}`]
        .concat(domains.length > 0 ? [`· ${domains.join(', ')}`] : [])
        .join(' ')
    }
    case ASSISTANT_OPERATOR_TOOL_IDS.setPrompt:
    case ASSISTANT_OPERATOR_TOOL_IDS.setNegative:
      return `${step.payload.mode} · ${step.payload.value}`
    case ASSISTANT_OPERATOR_TOOL_IDS.setModel:
      return step.payload.modelLabel ?? step.payload.modelId
    case ASSISTANT_OPERATOR_TOOL_IDS.setSpecs:
      return `${step.payload.aspectRatio} · ${step.payload.resolution}`
    /**
     * ⚠ 三格里**只印有值的那些**：`null` 的那格是「这个模型不吃这个参数」，
     * 印成 `null · 16:9 · null` 只会让人以为助手把它清掉了。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs:
      return (
        [
          step.payload.durationSeconds === null
            ? null
            : `${step.payload.durationSeconds}s`,
          step.payload.aspectRatio,
          step.payload.resolution,
        ]
          .filter(Boolean)
          .join(' · ') || null
      )
    case ASSISTANT_OPERATOR_TOOL_IDS.setCount:
      return String(step.payload.count)
    case ASSISTANT_OPERATOR_TOOL_IDS.mountReference:
      return step.payload.label ?? step.payload.assetId
    /** 归属写出来 —— `@AudioN` 那个 N 对不上谁，多角色对白就是一锅粥。 */
    case ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference:
      return [
        step.payload.label ?? step.payload.assetId,
        step.payload.ownerName,
      ]
        .filter(Boolean)
        .join(' · ')
    case ASSISTANT_OPERATOR_TOOL_IDS.setSound:
      return step.payload.enabled ? 'on' : 'off'
    case ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate:
      return null
    /**
     * ⚠ 看图那一条的详情就是评价本身，而评价长在**评价卡**上（拍板 6）——
     * 日志条只会拿到被拒的那一支，那一支根本走不到这里。
     * 这里返回 `null` 而不是攒一段摘要：攒了就是同一份内容的第二个说法。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult:
      return null
    /** 详情写**源地址**：那是用户自己粘的那一串，他一眼认得出接的是不是这条。 */
    case ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl:
      return step.payload.url
    /**
     * 找 LoRA（P4-C）。
     *
     * ⭐ 详情里印**每个源各回了几条**，而不是只印一个总数：两个上游里有一个挂了、
     * 还是两个都好好的但没命中，是两句不同的话（「空不是挂」）。总数掩盖掉的正是
     * 用户最该知道的那一半 —— 拍板 18 的「候选与放弃理由」在这一档就长这样。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.searchLoras: {
      const sources = (step.result?.sources ?? []).map(
        (source) => `${source.source} ${source.status}(${source.count})`,
      )
      return [`"${step.payload.query}"`, `· ${step.result?.totalFound ?? 0}`]
        .concat(sources.length > 0 ? [`· ${sources.join(', ')}`] : [])
        .join(' ')
    }
    /**
     * ⚠ 挂载详情把**权重与兼容性一起印出来**：一把装不上的 LoRA 挂上去之后，
     * 界面上只有一行橙字，而日志是用户回头复盘时唯一读得到「当时它就说过」的地方。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.mountLora:
      return [
        step.payload.name,
        `· ${step.payload.weight}`,
        step.payload.compatible
          ? null
          : `· ${step.payload.family ?? 'unknown base'} ✗`,
      ]
        .filter(Boolean)
        .join(' ')
    case ASSISTANT_OPERATOR_TOOL_IDS.unmountLora:
      return step.payload.name
    case ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight:
      return `${step.payload.name} · ${step.payload.weight}`
  }
}

/**
 * 这条地址进得了库吗 —— **只有 http(s)**。
 *
 * ⛔ `data:` 与 `blob:` 一律挡掉：前者是 base64 本体（schema 注释明令 messages
 * 里不许有），后者是本地对象地址，存进去下次加载必然是死链。
 * ⚠ 这里挡一道、`types/studio-operator-history.ts` 的 schema 再挡一道 ——
 * 不是重复：这里挡是为了让那张图**安静地不进历史**，schema 挡是为了让写错的
 * 载荷**吵闹地失败**。
 */
function isPersistableUrl(url: string | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max)
}

/**
 * 一条线程条目 → 一条可读痕迹。返回 `null` = 这一条不进历史。
 *
 * 不进历史的两类：
 *  · **`running` 的日志**：没跑完的那一帧不是历史，是当时的一个瞬间。
 *  · **空正文**：空气泡在历史里只是一行留白。
 */
export function toOperatorHistoryEntry(
  entry: StudioOperatorThreadEntry,
): StudioOperatorHistoryEntry | null {
  switch (entry.kind) {
    case 'user': {
      const text = entry.text.trim()
      if (!text) return null
      return {
        kind: 'user',
        id: entry.id,
        text: truncate(text, LIMITS.maxMessageChars),
        // ⚠ 只留还取得到的那些：本地 `blob:` 预览进不了历史（见 `isPersistableUrl`）。
        attachments: entry.attachments
          .filter((attachment) => isPersistableUrl(attachment.url))
          .slice(0, LIMITS.maxSnapshotReferences)
          .map((attachment) => ({
            id: attachment.id,
            label: truncate(attachment.label, LIMITS.maxLabelChars),
            kind: attachment.kind,
            url: attachment.url,
            ...(isPersistableUrl(attachment.thumbnailUrl)
              ? { thumbnailUrl: attachment.thumbnailUrl }
              : {}),
          })),
      }
    }
    case 'message': {
      const text = entry.text.trim()
      if (!text) return null
      return {
        kind: 'message',
        id: entry.id,
        text: truncate(text, LIMITS.maxMessageChars),
      }
    }
    case 'plan': {
      const steps = entry.steps
        .map((step) => step.trim())
        .filter(Boolean)
        .slice(0, LIMITS.maxPlanItems)
        .map((step) => truncate(step, LIMITS.maxPlanItemChars))
      if (steps.length === 0) return null
      return { kind: 'plan', id: entry.id, steps }
    }
    case 'step':
      return toOperatorHistoryStep(entry.id, entry.step, entry.undone)
    case 'system':
      return {
        kind: 'system',
        id: entry.id,
        code: entry.code,
        ...(entry.subject
          ? { subject: truncate(entry.subject, LIMITS.maxTitleChars) }
          : {}),
        ...(typeof entry.count === 'number' && entry.count >= 0
          ? { count: entry.count }
          : {}),
      }
    /**
     * ⚠ 线程里的 `domain` 是**自由字符串**（视图模型那边没收窄），而历史 schema
     * 是 enum。不认识的域整条丢掉 —— 存进去也只会在读回来时被 zod 判非法，
     * 区别只是丢在哪一头。
     */
    case 'domainMark':
      if (!isOperatorDomain(entry.domain)) return null
      return { kind: 'domainMark', id: entry.id, domain: entry.domain }
  }
}

function isOperatorDomain(value: string): value is AssistantOperatorDomain {
  return (ASSISTANT_OPERATOR_DOMAINS as readonly string[]).includes(value)
}

const ASSISTANT_OPERATOR_TOOL_SET: ReadonlySet<string> = new Set(
  ASSISTANT_OPERATOR_TOOLS,
)

/**
 * 日志条 → 只读痕迹。
 *
 * ⛔ **这个函数是「不复活」那条约束的落点**：它读 `step.payload` / `step.inverse`
 * 只为了攒一行给人看的字，返回值里一个字节的载荷都没有。
 */
function toOperatorHistoryStep(
  id: string,
  step: AssistantOperatorStep,
  undone: boolean,
): StudioOperatorHistoryEntry | null {
  // `running` 不落库 —— 见 `toOperatorHistoryEntry` 头注。
  if (step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.running) return null

  const base = {
    kind: 'step' as const,
    id,
    tool: step.tool,
    title: truncate(step.title, LIMITS.maxTitleChars),
    ...(step.reason
      ? { reason: truncate(step.reason, LIMITS.maxReasonChars) }
      : {}),
    undone,
  }

  if (step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error) {
    return {
      ...base,
      status: 'error',
      rejectReason: step.error.reason,
      ...(step.error.detail
        ? { detail: truncate(step.error.detail, LIMITS.maxReasonChars) }
        : {}),
    }
  }

  /**
   * 评价卡的「文字与图 URL」（拍板 6）—— ⛔ 没有 `runKey`，所以历史里那张卡
   * 画不出「还原这轮」：那颗钮撤的是内存里的登记簿，刷新之后它不存在。
   */
  const critique =
    step.tool === ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult &&
    step.result &&
    isPersistableUrl(step.payload.imageUrl)
      ? {
          imageUrl: step.payload.imageUrl,
          ...(isPersistableUrl(step.payload.thumbnailUrl)
            ? { thumbnailUrl: step.payload.thumbnailUrl }
            : {}),
          ...(step.payload.modelLabel
            ? { modelLabel: step.payload.modelLabel }
            : {}),
          findings: step.result.findings
            .slice(0, LIMITS.maxCritiqueFindings)
            .map((finding) => ({
              ok: finding.ok,
              text: truncate(finding.text, LIMITS.maxCritiqueFindingChars),
            })),
          ...(step.result.advice
            ? {
                advice: truncate(
                  step.result.advice,
                  LIMITS.maxCritiqueAdviceChars,
                ),
              }
            : {}),
        }
      : null

  const detail = describeOperatorStepDetail(step)

  return {
    ...base,
    status: 'done',
    ...(detail ? { detail: truncate(detail, LIMITS.maxPromptChars) } : {}),
    ...(critique ? { critique } : {}),
  }
}

export function toOperatorHistory(
  entries: readonly StudioOperatorThreadEntry[],
): StudioOperatorHistoryEntry[] {
  const history: StudioOperatorHistoryEntry[] = []
  for (const entry of entries) {
    const converted = toOperatorHistoryEntry(entry)
    if (converted) history.push(converted)
  }
  return history
}

/**
 * 痕迹 → 库里的 messages。
 *
 * ⚠ `content` 是**给不认识操作员协议的读者看的那一份**（分享页 / 旧面板 /
 * 服务端搜索）：日志条写标题，域标记写一行方括号。真正的渲染读的是 `operator`。
 * 写成空串不行 —— schema 要求 `min(1)`，整条会被 `sanitizeMessages` 丢掉。
 */
export function toStoredOperatorMessages(
  history: readonly StudioOperatorHistoryEntry[],
): AssistantConversationMessageStored[] {
  return history
    .slice(-ASSISTANT_CONVERSATION_LIMITS.maxMessages)
    .map((entry) => ({
      id: truncate(entry.id, 160),
      role: entry.kind === 'user' ? ('user' as const) : ('assistant' as const),
      content: truncate(
        operatorEntryPlainText(entry),
        ASSISTANT_CONVERSATION_LIMITS.maxContentLength,
      ),
      operator: entry,
    }))
}

function operatorEntryPlainText(entry: StudioOperatorHistoryEntry): string {
  switch (entry.kind) {
    case 'user':
    case 'message':
      return entry.text
    case 'plan':
      return entry.steps.join(' · ')
    case 'step':
      return entry.title
    case 'system':
      return `[${entry.code}${entry.subject ? `: ${entry.subject}` : ''}]`
    case 'domainMark':
      return `[domain: ${entry.domain}]`
  }
}

/**
 * 库里的 messages → 痕迹。
 *
 * ⚠ 没有 `operator` 那格的消息**整条跳过**：那是旧助手写的纯对白，把它渲染进
 * 操作员线程只会得到一段没有出处的白文本。（哪条会话属于谁由 `operatorThread`
 * 在列表那一层就分好了，这里是第二道。）
 */
export function fromStoredOperatorMessages(
  messages: readonly AssistantConversationMessageStored[],
): StudioOperatorHistoryEntry[] {
  const history: StudioOperatorHistoryEntry[] = []
  for (const message of messages) {
    if (!message.operator) continue
    const parsed = StudioOperatorHistoryEntrySchema.safeParse(message.operator)
    if (parsed.success) history.push(parsed.data)
  }
  return history
}

/**
 * 载回来的历史里，哪些进**下一轮请求的对白**。
 *
 * ⭐ 不带它的下场是「用户看得见自己三分钟前说的话，助手却完全失忆」—— 刷新之后
 * 第一句话就要重新自我介绍。旧助手线（`use-assistant-conversation`）也是把历史
 * 原样带回上下文的，这里保持一致。
 * ⚠ 只取最后 `replayMessages` 条：显示是全部（用户要读得到），进上下文的每一条
 * 都是账单。
 */
export function historyToOperatorMessages(
  history: readonly StudioOperatorHistoryEntry[],
): AssistantOperatorMessage[] {
  const messages: AssistantOperatorMessage[] = []
  for (const entry of history) {
    if (entry.kind === 'user') {
      const attachmentNote =
        entry.attachments.length > 0
          ? `\n[attached: ${entry.attachments
              .map((attachment) => `${attachment.kind} ${attachment.url}`)
              .join(', ')}]`
          : ''
      messages.push({ role: 'user', content: `${entry.text}${attachmentNote}` })
    } else if (entry.kind === 'message') {
      messages.push({ role: 'assistant', content: entry.text })
    }
  }
  return messages.slice(-STUDIO_OPERATOR_HISTORY.replayMessages)
}

/**
 * 载回来的历史里，哪些进**下一轮的 `priorSteps`**。
 *
 * ⚠ 与 `use-assistant-operator.ts` 的 `buildPriorSteps` 同一条语义：被撤销的那些
 * 照样带上去且标 `error`，否则助手下一轮会把用户撤掉的改动又做一遍。
 * ⚠ 工具名不在当前词表里的整条丢掉：请求 schema 那边是 enum，混进一个历史遗留
 * 的工具名会让**整个请求**在 400 上失败 —— 一条装饰性的历史不值这个。
 */
export function historyToPriorSteps(
  history: readonly StudioOperatorHistoryEntry[],
): AssistantOperatorPriorStep[] {
  const steps: AssistantOperatorPriorStep[] = []
  for (const entry of history) {
    if (entry.kind !== 'step') continue
    if (!ASSISTANT_OPERATOR_TOOL_SET.has(entry.tool)) continue
    const summary = entry.undone
      ? `The creator UNDID this — do not redo it. (${entry.title})`
      : entry.title
    steps.push({
      tool: entry.tool as AssistantOperatorTool,
      status: entry.undone
        ? ASSISTANT_OPERATOR_STEP_STATUS_IDS.error
        : entry.status,
      summary: truncate(summary, LIMITS.maxPriorStepSummaryChars),
    })
  }
  return steps
}
