import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import { fakeServer, message, renderWithApp } from '@/test/app-harness'

import {
  CardMacroNamesProvider,
  CharacterTextField,
} from './CharacterTextField'

// 只假边界：Clerk（没登录 → 不去取「我的资料」）与网络（助手设置里的称呼）。
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: null, isSignedIn: false, isLoaded: true }),
}))

const RAW = '{{char}}在茶馆等{{user}}。'

function renderField({
  withNames,
  addressUserAs,
}: {
  withNames: boolean
  addressUserAs: string
}) {
  fakeServer().on('GET', '/api/assistant/persona', () =>
    Response.json({
      success: true,
      data: { ...ASSISTANT_PERSONA_DEFAULTS, addressUserAs },
    }),
  )
  const onSave = vi.fn(async () => true)
  const field = <CharacterTextField label="经历" value={RAW} onSave={onSave} />
  renderWithApp(
    withNames ? (
      <CardMacroNamesProvider char="零">{field}</CardMacroNamesProvider>
    ) : (
      field
    ),
  )
  return onSave
}

// 11-19 库走查：角色页人设正文露着 `{{user}}`。
describe('CharacterTextField · 酒馆宏', () => {
  it('阅读态：{{char}} 换成她的名字，{{user}} 换成「怎么称呼你」', async () => {
    renderField({ withNames: true, addressUserAs: '小林' })
    expect(await screen.findByText('零在茶馆等小林。')).toBeInTheDocument()
    expect(screen.queryByText(RAW)).toBeNull()
  })

  it('「怎么称呼你」留空、也没有账号名：{{user}} 读作「你」', async () => {
    renderField({ withNames: true, addressUserAs: '' })
    expect(
      await screen.findByText(
        `零在茶馆等${message('StudioOperator.chat.greetingUserFallback')}。`,
      ),
    ).toBeInTheDocument()
  })

  it('编辑框里仍是原样的宏，存回去的也是原文', async () => {
    const onSave = renderField({ withNames: true, addressUserAs: '小林' })
    await screen.findByText('零在茶馆等小林。')
    fireEvent.click(
      screen.getByRole('button', {
        name: message('CharacterRoster.editField').replace('{field}', '经历'),
      }),
    )
    const box = screen.getByRole('textbox', { name: '经历' })
    expect(box).toHaveValue(RAW)
    fireEvent.change(box, { target: { value: `${RAW}又一句` } })
    fireEvent.click(
      screen.getByRole('button', {
        name: message('CharacterRoster.editorSave'),
      }),
    )
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(`${RAW}又一句`))
  })

  it('没包名字那一层：原样显示', () => {
    renderField({ withNames: false, addressUserAs: '小林' })
    expect(screen.getByText(RAW)).toBeInTheDocument()
  })
})
