import 'server-only'

import { ASSISTANT_MEMORY_SOURCE_IDS } from '@/constants/assistant-memory'
import { ASSISTANT_OPERATOR_TOOL_IDS as TOOL } from '@/constants/assistant-operator'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import type { AssistantMemory } from '@/types/assistant-memory'
import { searchAssistantMemories } from '@/services/assistant-memory.service'
import {
  chatMemoryCardId,
  memoryAsRule,
  memoryScopeForDomain,
  requestProjectId,
  type ToolPlan,
} from '@/services/kernel/assistant-operator.service'
import {
  settlePlan,
  TITLE_TEXT,
  type V3Context,
  type V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'

/**
 * 翻记忆（P3 读取 · `search_library kind "memories"`）—— 每张脸同一条路。
 *
 * ⭐ 系统提示里只有最近记下 / 改过的那几条（固定一组，吃缓存）；用户说「上次那个」「我以前说过」
 *   而提示里没有时，模型自己来翻。翻什么、翻到的哪条算数，交给模型判断。
 * ⚠ 步骤行借 `read_project_rules` 那条（图标、动词、步骤帧形状 —— 都是「读用户留下的东西」，那条本来
 *   就把记忆行当规矩回），⛔ 不另开旧执行器工具。
 */
export async function* searchMemoriesStep(
  context: V3Context,
  query: string,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const words = query.trim()
  const incognito = context.request.incognito === true
  const plan: ToolPlan = {
    kind: 'read',
    // 步骤帧借 `read_project_rules` 的形状（payload 一格域、result 一列规矩）；查询词在标题里。
    payload: { scope: context.request.domain },
    run: async () => {
      // 隐身不读（owner 2026-10-16）：⛔ 打库，也 ⛔ 刷 lastUsedAt。
      if (incognito)
        return {
          result: { rules: [] },
          observation:
            'Incognito is on: you do not use what you remember about the creator in this conversation. Ask them instead.',
        }
      const found = await searchAssistantMemories(context.prepared.user.id, {
        scope: memoryScopeForDomain(context.request.domain),
        projectId: requestProjectId(context.request),
        characterCardId: chatMemoryCardId(
          context.request,
          context.prepared.run.persona,
        ),
        query: words,
      })
      return {
        result: { rules: found.map(memoryAsRule) },
        observation: describeFoundMemories(found, words),
      }
    },
  }
  const title = `${TITLE_TEXT[context.language].searchMemories} ${words}`.trim()
  return yield* settlePlan(context, TOOL.readProjectRules, title, plan)
}

function describeFoundMemories(
  found: readonly AssistantMemory[],
  query: string,
): string {
  if (found.length === 0)
    // 空结果说出来：静默的空结果会让模型接着编一条「你以前说过」。
    return query
      ? `Nothing you remember matches "${query}". Try other words, or an empty query for the newest — and do not make one up.`
      : 'You remember nothing about this creator yet.'
  return `What you remember (newest first, ${found.length}):\n${found
    .map(
      (memory) =>
        `- [${memory.kind}${memory.source === ASSISTANT_MEMORY_SOURCE_IDS.creator ? ', they wrote it' : ''}] ${memory.text}`,
    )
    .join('\n')}`
}
