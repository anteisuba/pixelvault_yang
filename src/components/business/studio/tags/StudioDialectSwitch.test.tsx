import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ROUTES } from '@/constants/routes'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  dialect: 'natural' as string,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('motion/react', () => ({
  motion: { span: 'span' },
  useReducedMotion: () => true,
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({ state: { promptDialect: mocks.dialect } }),
}))

import { StudioDialectHeader } from './StudioDialectHeader'

describe('两台之间那扇门', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    mocks.dialect = 'natural'
  })

  it('两颗都在，高亮跟着当前这一台走', () => {
    render(<StudioDialectHeader />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'dialect.natural',
      'dialect.tags',
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('从自然语言台点「标签」落到标签台', () => {
    render(<StudioDialectHeader />)
    fireEvent.click(screen.getByRole('tab', { name: 'dialect.tags' }))
    expect(mocks.push).toHaveBeenCalledWith(ROUTES.STUDIO_IMAGE_TAGS)
  })

  it('从标签台点「自然语言」回得来', () => {
    mocks.dialect = 'tags'
    render(<StudioDialectHeader />)
    fireEvent.click(screen.getByRole('tab', { name: 'dialect.natural' }))
    expect(mocks.push).toHaveBeenCalledWith(ROUTES.STUDIO_IMAGE)
  })

  it('点已经站着的那一台不跳路由', () => {
    render(<StudioDialectHeader />)
    fireEvent.click(screen.getByRole('tab', { name: 'dialect.natural' }))
    expect(mocks.push).not.toHaveBeenCalled()
  })
})

/**
 * ⭐ 真机 2026-09-20：`/studio/image` 上整页查不到这对切换，标签台只能手敲地址
 * 进 —— 门只装了一侧就不是门，是单向阀。这条扫源码锁住「四个宿主都挂它」，
 * 因为渲染测只能证明装了的那一侧还在，证不了没装的那一侧。
 */
describe('四个参数宿主都挂着这扇门', () => {
  it.each([
    'src/components/business/studio/StudioPromptArea.tsx',
    'src/components/business/studio/StudioMobileComposer.tsx',
    'src/components/business/studio/tags/StudioTagsPromptArea.tsx',
    'src/components/business/studio/tags/StudioTagsMobilePanel.tsx',
  ])('%s 渲染 StudioDialectHeader', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    expect(source).toContain('<StudioDialectHeader')
  })
})
