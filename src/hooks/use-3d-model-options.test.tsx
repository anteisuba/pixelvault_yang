import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: null, isLoaded: true, isSignedIn: false }),
}))

import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { use3DModelOptions } from '@/hooks/use-3d-model-options'
import { renderHookWithApp } from '@/test/app-harness'

/** 真 `ApiKeysProvider`：没登录、不自动拉 —— 名单是空的（3D 内置型号照样有）。 */
function NoKeys({ children }: { children: ReactNode }) {
  return <ApiKeysProvider autoLoad={false}>{children}</ApiKeysProvider>
}

const renderHook = (hook: () => ReturnType<typeof use3DModelOptions>) =>
  renderHookWithApp(hook, { inner: NoKeys })

describe('use3DModelOptions', () => {
  it('returns at least one workspace-source 3D model option', () => {
    const { result } = renderHook(() => use3DModelOptions())
    expect(result.current.modelOptions.length).toBeGreaterThan(0)
    expect(
      result.current.modelOptions.some((o) => o.sourceType === 'workspace'),
    ).toBe(true)
  })

  it('all returned options carry isBuiltIn=true on workspace entries', () => {
    const { result } = renderHook(() => use3DModelOptions())
    const workspaceOptions = result.current.modelOptions.filter(
      (o) => o.sourceType === 'workspace',
    )
    expect(workspaceOptions.every((o) => o.isBuiltIn)).toBe(true)
  })

  it('workspace options use "workspace:" optionId prefix', () => {
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
    expect(() => renderHook(() => use3DModelOptions())).not.toThrow()
  })

  it('returns ref-stable modelOptions when keys/healthMap do not change', () => {
    const { result, rerender } = renderHook(() => use3DModelOptions())
    const first = result.current.modelOptions
    rerender()
    expect(result.current.modelOptions).toBe(first)
  })
})
