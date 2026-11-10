import 'server-only'

import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import {
  PROJECT_RULE_KIND_IDS,
  type AssistantOperatorDomain,
  ASSISTANT_PROJECT_RULE_LIMITS as RULE_LIMITS,
} from '@/constants/assistant-operator'
import { listStandingRuleMemories } from '@/features/assistant/services/assistant-memory.service'
import { assistantWorkspaceFromKey } from '@/lib/assistant-workspace'
import type {
  ProjectRule,
  AssistantPromptPersona,
} from '@/types/assistant-persona'
import {
  ASSISTANT_MEMORY_SCOPE_IDS,
  type AssistantMemoryScopeId,
  ASSISTANT_MEMORY_SCOPES,
} from '@/constants/assistant-memory'
import type { AssistantMemory } from '@/types/assistant-memory'
import type {
  OperatorRun,
  ToolPlan,
} from '@/features/assistant/services/assistant-operator-run.service'

/**
 * 助手执行器里的 **项目规则与记忆归属**：记忆当规则读出来，以及这一轮的记忆读 / 写落在哪个域、哪个项目、哪个角色。
 * 11-10 从 `assistant-operator.service.ts` 原样搬出（M4），行为不变。
 * ⚠ 执行器的文件都叫 `assistant-operator-*.service.ts`：钱闸测试按这个前缀收源码。
 */

// ─── 项目规则（§10，拍板 23）────────────────────────────────────

/**
 * 记忆里的一条规矩 → 协议上的「一条规则」（助手设置 B：规矩并进记忆）。
 *
 * ⚠ 只是换个说法，⛔ 不是第二份存储：`rule_hit`、`read_project_rules` 的结果、
 * `add_project_rule` 的载荷认的都是这个形状，而那一行字只在记忆表里。
 * `global` = 全部工作台（协议上是 `null`）。
 */
export function memoryAsRule(memory: AssistantMemory): ProjectRule {
  return {
    id: memory.id,
    scope:
      memory.scope === ASSISTANT_MEMORY_SCOPE_IDS.global ? null : memory.scope,
    text: memory.text,
    kind: PROJECT_RULE_KIND_IDS.note,
    source: memory.source,
    createdAt: memory.createdAt,
  }
}

export function planReadProjectRules(
  run: OperatorRun,
  args: { scope?: AssistantOperatorDomain },
  userId: string,
): ToolPlan {
  const scope = args.scope ?? null

  return {
    kind: 'read',
    payload: { scope },
    run: async () => {
      /**
       * ⭐ 你写的 + 助手在对话里记下的规矩（记忆表里 `kind = rule` 的那些）。
       * ⚠ 来源名单**不在这里**：它们整份已经在系统提示的来源段里。
       */
      const rules = (
        await listStandingRuleMemories(userId, {
          scope: scope ? memoryScopeForDomain(scope) : null,
          projectId: requestProjectId(run.request),
          characterCardId: chatMemoryCardId(run.request, run.persona),
          limit: RULE_LIMITS.maxReadResults,
        })
      ).map(memoryAsRule)
      for (const rule of rules) run.ruleIndex.set(rule.id, rule)

      const observation =
        rules.length === 0
          ? // 空结果说出来 —— 静默的空结果会让模型接着编一条规则出来引用。
            'read_project_rules found NO standing rules for this creator. Do not invent one, and do not cite a rule id.'
          : `read_project_rules → ${rules.length} rule(s):\n${rules
              .map(
                (rule) =>
                  `  - id=${rule.id} · ${rule.scope ?? 'all workbenches'} · recorded ${rule.createdAt.slice(0, 10)} · "${rule.text}"`,
              )
              .join('\n')}`

      return { result: { rules }, observation }
    },
  }
}

// ─── 记忆归属 ──────────────────────────────────────────────────

/**
 * 当前域 → 记忆的域（56a）。
 *
 * ⚠ 前四档在 `ASSISTANT_MEMORY_SCOPE_IDS` 里就是**同一批字面量**（词表从协议域
 * 派生），所以这里只需要断言它认得 —— ⛔ 不另写一张 `Record<域, 记忆域>` 的映射
 * 表：两份词表一旦漂开，漏掉的那一档会静默落到 global 上。
 */
export function memoryScopeForDomain(
  domain: AssistantOperatorDomain,
): AssistantMemoryScopeId {
  return (ASSISTANT_MEMORY_SCOPES as readonly string[]).includes(domain)
    ? (domain as AssistantMemoryScopeId)
    : ASSISTANT_MEMORY_SCOPE_IDS.global
}

/**
 * 这一轮在和哪个角色聊（附录L 第二片：记忆按角色分开）—— 只认服务端按会话读出来的那张卡
 * （`persona.roleplay` 在 = 读成了聊天人设），⛔ 不直接信请求体里的 id。工作会话 / 卡没了回 `null`。
 */
export function chatMemoryCardId(
  request: AssistantOperatorRequest,
  persona: AssistantPromptPersona,
): string | null {
  return request.chatCharacterId && persona.roleplay
    ? (persona.characterCardId ?? null)
    : null
}

/**
 * 这一轮学到的东西**写进**哪个域（P3 作用域修正）—— 每张脸写自己的域（角色页写 `cards`，P3 第二片）；
 * 认不出的面回 `null`，调用方据此**不自动记**。
 * ⛔ 别退成 global：原来角色页的记忆全落进 global，所有工作台都被它影响。
 * ⭐ 和角色聊天：写进 `cards` + 这个角色（服务里按 `characterCardId` 收），故事里的事 ⛔ 不串进工作台。
 */
export function memoryWriteScopeForRequest(
  request: AssistantOperatorRequest,
  persona: AssistantPromptPersona,
): AssistantMemoryScopeId | null {
  if (request.chatCharacterId)
    return chatMemoryCardId(request, persona)
      ? ASSISTANT_MEMORY_SCOPE_IDS.cards
      : null
  const scope = memoryScopeForDomain(request.domain)
  /**
   * ⛔ 图片 / 视频 / LoRA 三台不在后台抽（owner 11-10）：新内核只把「关于你」、角色、画布项目
   * 那几份放进提示，这三台写进自己域的那几条再也进不了提示，抽一次只是白花创作者的 key。
   * 创作者在这三台明说「记住」照旧由 `remember` 记进「关于你」。
   */
  if (
    scope === ASSISTANT_MEMORY_SCOPE_IDS.image ||
    scope === ASSISTANT_MEMORY_SCOPE_IDS.video ||
    scope === ASSISTANT_MEMORY_SCOPE_IDS.lora
  )
    return null
  return scope === ASSISTANT_MEMORY_SCOPE_IDS.global ? null : scope
}

/**
 * 这一轮在哪个画布项目里（`canvas:<projectId>`）—— 画布的记忆按它收（owner
 * 2026-10-09：一个项目一份记忆）。别的工作台没有项目，回 `null`。
 */
export function requestProjectId(
  request: AssistantOperatorRequest,
): string | null {
  return assistantWorkspaceFromKey(request.workspaceKey)?.projectId ?? null
}
