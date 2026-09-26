import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'

vi.mock('@/lib/api-client', () => ({
  getAssistantPersonaAPI: vi.fn(),
  updateAssistantPersonaAPI: vi.fn(),
  uploadAssistantAvatarAPI: vi.fn(),
}))

import {
  getAssistantPersonaAPI,
  updateAssistantPersonaAPI,
  uploadAssistantAvatarAPI,
} from '@/lib/api-client'
import { toAssistantPersonaUpdate } from '@/types/assistant-persona'
import {
  useAssistantPersona,
  useAssistantPersonaAutosave,
} from './use-assistant-persona'

describe('useAssistantPersona', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('设置入口保存、上传头像会同步到已挂载的对话区', async () => {
    const panel = renderHook(() => useAssistantPersona({ enabled: false }))
    const settings = renderHook(() => useAssistantPersona({ enabled: false }))
    const persona = { ...ASSISTANT_PERSONA_DEFAULTS, name: 'Mika' }
    vi.mocked(updateAssistantPersonaAPI).mockResolvedValue({
      success: true,
      data: persona,
    })
    await act(async () => {
      await settings.result.current.save(toAssistantPersonaUpdate(persona))
    })
    expect(panel.result.current.persona.name).toBe('Mika')

    vi.mocked(uploadAssistantAvatarAPI).mockResolvedValue({
      success: true,
      data: { url: 'https://cdn.test/avatar.png' },
    })
    vi.mocked(getAssistantPersonaAPI).mockResolvedValue({
      success: true,
      data: {
        ...persona,
        avatarChoice: 'upload',
        avatarUrl: 'https://cdn.test/avatar.png',
        uploadedAvatarUrl: 'https://cdn.test/avatar.png',
      },
    })
    await act(async () => {
      await settings.result.current.uploadAvatar('data:image/png;base64,test')
    })
    // 传完整份重读：单选表切到「我上传的」，显示用的那张也换上。
    expect(panel.result.current.persona).toMatchObject({
      avatarChoice: 'upload',
      avatarUrl: 'https://cdn.test/avatar.png',
    })
  })
})

/**
 * 改了就存（助手设置 B）：请求排队合并，⛔ 不并发。
 */
describe('useAssistantPersonaAutosave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('途中又改了就只记住最新那一份，前一个落地后再发', async () => {
    const resolvers: ((value: unknown) => void)[] = []
    vi.mocked(updateAssistantPersonaAPI).mockImplementation(
      (input) =>
        new Promise((resolve) => {
          resolvers.push(() =>
            resolve({
              success: true,
              data: { ...ASSISTANT_PERSONA_DEFAULTS, ...input },
            }),
          )
        }),
    )
    const { result } = renderHook(() =>
      useAssistantPersonaAutosave({ enabled: false }),
    )

    act(() => result.current.apply({ verbosity: 'concise' }))
    act(() => result.current.apply({ verbosity: 'detailed' }))
    act(() => result.current.apply({ language: 'english' }))
    expect(result.current.status).toBe('saving')
    expect(updateAssistantPersonaAPI).toHaveBeenCalledTimes(1)
    // 控件上立刻就是用户点的那一份。
    expect(result.current.draft).toMatchObject({
      verbosity: 'detailed',
      language: 'english',
    })

    await act(async () => resolvers[0](undefined))
    await waitFor(() =>
      expect(updateAssistantPersonaAPI).toHaveBeenCalledTimes(2),
    )
    expect(vi.mocked(updateAssistantPersonaAPI).mock.calls[1][0]).toMatchObject(
      { verbosity: 'detailed', language: 'english' },
    )
    await act(async () => resolvers[1](undefined))
    await waitFor(() => expect(result.current.status).toBe('saved'))
  })

  it('打字只改界面，失焦 commit 才存；没改过 commit 什么都不做', async () => {
    vi.mocked(updateAssistantPersonaAPI).mockImplementation(async (input) => ({
      success: true,
      data: { ...ASSISTANT_PERSONA_DEFAULTS, ...input },
    }))
    const { result } = renderHook(() =>
      useAssistantPersonaAutosave({ enabled: false }),
    )

    act(() => result.current.commit())
    expect(updateAssistantPersonaAPI).not.toHaveBeenCalled()

    act(() => result.current.edit({ name: 'Mi' }))
    act(() => result.current.edit({ name: 'Mika' }))
    expect(updateAssistantPersonaAPI).not.toHaveBeenCalled()
    expect(result.current.draft.name).toBe('Mika')

    await act(async () => result.current.commit())
    expect(updateAssistantPersonaAPI).toHaveBeenCalledTimes(1)
    expect(vi.mocked(updateAssistantPersonaAPI).mock.calls[0][0]).toMatchObject(
      { name: 'Mika' },
    )
  })

  it('没保存上就停在「失败」，重试发的是控件上那一份', async () => {
    vi.mocked(updateAssistantPersonaAPI).mockResolvedValueOnce({
      success: false,
      error: 'boom',
    })
    const { result } = renderHook(() =>
      useAssistantPersonaAutosave({ enabled: false }),
    )

    await act(async () => result.current.apply({ nextStepHint: false }))
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.draft.nextStepHint).toBe(false)

    vi.mocked(updateAssistantPersonaAPI).mockImplementation(async (input) => ({
      success: true,
      data: { ...ASSISTANT_PERSONA_DEFAULTS, ...input },
    }))
    await act(async () => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('saved'))
    expect(vi.mocked(updateAssistantPersonaAPI).mock.calls[1][0]).toMatchObject(
      { nextStepHint: false },
    )
  })
})
