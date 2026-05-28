import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import { use3DModelOptions } from '@/hooks/use-3d-model-options'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: vi.fn(),
}))

import { useApiKeysContext } from '@/contexts/api-keys-context'

function makeKey(overrides: Partial<UserApiKeyRecord>): UserApiKeyRecord {
  const providerConfig: ProviderConfig = {
    label: `${overrides.adapterType ?? 'fal'}-label`,
    baseUrl: 'https://example.com',
  }
  return {
    id: overrides.id ?? 'key-1',
    modelId: overrides.modelId ?? 'fal-ai/hunyuan3d-v2',
    adapterType: overrides.adapterType ?? AI_ADAPTER_TYPES.FAL,
    providerConfig,
    label: overrides.label ?? 'My FAL key',
    maskedKey: overrides.maskedKey ?? 'fal-****1234',
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date('2026-01-01'),
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

describe('use3DModelOptions', () => {
  it('returns at least one workspace-source 3D model option', () => {
    mockApiKeys([])
    const { result } = renderHook(() => use3DModelOptions())
    expect(result.current.modelOptions.length).toBeGreaterThan(0)
    expect(
      result.current.modelOptions.some((o) => o.sourceType === 'workspace'),
    ).toBe(true)
  })

  it('all returned options carry isBuiltIn=true on workspace entries', () => {
    mockApiKeys([])
    const { result } = renderHook(() => use3DModelOptions())
    const workspaceOptions = result.current.modelOptions.filter(
      (o) => o.sourceType === 'workspace',
    )
    expect(workspaceOptions.every((o) => o.isBuiltIn)).toBe(true)
  })

  it('workspace options use "workspace:" optionId prefix', () => {
    mockApiKeys([])
    const { result } = renderHook(() => use3DModelOptions())
    const workspaceOptions = result.current.modelOptions.filter(
      (o) => o.sourceType === 'workspace',
    )
    expect(
      workspaceOptions.every((o) => o.optionId.startsWith('workspace:')),
    ).toBe(true)
  })

  it('does NOT depend on Studio Form context (verifies no useStudioForm crash)', () => {
    // Use3DModelOptions must work in Studio3DWorkspace which is NOT
    // wrapped in StudioFormProvider. If this test ever fails with
    // "useStudioForm must be used within a Provider", the hook has
    // regressed and will crash 3D workspace.
    mockApiKeys([])
    expect(() => renderHook(() => use3DModelOptions())).not.toThrow()
  })

  it('returns ref-stable modelOptions when keys/healthMap do not change', () => {
    const fixedKeys: UserApiKeyRecord[] = []
    const fixedHealth: Record<string, ApiKeyHealthStatus> = {}
    mockApiKeys(fixedKeys, fixedHealth)
    const { result, rerender } = renderHook(() => use3DModelOptions())
    const first = result.current.modelOptions
    rerender()
    expect(result.current.modelOptions).toBe(first)
  })
})
