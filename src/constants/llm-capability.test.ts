import { describe, it, expect } from 'vitest'

import {
  LLM_TOOL_CALLING_MODES,
  LLM_TOOL_CALLING_MODE_BY_ADAPTER,
  adapterHasCapability,
  getLLMCapabilityScope,
  getLlmToolCallingMode,
} from '@/constants/llm-capability'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { SCRIPT_PLANNER_MODELS } from '@/constants/script-breakdown'

describe('getLLMCapabilityScope', () => {
  it('returns enhance-capable adapters matching legacy LLM_CAPABLE_ADAPTERS set', () => {
    expect(getLLMCapabilityScope('enhance').sort()).toEqual(
      [
        AI_ADAPTER_TYPES.DASHSCOPE,
        AI_ADAPTER_TYPES.GEMINI,
        AI_ADAPTER_TYPES.OPENAI,
        // 2026-08-23: Grok 4.6 joins enhance — it has vision, so unlike
        // DeepSeek nothing bars it from this route.
        AI_ADAPTER_TYPES.XAI,
      ].sort(),
    )
  })

  it('returns planner-capable adapters matching SCRIPT_PLANNER_MODELS adapter set', () => {
    expect(getLLMCapabilityScope('planner').sort()).toEqual(
      [
        AI_ADAPTER_TYPES.DASHSCOPE,
        AI_ADAPTER_TYPES.DEEPSEEK,
        AI_ADAPTER_TYPES.GEMINI,
        AI_ADAPTER_TYPES.OPENAI,
      ].sort(),
    )
  })

  it('returns assistant-capable adapters matching NODE_STUDIO_ASSISTANT_ROUTE_MODELS adapter set', () => {
    // 2026-07-26: Qwen (DASHSCOPE) exits the assistant route; Claude
    // (ANTHROPIC) takes its slot — see
    // docs/references/pages/assistant-shell.md.
    expect(getLLMCapabilityScope('assistant').sort()).toEqual(
      [
        AI_ADAPTER_TYPES.ANTHROPIC,
        AI_ADAPTER_TYPES.DEEPSEEK,
        AI_ADAPTER_TYPES.GEMINI,
        AI_ADAPTER_TYPES.OPENAI,
        // 2026-08-23: Grok 4.6 joins as the fifth assistant route.
        AI_ADAPTER_TYPES.XAI,
      ].sort(),
    )
  })
})

describe('adapterHasCapability', () => {
  it('returns true for declared capabilities', () => {
    expect(adapterHasCapability(AI_ADAPTER_TYPES.OPENAI, 'enhance')).toBe(true)
    expect(adapterHasCapability(AI_ADAPTER_TYPES.DEEPSEEK, 'planner')).toBe(
      true,
    )
  })

  it('returns false for undeclared capabilities (preserves current behavior)', () => {
    expect(adapterHasCapability(AI_ADAPTER_TYPES.DEEPSEEK, 'enhance')).toBe(
      false,
    )
    expect(adapterHasCapability(AI_ADAPTER_TYPES.VOLCENGINE, 'planner')).toBe(
      false,
    )
    expect(adapterHasCapability(AI_ADAPTER_TYPES.VOLCENGINE, 'enhance')).toBe(
      false,
    )
    expect(adapterHasCapability(AI_ADAPTER_TYPES.VOLCENGINE, 'assistant')).toBe(
      false,
    )
    expect(adapterHasCapability(AI_ADAPTER_TYPES.FAL, 'enhance')).toBe(false)
    expect(adapterHasCapability(AI_ADAPTER_TYPES.HUGGINGFACE, 'planner')).toBe(
      false,
    )
  })
})

describe('getLlmToolCallingMode', () => {
  it('原生只有 OpenAI 与 Gemini，其余助手路一律 JSON', () => {
    expect(getLlmToolCallingMode(AI_ADAPTER_TYPES.OPENAI)).toBe(
      LLM_TOOL_CALLING_MODES.native,
    )
    expect(getLlmToolCallingMode(AI_ADAPTER_TYPES.GEMINI)).toBe(
      LLM_TOOL_CALLING_MODES.native,
    )
    for (const adapter of [
      // Claude 有原生 tool use，但它要真实 messages 历史 —— 本仓这条链还没有，
      // 所以它留在 JSON 路。改它之前先把历史做出来。
      AI_ADAPTER_TYPES.ANTHROPIC,
      AI_ADAPTER_TYPES.DEEPSEEK,
      AI_ADAPTER_TYPES.DASHSCOPE,
      AI_ADAPTER_TYPES.XAI,
    ]) {
      expect(getLlmToolCallingMode(adapter)).toBe(LLM_TOOL_CALLING_MODES.json)
    }
  })

  it('每一个 adapter 都在表里，且取值只有两种', () => {
    const modes = Object.values(LLM_TOOL_CALLING_MODES)
    for (const adapter of Object.values(AI_ADAPTER_TYPES)) {
      expect(
        LLM_TOOL_CALLING_MODE_BY_ADAPTER[adapter],
        `${adapter} 缺一条工具调用模式 —— 这张表是穷举的，别加索引签名`,
      ).toBeDefined()
      expect(modes).toContain(getLlmToolCallingMode(adapter))
    }
  })
})

