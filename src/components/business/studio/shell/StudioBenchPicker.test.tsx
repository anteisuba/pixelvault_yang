import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import { StudioBenchPicker } from './StudioShellBench'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/hooks/use-studio-operator-store', () => ({
  useStudioOperatorState: () => ({ sessionId: 's1' }),
}))

describe('StudioBenchPicker（左栏「工作台」那一条，用户 10-25）', () => {
  it('六个台竖着一排，点一个进那个台（带上这段对话），点完收起', () => {
    const onPicked = vi.fn()
    render(
      <TooltipProvider>
        <StudioBenchPicker onPicked={onPicked} />
      </TooltipProvider>,
    )

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('data-bench'))).toEqual([
      'image',
      'lora',
      'audio',
      'video',
      'model3d',
      'canvas',
    ])
    expect(links[0].getAttribute('href')).toContain('c=s1')
    fireEvent.click(links[0])
    expect(onPicked).toHaveBeenCalled()
  })

  it('开着的那个台标成当前，再点 = 收台回到对话', () => {
    render(
      <TooltipProvider>
        <StudioBenchPicker activeId="lora" />
      </TooltipProvider>,
    )

    const lora = screen.getByRole('link', {
      name: 'StudioTools.tools.lora.label',
    })
    expect(lora).toHaveAttribute('aria-current', 'page')
    expect(lora.getAttribute('href')).not.toContain('/lora')
  })
})
