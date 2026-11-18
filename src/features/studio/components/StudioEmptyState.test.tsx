import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  settle,
} from '@/test/studio-harness'

import { StudioEmptyState } from './StudioEmptyState'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'starter-u' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))

beforeEach(() => {
  fakeStudioServer()
})

// 起手屏（共用 StudioStarterState）：一句标题 + 一行能做什么 + 三颗例子；
// 点例子只填进真工作台的提示词（SET_PROMPT），⛔ 直接生成。
describe('StudioEmptyState', () => {
  it.each(['image', 'video'] as const)(
    '%s 台：标题 + 一行说明 + 三颗例子，点了只填输入',
    async (mode) => {
      const { container, studio } = renderWithStudio(
        <StudioEmptyState mode={mode} />,
      )
      await settle()

      expect(
        screen.getByRole('heading', {
          name: text(`StudioEmptyState.title.${mode}`),
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByText(text(`StudioEmptyState.description.${mode}`)),
      ).toBeInTheDocument()
      expect(screen.getAllByRole('button')).toHaveLength(3)
      expect(container.querySelector('.studio-empty-state')).not.toBeNull()

      const example = text(`StudioEmptyState.examples.${mode}.a`)
      fireEvent.click(screen.getByRole('button', { name: example }))
      expect(studio.current.state.prompt).toBe(example)
    },
  )

  it('标签台：例子是一串标签', async () => {
    const { studio } = renderWithStudio(<StudioEmptyState mode="tags" />)
    await settle()
    expect(screen.getByRole('heading')).toHaveTextContent(
      text('StudioEmptyState.title.tags'),
    )
    const example = text('StudioEmptyState.examples.tags.a')
    fireEvent.click(screen.getByRole('button', { name: example }))
    expect(studio.current.state.prompt).toBe(example)
  })
})