describe('contract: 路由表 ↔ 能力表 ↔ 工具调用模式表', () => {
  it('每一条 assistant 路都声明了工具调用模式', () => {
    // 助手工具环每一步都要选一条路去问模型；模式表漏一家 = 那条路上的用户
    // 撞到一个没人写过的分支。
    for (const adapter of getLLMCapabilityScope('assistant')) {
      expect(
        LLM_TOOL_CALLING_MODE_BY_ADAPTER[adapter],
        `${adapter} 是 assistant 路但没有工具调用模式`,
      ).toBeDefined()
    }
  })

  it('声明 native 的 adapter 必须是 assistant 路 —— 原生工具环只在助手上用', () => {
    const assistantAdapters = new Set(getLLMCapabilityScope('assistant'))
    for (const [adapter, mode] of Object.entries(
      LLM_TOOL_CALLING_MODE_BY_ADAPTER,
    )) {
      if (mode !== LLM_TOOL_CALLING_MODES.native) continue
      expect(
        assistantAdapters.has(adapter as AI_ADAPTER_TYPES),
        `${adapter} 声明了 native，但它不在 assistant 名单里 —— 两张表漂了`,
      ).toBe(true)
    }
  })
})

describe('contract: capability map stays in sync with legacy constants', () => {
  // spec §7.2 IRON RULE: prevent the historical drift where 3 hardcoded
  // sets diverged. SCRIPT_PLANNER_MODELS and NODE_STUDIO_ASSISTANT_ROUTE_MODELS
  // stay (Zod / service-layer dependencies); contract tests below catch
  // any future divergence between them and ADAPTER_CAPABILITIES.

  it('every SCRIPT_PLANNER_MODELS adapterType has "planner" capability', () => {
    for (const [name, model] of Object.entries(SCRIPT_PLANNER_MODELS)) {
      expect(
        adapterHasCapability(model.adapterType, 'planner'),
        `SCRIPT_PLANNER_MODELS.${name} (adapterType=${model.adapterType}) must declare 'planner' capability in ADAPTER_CAPABILITIES`,
      ).toBe(true)
    }
  })

  it('every NODE_STUDIO_ASSISTANT_ROUTE_MODELS adapterType has "assistant" capability', () => {
    for (const model of NODE_STUDIO_ASSISTANT_ROUTE_MODELS) {
      expect(
        adapterHasCapability(model.adapterType, 'assistant'),
        `NODE_STUDIO_ASSISTANT_ROUTE_MODELS entry (adapterType=${model.adapterType}) must declare 'assistant' capability in ADAPTER_CAPABILITIES`,
      ).toBe(true)
    }
  })

  it('every "planner"-capable adapter has a SCRIPT_PLANNER_MODELS entry', () => {
    const plannerAdapters = getLLMCapabilityScope('planner')
    const declaredAdapters = Object.values(SCRIPT_PLANNER_MODELS).map(
      (m) => m.adapterType,
    )
    for (const adapter of plannerAdapters) {
      expect(
        declaredAdapters,
        `Adapter ${adapter} declares 'planner' capability but has no SCRIPT_PLANNER_MODELS entry — service-layer routing will fail`,
      ).toContain(adapter)
    }
  })

  it('every "assistant"-capable adapter has a NODE_STUDIO_ASSISTANT_ROUTE_MODELS entry', () => {
    const assistantAdapters = getLLMCapabilityScope('assistant')
    const declaredAdapters = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.map(
      (m) => m.adapterType,
    )
    for (const adapter of assistantAdapters) {
      expect(
        declaredAdapters,
        `Adapter ${adapter} declares 'assistant' capability but has no NODE_STUDIO_ASSISTANT_ROUTE_MODELS entry — Node canvas routing will fail`,
      ).toContain(adapter)
    }
  })
})
