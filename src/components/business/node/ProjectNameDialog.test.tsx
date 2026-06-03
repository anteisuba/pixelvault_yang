import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProjectNameDialog } from './ProjectNameDialog'

vi.mock('next-intl', () => {
  const t = (key: string) => key

  return {
    useTranslations: () => t,
  }
})

type DialogProps = React.ComponentProps<typeof ProjectNameDialog>

function renderDialog(overrides: Partial<DialogProps> = {}) {
  const props: DialogProps = {
    open: true,
    title: 'New project',
    placeholder: 'Project name',
    submitLabel: 'Create',
    cancelLabel: 'Cancel',
    defaultValue: 'Untitled project 2',
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  }
  render(<ProjectNameDialog {...props} />)
  return props
}

describe('ProjectNameDialog', () => {
  it('renders the title and seeds the input with the default value', () => {
    renderDialog({ title: 'Rename project', defaultValue: 'My project' })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Rename project')).toBeInTheDocument()
    expect(screen.getByDisplayValue('My project')).toBeInTheDocument()
  })

  it('submits the trimmed name and closes the dialog', () => {
    const onSubmit = vi.fn()
    const onOpenChange = vi.fn()
    renderDialog({ defaultValue: '', onSubmit, onOpenChange })

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  Hero shots  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith('Hero shots')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('disables submit when the name is blank', () => {
    const onSubmit = vi.fn()
    renderDialog({ defaultValue: '   ', onSubmit })

    const submit = screen.getByRole('button', { name: 'Create' })
    expect(submit).toBeDisabled()

    fireEvent.click(submit)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('closes without submitting when cancelled', () => {
    const onSubmit = vi.fn()
    const onOpenChange = vi.fn()
    renderDialog({ onSubmit, onOpenChange })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
