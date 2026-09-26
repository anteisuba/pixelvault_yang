import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import zhMessages from '@/messages/zh.json'
import type { CharacterCardRecord } from '@/types'

import { UseCharacterMenu } from './UseCharacterMenu'

vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => true,
}))

const push = vi.fn()
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }))

const save = vi.fn().mockResolvedValue(true)
let personaCharacterId: string | null = null
vi.mock('@/hooks/use-assistant-persona', () => ({
  useAssistantPersona: () => ({
    persona: {
      character: personaCharacterId ? { id: personaCharacterId } : null,
    },
    isLoading: false,
    save,
  }),
}))

vi.mock('@/types/assistant-persona', () => ({
  withAssistantCharacter: (_persona: unknown, id: string | null) => ({
    characterCardId: id,
    nameFromCharacter: true,
    toneFromCharacter: true,
    avatarChoice: 'character',
  }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const CARD = { id: 'denia', name: 'Denia' } as CharacterCardRecord

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <UseCharacterMenu card={CARD} />
    </NextIntlClientProvider>,
  )
}

describe('UseCharacterMenu（用她 ▾）', () => {
  beforeEach(() => {
    push.mockClear()
    save.mockClear()
    personaCharacterId = null
  })

  it('在图片工作台用她：带着角色 id 去图片工作台', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /用她/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /在图片工作台用她/ }))
    expect(push).toHaveBeenCalledWith('/studio/image?character=denia')
  })

  it('设为助手人设：头像 / 名字 / 说话方式一起从这个角色来', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /用她/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /设为助手人设/ }))
    await vi.waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0]![0]).toMatchObject({
      characterCardId: 'denia',
      nameFromCharacter: true,
      toneFromCharacter: true,
      avatarChoice: 'character',
    })
  })

  it('已经在用她：打勾、不重复写', () => {
    personaCharacterId = 'denia'
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /用她/ }))
    const item = screen.getByRole('menuitem', { name: /正在当助手人设/ })
    expect(item).toBeDisabled()
    fireEvent.click(item)
    expect(save).not.toHaveBeenCalled()
  })

  it('Esc 先收菜单，并把这次 Esc 标成已处理（不连带关掉整页详情）', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /用她/ }))
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
      bubbles: true,
    })
    act(() => {
      document.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
