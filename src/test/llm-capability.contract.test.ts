/**
 * IRON RULE contract test — LLM route list consistency across entry points.
 *
 * Spec reference:
 *   docs/spark/2026-05-28-api-key-selector-unification-design.md
 *   §7.2 (IRON RULE) — "prevent the historical drift where 3 hardcoded
 *   sets diverged. SCRIPT_PLANNER_MODELS and
 *   NODE_STUDIO_ASSISTANT_ROUTE_MODELS stay (Zod / service-layer
 *   dependencies); contract tests below catch any future divergence
 *   between them and ADAPTER_CAPABILITIES."
 *   §10 T11 — assigned to this file path.
 *
 * What this guards (and why):
 *   The pre-refactor codebase carried three separate hardcoded LLM
 *   adapter sets — StudioEnhanceButton.LLM_CAPABLE_ADAPTERS,
 *   SCRIPT_PLANNER_MODELS, NODE_STUDIO_ASSISTANT_ROUTE_MODELS — and
 *   they DID drift (DeepSeek missing from enhance, VolcEngine missing
 *   from planner / assistant). T2 collapsed source-of-truth into
 *   ADAPTER_CAPABILITIES; T4 added useLLMRoutePicker(scope) as the
 *   single hook the picker layer consults; T6-T10 cut every entry
 *   point over.
 *
 *   This file is the structural guard that keeps it from sliding
 *   back: every picker entry point for "enhance" / "planner" /
 *   "assistant" must read its list through useLLMRoutePicker
 *   (which derives from ADAPTER_CAPABILITIES), and no caller may
 *   introduce a private set or filter.
 *
 *   When this file fails, do NOT patch the test to make it green —
 *   the failure is telling you a regression is about to ship. Fix
 *   the regression instead, then re-run.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  adapterHasCapability,
  getLLMCapabilityScope,
  type LlmCapabilityScope,
} from '@/constants/llm-capability'
import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: vi.fn(),
}))

import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useLLMRoutePicker } from '@/hooks/use-llm-route-picker'

const ALL_SCOPES: LlmCapabilityScope[] = ['enhance', 'planner', 'assistant']

function makeKey(over: Partial<UserApiKeyRecord>): UserApiKeyRecord {
  const providerConfig: ProviderConfig = {
    label: `${over.adapterType ?? 'openai'}-label`,
    baseUrl: 'https://example.com',
  }
  return {
    id: over.id ?? 'key-1',
    modelId: over.modelId ?? 'model-1',
    adapterType: over.adapterType ?? AI_ADAPTER_TYPES.OPENAI,
    providerConfig,
    label: over.label ?? 'Test key',
    maskedKey: over.maskedKey ?? '****1234',
    isActive: over.isActive ?? true,
    createdAt: over.createdAt ?? new Date('2026-01-01'),
  }
}

function mockApiKeys(
  keys: UserApiKeyRecord[],
  healthMap: Record<string, ApiKeyHealthStatus> = {},
) {
  vi.mocked(useApiKeysContext).mockReturnValue({
    keys,
    healthMap,
    isLoading: false,
  } as ReturnType<typeof useApiKeysContext>)
}

describe('IRON RULE — LLM scope source of truth', () => {
  it('every adapter in getLLMCapabilityScope(scope) appears in useLLMRoutePicker(scope).lockedRoutes when no keys exist', () => {
    mockApiKeys([])
    for (const scope of ALL_SCOPES) {
      const { result } = renderHook(() => useLLMRoutePicker(scope))
      const expectedAdapters = getLLMCapabilityScope(scope)
      for (const adapter of expectedAdapters) {
        expect(
          result.current.lockedRoutes.some((r) => r.adapterType === adapter),
          `Adapter ${adapter} declares "${scope}" capability but is missing from useLLMRoutePicker("${scope}").lockedRoutes — UI will silently drop it`,
        ).toBe(true)
      }
    }
  })

  it('no adapter without "scope" capability appears in useLLMRoutePicker("scope").lockedRoutes', () => {
    mockApiKeys([])
    for (const scope of ALL_SCOPES) {
      const { result } = renderHook(() => useLLMRoutePicker(scope))
      const allowedAdapters = new Set(getLLMCapabilityScope(scope))
      for (const route of result.current.lockedRoutes) {
        expect(
          allowedAdapters.has(route.adapterType),
          `useLLMRoutePicker("${scope}") surfaces ${route.adapterType} which does NOT declare "${scope}" capability — list and source-of-truth have drifted`,
        ).toBe(true)
      }
    }
  })

  it('a saved key shows up in every scope its adapter declares', () => {
    // OPENAI has enhance + planner + assistant per ADAPTER_CAPABILITIES.
    // The same key must show up in all three scopes' savedRoutes —
    // an entry point that filtered it out would create the kind of
    // drift this rule prevents.
    const openaiKey = makeKey({
      id: 'k-openai',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
    })
    mockApiKeys([openaiKey])
    for (const scope of ALL_SCOPES) {
      const { result } = renderHook(() => useLLMRoutePicker(scope))
      const expected = adapterHasCapability(openaiKey.adapterType, scope)
      const actual = result.current.savedRoutes.some(
        (r) => r.apiKeyId === openaiKey.id,
      )
      expect(actual).toBe(expected)
    }
  })

  it('a saved key for an adapter that does NOT declare the scope is filtered out', () => {
    // Pure regression guard for the original DeepSeek-in-enhance bug:
    // DeepSeek doesn't have "enhance" capability (current behavior
    // preserved by T2), so a DeepSeek key must not surface in the
    // enhance picker — but it MUST surface in planner + assistant.
    const deepseekKey = makeKey({
      id: 'k-ds',
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    })
    mockApiKeys([deepseekKey])
    const enhance = renderHook(() => useLLMRoutePicker('enhance'))
    expect(
      enhance.result.current.savedRoutes.find((r) => r.apiKeyId === 'k-ds'),
    ).toBeUndefined()

    const planner = renderHook(() => useLLMRoutePicker('planner'))
    expect(
      planner.result.current.savedRoutes.find((r) => r.apiKeyId === 'k-ds'),
    ).toBeDefined()

    const assistant = renderHook(() => useLLMRoutePicker('assistant'))
    expect(
      assistant.result.current.savedRoutes.find((r) => r.apiKeyId === 'k-ds'),
    ).toBeDefined()
  })

  it('inactive keys are filtered uniformly across all scopes', () => {
    const inactiveKey = makeKey({
      id: 'k-inactive',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      isActive: false,
    })
    mockApiKeys([inactiveKey])
    for (const scope of ALL_SCOPES) {
      const { result } = renderHook(() => useLLMRoutePicker(scope))
      expect(
        result.current.savedRoutes.find((r) => r.apiKeyId === 'k-inactive'),
      ).toBeUndefined()
    }
  })

  it('locked routes do not duplicate the same adapter (one per modelId)', () => {
    mockApiKeys([])
    for (const scope of ALL_SCOPES) {
      const { result } = renderHook(() => useLLMRoutePicker(scope))
      const seen = new Set<string>()
      for (const route of result.current.lockedRoutes) {
        expect(
          seen.has(route.optionId),
          `Duplicate optionId in useLLMRoutePicker("${scope}").lockedRoutes: ${route.optionId}`,
        ).toBe(false)
        seen.add(route.optionId)
      }
    }
  })
})

describe('IRON RULE — no private LLM adapter sets outside the source of truth', () => {
  /*
   * Static check: scan picker entry-point files and assert that no
   * file outside src/constants/llm-capability.ts or
   * src/constants/script-breakdown.ts /
   * src/constants/node-studio.ts (the legacy Zod-bound constants
   * intentionally kept until T13) defines a hardcoded LLM-adapter
   * Set / array used for filtering.
   *
   * If a future PR re-introduces a pattern like
   *   const LLM_CAPABLE_ADAPTERS = new Set([...])
   * inside a picker file, this test catches it.
   */
  const repoRoot = process.cwd()
  const SUSPECT_FILES = [
    'src/components/business/studio/StudioEnhanceButton.tsx',
    'src/components/business/prompts/PromptAssistantPanel.tsx',
    'src/components/business/node/CanvasPlannerRouteSelector.tsx',
    'src/components/business/node/CanvasAssistantRouteSelector.tsx',
    'src/components/business/node/WorkflowModelPicker.tsx',
    'src/components/business/studio-shared/pickers/CanvasRoutePicker.tsx',
    'src/components/business/studio-shared/pickers/MainModelPicker.tsx',
    'src/components/business/studio-shared/pickers/BaseModelPickerPanel.tsx',
  ]

  it('no picker file defines its own LLM_CAPABLE_ADAPTERS-style set', () => {
    const pattern =
      /LLM_CAPABLE_ADAPTERS\s*=|LLM_CAPABLE_PROVIDERS\s*=|new\s+Set\s*<.*AI_ADAPTER_TYPES.*>/i
    for (const relPath of SUSPECT_FILES) {
      const contents = readFileSync(join(repoRoot, relPath), 'utf-8')
      expect(
        pattern.test(contents),
        `${relPath} re-introduces a private LLM-adapter set. Add the capability to src/constants/llm-capability.ts → ADAPTER_CAPABILITIES instead.`,
      ).toBe(false)
    }
  })

  it('picker entry-point files consult useLLMRoutePicker, adapterHasCapability, or getLLMCapabilityScope (not raw key.adapterType filtering for LLM scope)', () => {
    /*
     * Heuristic: any file that filters keys.filter(k => ...) on an
     * adapter set inline (without going through adapterHasCapability
     * or useLLMRoutePicker) re-introduces the drift. The entry points
     * known to deal with LLM scope must show evidence of using the
     * sanctioned API.
     */
    const ENTRY_POINTS_USING_LLM = [
      'src/components/business/studio/StudioEnhanceButton.tsx',
      'src/components/business/node/CanvasPlannerRouteSelector.tsx',
      'src/components/business/node/CanvasAssistantRouteSelector.tsx',
      'src/components/business/studio-shared/pickers/CanvasRoutePicker.tsx',
      'src/components/business/studio-shared/pickers/MainModelPicker.tsx',
    ]
    /*
     * Sanctioned APIs (all funnel into useLLMRoutePicker → ADAPTER_CAPABILITIES):
     *   - Direct hook / helper:   useLLMRoutePicker, adapterHasCapability,
     *                             getLLMCapabilityScope
     *   - Shared components that internally route through the hook:
     *                             CanvasRoutePicker (variant planner / assistant
     *                             both call useLLMRoutePicker), MainModelPicker
     *                             (modality llm_assist calls useLLMRoutePicker)
     * Wrappers like CanvasPlannerRouteSelector use CanvasRoutePicker — that
     * still satisfies the contract because the actual LLM list resolution
     * happens via the sanctioned component.
     */
    const sanctionedApiPattern =
      /useLLMRoutePicker|adapterHasCapability|getLLMCapabilityScope|CanvasRoutePicker|MainModelPicker/
    for (const relPath of ENTRY_POINTS_USING_LLM) {
      const contents = readFileSync(join(repoRoot, relPath), 'utf-8')
      expect(
        sanctionedApiPattern.test(contents),
        `${relPath} is an LLM entry point but does not import any sanctioned API (useLLMRoutePicker / adapterHasCapability / getLLMCapabilityScope / CanvasRoutePicker / MainModelPicker). Did a refactor bypass the source of truth?`,
      ).toBe(true)
    }
  })
})
