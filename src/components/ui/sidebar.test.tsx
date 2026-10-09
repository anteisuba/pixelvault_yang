import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SidebarProvider, useSidebar } from '@/components/ui/sidebar'

function StateProbe() {
  const { state } = useSidebar()
  return <span data-testid="state">{state}</span>
}

function renderSidebar() {
  render(
    <SidebarProvider defaultOpen={false}>
      <StateProbe />
      <input aria-label="field" />
    </SidebarProvider>,
  )
  return () => screen.getByTestId('state').textContent
}

describe('侧边栏快捷键', () => {
  it('[ 单键开关侧边栏', () => {
    const state = renderSidebar()
    expect(state()).toBe('collapsed')
    fireEvent.keyDown(window, { key: '[' })
    expect(state()).toBe('expanded')
    fireEvent.keyDown(window, { key: '[' })
    expect(state()).toBe('collapsed')
  })

  it('在输入框里打 [ ⛔ 开关侧边栏', () => {
    const state = renderSidebar()
    fireEvent.keyDown(screen.getByLabelText('field'), { key: '[' })
    expect(state()).toBe('collapsed')
  })

  it('带修饰键或按住连发的 [ 不算', () => {
    const state = renderSidebar()
    fireEvent.keyDown(window, { key: '[', metaKey: true })
    fireEvent.keyDown(window, { key: '[', altKey: true })
    fireEvent.keyDown(window, { key: '[', repeat: true })
    expect(state()).toBe('collapsed')
  })

  it('⌘/Ctrl+B 照旧', () => {
    const state = renderSidebar()
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(state()).toBe('expanded')
  })
})
