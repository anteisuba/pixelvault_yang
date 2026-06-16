import { describe, it, expect } from 'vitest'

import {
  adapterHasCapability,
  getLLMCapabilityScope,
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
    expect(getLLMCapabilityScope('assistant').sort()).toEqual(
      [
        AI_ADAPTER_TYPES.DASHSCOPE,
        AI_ADAPTER_TYPES.GEMINI,
        AI_ADAPTER_TYPES.OPENAI,
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
