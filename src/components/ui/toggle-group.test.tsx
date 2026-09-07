import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { ToggleGroup, ToggleGroupItem } from './toggle-group'

function thumbs() {
  return document.querySelectorAll('[data-slot="toggle-group-thumb"]')
}

describe('ToggleGroup segmented variant', () => {
  it('renders exactly one sliding thumb, on the current segment', () => {
    render(
      <ToggleGroup type="single" variant="segmented" value="16:9">
        <ToggleGroupItem value="1:1">1:1</ToggleGroupItem>
        <ToggleGroupItem value="16:9">16:9</ToggleGroupItem>
        <ToggleGroupItem value="9:16">9:16</ToggleGroupItem>
      </ToggleGroup>,
    )
    expect(thumbs()).toHaveLength(1)
    // thumb 必须挂在当前格里 —— 挂错格等于选中态指到别人身上。
    expect(screen.getByRole('radio', { name: '16:9' })).toContainElement(
      thumbs()[0] as HTMLElement,
    )
  })

  it('moves the thumb when the controlled value changes', () => {
    const { rerender } = render(
      <ToggleGroup type="single" variant="segmented" value="1:1">
        <ToggleGroupItem value="1:1">1:1</ToggleGroupItem>
        <ToggleGroupItem value="16:9">16:9</ToggleGroupItem>
      </ToggleGroup>,
    )
    expect(screen.getByRole('radio', { name: '1:1' })).toContainElement(
      thumbs()[0] as HTMLElement,
    )
    rerender(
      <ToggleGroup type="single" variant="segmented" value="16:9">
        <ToggleGroupItem value="1:1">1:1</ToggleGroupItem>
        <ToggleGroupItem value="16:9">16:9</ToggleGroupItem>
      </ToggleGroup>,
    )
    expect(thumbs()).toHaveLength(1)
    expect(screen.getByRole('radio', { name: '16:9' })).toContainElement(
      thumbs()[0] as HTMLElement,
    )
  })

  it('still reports selection through data-state so tests and AT can read it', () => {
    const onValueChange = vi.fn()
    render(
      <ToggleGroup
        type="single"
        variant="segmented"
        value="1:1"
        onValueChange={onValueChange}
      >
        <ToggleGroupItem value="1:1">1:1</ToggleGroupItem>
        <ToggleGroupItem value="16:9">16:9</ToggleGroupItem>
      </ToggleGroup>,
    )
    expect(screen.getByRole('radio', { name: '1:1' })).toHaveAttribute(
      'data-state',
      'on',
    )
    fireEvent.click(screen.getByRole('radio', { name: '16:9' }))
    expect(onValueChange).toHaveBeenCalledWith('16:9')
  })

  it('leaves the default variant untouched (no thumb, bordered rail)', () => {
    render(
      <ToggleGroup type="single" value="a">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
      </ToggleGroup>,
    )
    expect(thumbs()).toHaveLength(0)
    expect(
      document.querySelector('[data-slot="toggle-group"]'),
    ).toHaveAttribute('data-variant', 'default')
  })
})
