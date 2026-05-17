import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioAdvancedDrawer } from './StudioAdvancedDrawer'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/business/ApiKeyManager', () => ({
  ApiKeyManager: () => <div data-testid="api-key-manager" />,
}))

describe('StudioAdvancedDrawer', () => {
  it('renders API route management in the advanced drawer', () => {
    render(<StudioAdvancedDrawer open onOpenChange={vi.fn()} />)

    const dialog = screen.getByRole('dialog')

    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveClass('md:w-1/2')
    expect(dialog).toHaveClass('sm:max-w-none')
    expect(screen.getByText('sheetTitle')).toBeInTheDocument()
    expect(screen.getByText('sheetDescription')).toBeInTheDocument()
    expect(screen.getByTestId('api-key-manager')).toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: 'cardMode' }),
    ).not.toBeInTheDocument()
  })

  it('calls onOpenChange when closed', () => {
    const onOpenChange = vi.fn()
    render(<StudioAdvancedDrawer open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
