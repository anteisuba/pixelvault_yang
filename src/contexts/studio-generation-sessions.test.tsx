import type { ReactNode } from 'react'

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models/enum'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: 'user-generation-sessions' }),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  studioGenerateAPI: vi.fn(),
  checkImageGenerationStatusAPI: vi.fn(),
}))

import {
  StudioGenerationSessionsProvider,
  useStudioGenerationSession,
  type StudioGenerationSessionId,
} from '@/contexts/studio-generation-sessions'
import {
  checkImageGenerationStatusAPI,
  studioGenerateAPI,
} from '@/lib/api-client'
import { AppProviders } from '@/test/app-harness'

/**
 * 换台 = 台卸载、外壳还在（11-17 真机：LoRA 台出到 28% 切去配音台再回来，作业消失）。
 * `rerender` 换掉 hook 那一颗、wrapper（外壳那一层）原样留着 —— 就是这个场景。
 */
function wrapper({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <StudioGenerationSessionsProvider>
        {children}
      </StudioGenerationSessionsProvider>
    </AppProviders>
  )
}

beforeEach(() => {
  vi.mocked(studioGenerateAPI)
    .mockReset()
    .mockResolvedValue({ success: true, data: { jobId: 'job-1' } } as never)
  vi.mocked(checkImageGenerationStatusAPI)
    .mockReset()
    .mockResolvedValue({
      success: true,
      data: { jobId: 'job-1', status: 'IN_PROGRESS' },
    } as never)
})

describe('StudioGenerationSessionsProvider', () => {
  it('台卸下再挂回，在飞那一单还在（同一槽）', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ id }: { id: StudioGenerationSessionId | null }) =>
        id ? useStudioGenerationSession(id) : null,
      { wrapper, initialProps: { id: 'workspace' } },
    )
    act(() => {
      void result.current!.generate({
        mode: 'image',
        image: { modelId: AI_MODELS.GEMINI_FLASH_IMAGE, freePrompt: 'a cat' },
      } as never)
    })
    await vi.waitFor(() => expect(studioGenerateAPI).toHaveBeenCalledTimes(1))
    const runId = result.current!.activeRun?.id
    expect(runId).toBeTruthy()

    // 台换走（这一颗 hook 不再挂着），再换回来。
    rerender({ id: null })
    rerender({ id: 'workspace' })
    expect(result.current!.isGenerating).toBe(true)
    expect(result.current!.activeRun?.id).toBe(runId)
    unmount()
  })

  it('槽与槽互不串台：LoRA 台那一单不出现在图片台', async () => {
    const { result } = renderHook(
      () => ({
        lora: useStudioGenerationSession('lora'),
        workspace: useStudioGenerationSession('workspace'),
      }),
      { wrapper },
    )
    act(() => {
      void result.current.lora.generate({
        mode: 'image',
        image: { modelId: AI_MODELS.GEMINI_FLASH_IMAGE, freePrompt: 'a cat' },
      } as never)
    })
    await vi.waitFor(() => expect(result.current.lora.activeRun).not.toBeNull())
    expect(result.current.workspace.activeRun).toBeNull()
    expect(result.current.workspace.isGenerating).toBe(false)
  })

  it('外壳外面用就直接抛（⛔ 悄悄造一份本地的）', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      renderHook(() => useStudioGenerationSession('lora'), {
        wrapper: AppProviders,
      }),
    ).toThrow(/StudioGenerationSessionsProvider/)
    quiet.mockRestore()
  })
})
