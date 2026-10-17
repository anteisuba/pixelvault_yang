import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { CHARACTER_PAGE_TABS } from '@/constants/cards/chub-library'
import zhMessages from '@/messages/zh.json'

import { CharacterPhoneBar } from './CharacterPhoneBar'

function renderBar(
  overrides: Partial<Parameters<typeof CharacterPhoneBar>[0]> = {},
) {
  const props = {
    tab: CHARACTER_PAGE_TABS.roster,
    onTabChange: vi.fn(),
    query: '',
    onQueryChange: vi.fn(),
    searchPlaceholder: '搜角色',
    importing: false,
    onNew: vi.fn(),
    onImport: vi.fn(),
    reducedMotion: true,
    ...overrides,
  }
  render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <CharacterPhoneBar {...props} />
    </NextIntlClientProvider>,
  )
  return props
}

describe('CharacterPhoneBar（手机角色页顶上胶囊）', () => {
  it('分段：点「卡库」换页，点已选中的不动', () => {
    const props = renderBar()
    fireEvent.click(screen.getByTestId('roster-phone-tab-roster'))
    expect(props.onTabChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('roster-phone-tab-library'))
    expect(props.onTabChange).toHaveBeenCalledWith(CHARACTER_PAGE_TABS.library)
  })

  it('放大镜把胶囊换成搜索框；取消清空并收回', () => {
    const props = renderBar()
    expect(screen.queryByTestId('roster-phone-search-input')).toBeNull()
    fireEvent.click(screen.getByTestId('roster-phone-search'))
    const input = screen.getByTestId('roster-phone-search-input')
    fireEvent.change(input, { target: { value: '鸣潮' } })
    expect(props.onQueryChange).toHaveBeenCalledWith('鸣潮')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(props.onQueryChange).toHaveBeenLastCalledWith('')
    expect(screen.queryByTestId('roster-phone-search-input')).toBeNull()
  })
})
