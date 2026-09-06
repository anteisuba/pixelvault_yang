import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'

vi.mock('@/lib/api-client', () => ({
  getAssistantPersonaAPI: vi.fn(),
  updateAssistantPersonaAPI: vi.fn(),
  uploadAssistantAvatarAPI: vi.fn(),
  removeAssistantAvatarAPI: vi.fn(),
}))

import {
  updateAssistantPersonaAPI,
  uploadAssistantAvatarAPI,
  removeAssistantAvatarAPI,
} from '@/lib/api-client'
import { useAssistantPersona } from './use-assistant-persona'

describe('useAssistantPersona', () => {
  it('设置入口保存、上传和移除头像会同步到已挂载的对话区', async () => {
    const panel = renderHook(() => useAssistantPersona({ enabled: false }))
    const settings = renderHook(() => useAssistantPersona({ enabled: false }))
    const persona = {
      ...ASSISTANT_PERSONA_DEFAULTS,
      name: 'Mika',
      avatarUrl: null,
    }
    vi.mocked(updateAssistantPersonaAPI).mockResolvedValue({
      success: true,
      data: persona,
    })
    await act(async () => {
      await settings.result.current.save({
        ...ASSISTANT_PERSONA_DEFAULTS,
        name: 'Mika',
      })
    })
    expect(panel.result.current.persona.name).toBe('Mika')
    vi.mocked(uploadAssistantAvatarAPI).mockResolvedValue({
      success: true,
      data: { url: 'https://cdn.test/avatar.png' },
    })
    await act(async () => {
      await settings.result.current.uploadAvatar('data:image/png;base64,test')
    })
    expect(panel.result.current.persona.avatarUrl).toBe(
      'https://cdn.test/avatar.png',
    )
    vi.mocked(removeAssistantAvatarAPI).mockResolvedValue({
      success: true,
      data: { removed: true },
    })
    await act(async () => {
      await settings.result.current.removeAvatar()
    })
    expect(panel.result.current.persona.avatarUrl).toBeNull()
  })
})
